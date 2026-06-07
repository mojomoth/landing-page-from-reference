// Loop F — applyCustomization: clone 디자인 구조를 유지한 채 콘텐츠(텍스트/CTA/이미지)만 교체.
// 입력: capFile(id, FILES.clone)(clone.html) + analysisDir(id)/customizable-schema.json.
// 규칙(GOAL Iron Law 5): CSS/구조/클래스/스타일/레이아웃 절대 변경 금지. 콘텐츠 문자열만 치환.
// 출력: customizationDir(id)/customized-page.html (asset 절대경로 /captures/{id}/assets/ 유지)
//      + customizationDir(id)/customized-content.json (적용된 edits 기록).
// LLM 미관여. 순수 문자열 변환 + 파일 IO. 결정적.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { analysisDir, customizationDir, capFile, FILES } from "../paths";

// from-clone.ts 의 CustomizableSchemaDoc / EditableField 거울 (런타임 입력 검증용 최소 형태).
interface EditableFieldLike {
  id: string;
  kind: "text" | "cta" | "image";
  selector: string;
  currentValue: string;
}
interface CustomizableSchemaLike {
  editableFields: EditableFieldLike[];
}

export interface CustomizationEdit {
  id: string;
  kind: "text" | "cta" | "image";
  value: string;
}

export interface AppliedEdit {
  id: string;
  kind: "text" | "cta" | "image";
  selector: string;
  previousValue: string;
  newValue: string;
  applied: boolean;
  strategy: "exact" | "escaped" | "whitespace" | "img-src" | "none";
  reason?: string;
}

export interface ApplyCustomizationResult {
  customizedHtmlPath: string;
  customizedHtmlWebPath: string;
  applied: AppliedEdit[];
  total: number;
  appliedCount: number;
}

const CUSTOMIZED_HTML = "customized-page.html";
const CUSTOMIZED_CONTENT = "customized-content.json";

// ───────────── HTML escape / regex 헬퍼 ─────────────

// HTML 텍스트 노드에서 &, <, > 가 엔티티로 직렬화된 변형을 만든다(따옴표는 텍스트 노드에서 보통 그대로).
function htmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// currentValue 는 분석 단계에서 textContent → \s+ → " " 로 정규화된 값이다.
// 원본 HTML 은 줄바꿈/연속 공백/인라인 태그(<br>,<span>) 등으로 토큰 사이가 벌어져 있고,
// textContent 가 <br> 를 공백 없이 흡수해 "제품을더" 처럼 공백 경계가 사라진 경우도 있다.
// 따라서: (1) 공백 run 은 "공백/엔티티/인라인태그 1회 이상" 으로, (2) 인접 글자 사이에도
// "인라인태그/엔티티 0회 이상" 을 허용하는 char-aware 정규식을 만든다(정확 콘텐츠 1회 매치용).
function flexibleContentRegex(normalized: string): RegExp {
  const chars = Array.from(normalized);
  if (chars.length === 0) return /a^/; // 매치 불가(빈 값)
  const interTag = "(?:<[^>]*>|&nbsp;|&#160;)*"; // 글자 사이 끼어든 인라인 태그/엔티티(0회+)
  const wsRun = "(?:\\s|&nbsp;|&#160;|<[^>]*>)+"; // 공백 run(1회+)
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    if (/\s/.test(c)) {
      // 연속 공백은 normalized 단계에서 1칸으로 합쳐졌으므로 단일 공백 run 으로 처리.
      out += wsRun;
      // 뒤따르는 추가 공백(이론상 없음) 건너뜀.
      while (i + 1 < chars.length && /\s/.test(chars[i + 1])) i++;
    } else {
      out += escapeRegExp(c);
      // 마지막 글자 뒤에는 인터태그 불필요.
      if (i < chars.length - 1 && !/\s/.test(chars[i + 1])) out += interTag;
    }
  }
  return new RegExp(out);
}

// 첫 1회만 치환하는 안전 replace (String.replace 의 함수 콜백으로 1회 보장).
function replaceFirstLiteral(haystack: string, needle: string, replacement: string): { out: string; ok: boolean } {
  const idx = haystack.indexOf(needle);
  if (idx === -1) return { out: haystack, ok: false };
  const out = haystack.slice(0, idx) + replacement + haystack.slice(idx + needle.length);
  return { out, ok: true };
}

// 함수 콜백으로 1회만 치환. 콜백이 반환하는 문자열은 literal(=$1 역참조 미확장)이므로
// newValue 안의 '$' 도 그대로 보존된다(텍스트 안전). 그룹이 필요한 경우는 별도 헬퍼 사용.
function replaceFirstRegex(haystack: string, re: RegExp, replacement: string): { out: string; ok: boolean } {
  let done = false;
  const out = haystack.replace(re, (m) => {
    if (done) return m;
    done = true;
    return replacement;
  });
  return { out, ok: done };
}

// <img ... src="OLD" ...> 의 src 값만 1회 교체(앞/뒤 캡처 그룹 보존, newValue 는 literal).
function replaceFirstWithGroups(
  haystack: string,
  re: RegExp,
  build: (m: RegExpMatchArray) => string,
): { out: string; ok: boolean } {
  let done = false;
  const out = haystack.replace(re, (...args: unknown[]) => {
    if (done) return args[0] as string;
    done = true;
    // args = [full, g1, g2, ..., offset, string]; RegExpMatchArray 형태로 정규화.
    const groups = args.slice(0, -2) as string[];
    return build(groups as unknown as RegExpMatchArray);
  });
  return { out, ok: done };
}

// ───────────── 텍스트/CTA 치환 ─────────────
// CSS/구조/클래스 불변: 텍스트 콘텐츠 문자열만 교체. 새 값은 HTML escape 하여 주입(구조 안정).
function applyTextEdit(
  html: string,
  field: EditableFieldLike,
  newValue: string,
): { html: string; strategy: AppliedEdit["strategy"]; ok: boolean } {
  const current = field.currentValue ?? "";
  const replacement = htmlEscape(newValue);

  // 1) 가장 안전: currentValue 문자열을 HTML 에서 1회 literal 치환.
  if (current.trim() !== "") {
    const exact = replaceFirstLiteral(html, current, replacement);
    if (exact.ok) return { html: exact.out, strategy: "exact", ok: true };

    // 2) currentValue 자체가 엔티티를 포함했을 수 있어 escaped 변형으로 재시도.
    const escapedNeedle = htmlEscape(current);
    if (escapedNeedle !== current) {
      const esc = replaceFirstLiteral(html, escapedNeedle, replacement);
      if (esc.ok) return { html: esc.out, strategy: "escaped", ok: true };
    }

    // 3) 인라인태그/공백 유연 정규식(예: "제품을<br>더" 처럼 글자 사이 <br> 흡수된 형태).
    const re = flexibleContentRegex(current);
    const flex = replaceFirstRegex(html, re, replacement);
    if (flex.ok) return { html: flex.out, strategy: "whitespace", ok: true };
  }

  return { html, strategy: "none", ok: false };
}

// ───────────── 이미지 src 치환 ─────────────
// selector 기반으로 해당 <img> 의 src 속성만 교체. CSS/구조 불변.
function applyImageEdit(
  html: string,
  field: EditableFieldLike,
  newValue: string,
): { html: string; strategy: AppliedEdit["strategy"]; ok: boolean } {
  // currentValue 가 기존 src 문자열이면 그 src 를 직접 1회 치환(가장 안전).
  const current = (field.currentValue ?? "").trim();
  if (current !== "") {
    // src="..."/src='...' 안에서 current 가 src 로 쓰인 첫 img 의 src 만 교체.
    const re = new RegExp(`(<img\\b[^>]*\\bsrc\\s*=\\s*["'])${escapeRegExp(current)}(["'])`, "i");
    const r = replaceFirstWithGroups(html, re, (g) => `${g[1]}${newValue}${g[2]}`);
    if (r.ok) return { html: r.out, strategy: "img-src", ok: true };
  }

  // selector 기반 폴백: selector 의 마지막 토큰에서 추출한 id/class 를 가진 <img> 의 src 만 교체.
  // 속성 순서(class 가 src 앞/뒤)를 모두 처리하기 위해 매칭된 <img> 태그 내부에서 src 만 1회 치환.
  const hint = selectorImgHint(field.selector);
  const imgTagRe = imgTagWithHint(hint);
  if (imgTagRe) {
    let done = false;
    const r = html.replace(imgTagRe, (tag: string) => {
      if (done) return tag;
      const swapped = swapSrcInTag(tag, newValue);
      if (swapped === null) return tag;
      done = true;
      return swapped;
    });
    if (done) return { html: r, strategy: "img-src", ok: true };
  }

  // 최후: 문서의 첫 <img src="..."> 의 src 만 교체.
  const firstImg = /(<img\b[^>]*?\bsrc\s*=\s*["'])([^"']*)(["'])/i;
  const r2 = replaceFirstWithGroups(html, firstImg, (g) => `${g[1]}${newValue}${g[3]}`);
  if (r2.ok) return { html: r2.out, strategy: "img-src", ok: true };

  return { html, strategy: "none", ok: false };
}

// 단일 <img ...> 태그 문자열 안에서 src 속성값만 교체. src 없으면 null.
function swapSrcInTag(tag: string, newValue: string): string | null {
  const re = /(\bsrc\s*=\s*["'])([^"']*)(["'])/i;
  if (!re.test(tag)) return null;
  return tag.replace(re, `$1${newValue}$3`);
}

// selector(예: "div.hero-art:nth-child(2) > img.foo") 에서 img 식별 힌트 추출.
function selectorImgHint(selector: string): { id?: string; cls?: string } {
  const parts = selector.split(">").map((p) => p.trim()).reverse();
  // img 를 포함하는 토큰을 우선, 없으면 마지막(=배열 첫) 토큰.
  const last =
    parts.find((p) => p.toLowerCase().startsWith("img")) ?? parts[0] ?? "";
  const idMatch = last.match(/#([A-Za-z0-9_-]+)/);
  const clsMatch = last.match(/\.([A-Za-z0-9_-]+)/);
  return { id: idMatch?.[1], cls: clsMatch?.[1] };
}

// 힌트(id/class)를 가진 <img ...> 태그 전체를 매칭하는 정규식. 힌트 없으면 null.
function imgTagWithHint(hint: { id?: string; cls?: string }): RegExp | null {
  if (hint.id) {
    return new RegExp(`<img\\b[^>]*\\bid\\s*=\\s*["']${escapeRegExp(hint.id)}["'][^>]*>`, "i");
  }
  if (hint.cls) {
    return new RegExp(
      `<img\\b[^>]*\\bclass\\s*=\\s*["'][^"']*\\b${escapeRegExp(hint.cls)}\\b[^"']*["'][^>]*>`,
      "i",
    );
  }
  return null;
}

// ───────────── entrypoint ─────────────

export async function applyCustomization(
  captureId: string,
  edits: CustomizationEdit[],
): Promise<ApplyCustomizationResult> {
  const outDir = customizationDir(captureId);
  await mkdir(outDir, { recursive: true });

  // 입력 로드.
  let html = await readFile(capFile(captureId, FILES.clone), "utf8");
  const schema = await readSchema(captureId);
  const fieldById = new Map<string, EditableFieldLike>();
  for (const f of schema.editableFields) fieldById.set(f.id, f);

  const applied: AppliedEdit[] = [];

  for (const edit of Array.isArray(edits) ? edits : []) {
    const field = fieldById.get(edit.id);
    if (!field) {
      applied.push({
        id: edit.id,
        kind: edit.kind,
        selector: "",
        previousValue: "",
        newValue: edit.value,
        applied: false,
        strategy: "none",
        reason: "schema.editableFields 에서 id 미발견",
      });
      continue;
    }

    // edit.kind 가 schema 와 다르면 schema 우선(이미지/텍스트 분기 안전).
    const kind = field.kind === "image" ? "image" : edit.kind === "image" ? "image" : field.kind;

    let res: { html: string; strategy: AppliedEdit["strategy"]; ok: boolean };
    if (kind === "image") {
      res = applyImageEdit(html, field, edit.value);
    } else {
      res = applyTextEdit(html, field, edit.value);
    }
    html = res.html;

    applied.push({
      id: edit.id,
      kind,
      selector: field.selector,
      previousValue: field.currentValue ?? "",
      newValue: edit.value,
      applied: res.ok,
      strategy: res.strategy,
      reason: res.ok ? undefined : "치환 대상 문자열을 clone.html 에서 찾지 못함",
    });
  }

  // 출력 저장.
  const customizedHtmlPath = join(outDir, CUSTOMIZED_HTML);
  await writeFile(customizedHtmlPath, html, "utf8");

  const appliedCount = applied.filter((a) => a.applied).length;
  const contentRecord = {
    captureId,
    createdAt: new Date().toISOString(),
    total: applied.length,
    appliedCount,
    edits: applied,
  };
  await writeFile(
    join(outDir, CUSTOMIZED_CONTENT),
    JSON.stringify(contentRecord, null, 2) + "\n",
    "utf8",
  );

  return {
    customizedHtmlPath,
    customizedHtmlWebPath: `/customizations/${captureId}/${CUSTOMIZED_HTML}`,
    applied,
    total: applied.length,
    appliedCount,
  };
}

async function readSchema(captureId: string): Promise<CustomizableSchemaLike> {
  try {
    const buf = await readFile(join(analysisDir(captureId), "customizable-schema.json"), "utf8");
    const parsed = JSON.parse(buf) as unknown;
    const fields = (parsed as { editableFields?: unknown })?.editableFields;
    const editableFields: EditableFieldLike[] = Array.isArray(fields)
      ? fields
          .filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null)
          .map((f): EditableFieldLike => ({
            id: typeof f.id === "string" ? f.id : "",
            kind: f.kind === "cta" ? "cta" : f.kind === "image" ? "image" : "text",
            selector: typeof f.selector === "string" ? f.selector : "",
            currentValue: typeof f.currentValue === "string" ? f.currentValue : "",
          }))
          .filter((f) => f.id !== "")
      : [];
    return { editableFields };
  } catch {
    return { editableFields: [] };
  }
}
