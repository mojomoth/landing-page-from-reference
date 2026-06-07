// Loop E — Analyze-from-clone (LLM 없이 결정적). CLONE_SPEC.md §3/§5.1~5.3.
// 입력: clone 아티팩트(computed-styles / layout-map.desktop / design-tokens.raw / rendered-dom)만 사용.
// 출력(analysisDir): structure.json · design-tokens.json · sections.json · customizable-schema.json.
// 순수 파일 IO + 결정적 변환. 원본 텍스트 재크롤 금지(GOAL Iron Law 4). 입력 부재 시 안전 기본값.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { analysisDir, capFile, FILES } from "../paths";
import type {
  BBox,
  ComputedStyleEntry,
  LayoutMap,
  LayoutNode,
  RawDesignTokens,
} from "../clone-types";

// ───────────── 분석 산출물 형태 (CLONE_SPEC §5) ─────────────

export interface StructureSection {
  id: string;
  type: string;
  order: number;
  boundingBox: BBox;
  domSelector: string;
  visualRole: string;
  children: string[]; // 자식 섹션 id (현재는 평면 구조이므로 빈 배열)
}

export interface StructureDoc {
  page: {
    title: string;
    language: string;
    viewport: { width: number; height: number };
  };
  sections: StructureSection[];
}

export interface DesignTokensDoc {
  colors: { palette: string[]; gradients: string[] };
  typography: {
    fontFamilies: string[];
    fontSizes: string[];
    fontWeights: string[];
    lineHeights: string[];
    letterSpacings: string[];
  };
  spacing: { values: string[] };
  layout: { containerWidth: string | null; sectionGaps: string[] };
  effects: { radii: string[]; shadows: string[] };
  assets: { fonts: string[]; images: string[] };
}

export interface SectionContentBlock {
  selector: string;
  role: string;
  text: string;
  boundingBox: BBox;
}

export interface SectionDoc {
  id: string;
  type: string;
  order: number;
  boundingBox: BBox;
  domSelector: string;
  visualRole: string;
  textBlocks: SectionContentBlock[];
}

export interface EditableField {
  id: string;
  kind: "text" | "cta" | "image";
  selector: string;
  sectionId: string;
  label: string;
  currentValue: string;
  boundingBox: BBox;
  styleLocked: true;
  layoutLocked: true;
}

export interface CustomizableSchemaDoc {
  editableFields: EditableField[];
  lockedDesignRules: {
    preserveTypography: true;
    preserveSpacing: true;
    preserveLayout: true;
    preserveColorSystem: true;
    preserveMotion: true;
  };
}

// ───────────── 안전 IO 헬퍼 ─────────────

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const buf = await readFile(path, "utf8");
    const parsed = JSON.parse(buf) as unknown;
    if (parsed === null || parsed === undefined) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

function asBox(v: unknown): BBox {
  const o = (v ?? {}) as Record<string, unknown>;
  const n = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);
  return { x: n(o.x), y: n(o.y), width: n(o.width), height: n(o.height) };
}

function isLayoutNode(v: unknown): v is LayoutNode {
  return typeof v === "object" && v !== null && typeof (v as Record<string, unknown>).selector === "string";
}

function normLayoutNode(v: unknown): LayoutNode {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    selector: typeof o.selector === "string" ? o.selector : "",
    role: typeof o.role === "string" ? o.role : "",
    box: asBox(o.box),
    text: typeof o.text === "string" ? o.text : null,
    isText: o.isText === true,
  };
}

function normLayoutMap(v: unknown): LayoutMap {
  const o = (v ?? {}) as Record<string, unknown>;
  const sections = Array.isArray(o.sections) ? o.sections.filter(isLayoutNode).map(normLayoutNode) : [];
  const textBlocks = Array.isArray(o.textBlocks) ? o.textBlocks.filter(isLayoutNode).map(normLayoutNode) : [];
  const num = (x: unknown, d: number): number => (typeof x === "number" && Number.isFinite(x) ? x : d);
  return {
    viewport: o.viewport === "mobile" ? "mobile" : "desktop",
    pageWidth: num(o.pageWidth, 1440),
    pageHeight: num(o.pageHeight, 900),
    sections,
    textBlocks,
  };
}

function uniq(arr: string[]): string[] {
  return Array.from(new Set(arr.filter((s) => typeof s === "string" && s.trim() !== "")));
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

// ───────────── DOM 메타 추출 (정규식, 결정적) ─────────────

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return "";
  return m[1].replace(/\s+/g, " ").trim();
}

function extractLang(html: string): string {
  const m = html.match(/<html[^>]*\blang\s*=\s*["']?([a-zA-Z-]+)/i);
  return m ? m[1] : "";
}

// ───────────── 섹션 타입/역할 추론 (selector + 순서 + bbox, 결정적) ─────────────

function inferSectionType(node: LayoutNode, index: number, total: number): string {
  const sel = node.selector.toLowerCase();
  const role = node.role.toLowerCase();
  const hay = `${sel} ${role}`;
  const has = (k: string): boolean => hay.includes(k);

  if (has("header") || has("navbar") || has("nav")) return "header";
  if (has("footer")) return "footer";
  if (has("hero") || has("banner") || has("jumbotron")) return "hero";
  if (has("pricing") || has("price") || has("plan")) return "pricing";
  if (has("faq") || has("accordion") || has("question")) return "faq";
  if (has("testimonial") || has("review") || has("quote")) return "testimonial";
  if (has("feature") || has("benefit")) return "feature";
  if (has("card") || has("grid") || has("gallery")) return "cards";
  if (has("cta") || has("call-to-action") || has("signup") || has("subscribe")) return "cta";

  // 위치 기반 폴백: 첫 섹션은 header, 마지막은 footer, 두 번째는 hero.
  if (index === 0) return "header";
  if (index === total - 1) return "footer";
  if (index === 1) return "hero";
  return "section";
}

function inferVisualRole(node: LayoutNode, type: string): string {
  if (node.role && node.role.trim() !== "") return node.role;
  return type;
}

// ───────────── structure.json ─────────────

function buildStructure(html: string, layout: LayoutMap): StructureDoc {
  const total = layout.sections.length;
  const sections: StructureSection[] = layout.sections.map((node, i) => {
    const type = inferSectionType(node, i, total);
    return {
      id: `section-${i}`,
      type,
      order: i,
      boundingBox: node.box,
      domSelector: node.selector,
      visualRole: inferVisualRole(node, type),
      children: [],
    };
  });
  return {
    page: {
      title: extractTitle(html),
      language: extractLang(html),
      viewport: { width: layout.pageWidth, height: layout.pageHeight },
    },
    sections,
  };
}

// ───────────── design-tokens.json ─────────────

function pickContainerWidth(styles: ComputedStyleEntry[], tokens: RawDesignTokens): string | null {
  // computed-styles 에서 max-width 후보 수집 → 가장 흔한 px 값 선택. 없으면 spacing/null.
  const widths: string[] = [];
  for (const e of styles) {
    const mw = e.styles["max-width"] ?? e.styles["maxWidth"];
    if (typeof mw === "string" && mw !== "none" && /\d/.test(mw)) widths.push(mw.trim());
  }
  if (widths.length === 0) return null;
  const counts = new Map<string, number>();
  for (const w of widths) counts.set(w, (counts.get(w) ?? 0) + 1);
  let best: string | null = null;
  let bestCount = -1;
  for (const [w, c] of counts) {
    if (c > bestCount) {
      best = w;
      bestCount = c;
    }
  }
  void tokens;
  return best;
}

function buildDesignTokens(tokens: RawDesignTokens, styles: ComputedStyleEntry[]): DesignTokensDoc {
  return {
    colors: {
      palette: uniq(strArr(tokens.colors)),
      gradients: uniq(strArr(tokens.gradients)),
    },
    typography: {
      fontFamilies: uniq(strArr(tokens.fontFamilies)),
      fontSizes: uniq(strArr(tokens.fontSizes)),
      fontWeights: uniq(strArr(tokens.fontWeights)),
      lineHeights: uniq(strArr(tokens.lineHeights)),
      letterSpacings: uniq(strArr(tokens.letterSpacings)),
    },
    spacing: { values: uniq(strArr(tokens.spacings)) },
    layout: {
      containerWidth: pickContainerWidth(styles, tokens),
      sectionGaps: uniq(strArr(tokens.spacings)).slice(0, 12),
    },
    effects: {
      radii: uniq(strArr(tokens.radii)),
      shadows: uniq(strArr(tokens.shadows)),
    },
    assets: {
      // @font-face/이미지 asset 은 raw tokens 의 fontFamilies/gradients 외 별도 수집이 없으므로
      // fontFamilies 를 폰트 자산 힌트로, gradients 의 url() 을 이미지 자산 힌트로 보존.
      fonts: uniq(strArr(tokens.fontFamilies)),
      images: uniq(
        strArr(tokens.gradients)
          .flatMap((g) => Array.from(g.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)).map((m) => m[1]))
      ),
    },
  };
}

// ───────────── sections.json ─────────────

function center(b: BBox): { cx: number; cy: number } {
  return { cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
}

function pointInBox(cx: number, cy: number, b: BBox): boolean {
  return cx >= b.x && cx <= b.x + b.width && cy >= b.y && cy <= b.y + b.height;
}

// 각 텍스트 블록을 (중심 포함 → 면적 최소 포함 섹션) 우선으로 섹션에 귀속. 미포함 시 가장 가까운 섹션.
function assignTextBlocks(structure: StructureSection[], textBlocks: LayoutNode[]): Map<string, SectionContentBlock[]> {
  const map = new Map<string, SectionContentBlock[]>();
  for (const s of structure) map.set(s.id, []);

  for (const tb of textBlocks) {
    const { cx, cy } = center(tb.box);
    let chosen: StructureSection | null = null;
    let chosenArea = Number.POSITIVE_INFINITY;
    for (const s of structure) {
      if (pointInBox(cx, cy, s.boundingBox)) {
        const area = s.boundingBox.width * s.boundingBox.height;
        if (area < chosenArea) {
          chosen = s;
          chosenArea = area;
        }
      }
    }
    if (!chosen && structure.length > 0) {
      // 포함되는 섹션이 없으면 수직 거리(중심 y) 최소 섹션에 귀속.
      let bestDist = Number.POSITIVE_INFINITY;
      for (const s of structure) {
        const { cy: scy } = center(s.boundingBox);
        const d = Math.abs(scy - cy);
        if (d < bestDist) {
          bestDist = d;
          chosen = s;
        }
      }
    }
    if (chosen) {
      const list = map.get(chosen.id);
      const text = (tb.text ?? "").replace(/\s+/g, " ").trim();
      if (list && text !== "") {
        list.push({ selector: tb.selector, role: tb.role, text, boundingBox: tb.box });
      }
    }
  }
  return map;
}

function buildSections(structure: StructureSection[], blocksBySection: Map<string, SectionContentBlock[]>): SectionDoc[] {
  return structure.map((s) => ({
    id: s.id,
    type: s.type,
    order: s.order,
    boundingBox: s.boundingBox,
    domSelector: s.domSelector,
    visualRole: s.visualRole,
    textBlocks: blocksBySection.get(s.id) ?? [],
  }));
}

// ───────────── customizable-schema.json ─────────────

const CTA_HINT = /(buy|sign\s?up|sign\s?in|get\s?started|subscribe|start|join|try|download|contact|demo|learn\s?more|구매|시작|가입|신청|문의|구독|다운로드|더\s?알아보기)/i;

function classifyEditable(block: SectionContentBlock): "text" | "cta" {
  const sel = block.selector.toLowerCase();
  const role = block.role.toLowerCase();
  if (sel.includes("button") || sel.includes("btn") || role.includes("button") || sel.includes('a.') || sel.startsWith("a")) {
    if (CTA_HINT.test(block.text) || block.text.length <= 30) return "cta";
  }
  if (CTA_HINT.test(block.text) && block.text.length <= 40) return "cta";
  return "text";
}

function buildCustomizableSchema(sections: SectionDoc[]): CustomizableSchemaDoc {
  const editableFields: EditableField[] = [];
  let counter = 0;
  for (const sec of sections) {
    for (const block of sec.textBlocks) {
      const kind = classifyEditable(block);
      editableFields.push({
        id: `field-${counter++}`,
        kind,
        selector: block.selector,
        sectionId: sec.id,
        label: `${sec.type}:${kind}`,
        currentValue: block.text,
        boundingBox: block.boundingBox,
        styleLocked: true,
        layoutLocked: true,
      });
    }
  }
  return {
    editableFields,
    lockedDesignRules: {
      preserveTypography: true,
      preserveSpacing: true,
      preserveLayout: true,
      preserveColorSystem: true,
      preserveMotion: true,
    },
  };
}

// ───────────── entrypoint ─────────────

const EMPTY_TOKENS: RawDesignTokens = {
  colors: [],
  fontFamilies: [],
  fontSizes: [],
  fontWeights: [],
  lineHeights: [],
  letterSpacings: [],
  radii: [],
  shadows: [],
  gradients: [],
  spacings: [],
};

export async function analyzeFromClone(captureId: string): Promise<void> {
  const outDir = analysisDir(captureId);
  await mkdir(outDir, { recursive: true });

  // 입력 로드 (전부 안전 기본값).
  const html = await readText(capFile(captureId, FILES.renderedDom));
  const layout = normLayoutMap(
    await readJson<unknown>(capFile(captureId, FILES.layoutMapDesktop), {})
  );
  const rawTokens = await readJson<RawDesignTokens>(
    capFile(captureId, FILES.rawTokens),
    EMPTY_TOKENS
  );
  const computedRaw = await readJson<unknown>(capFile(captureId, FILES.computedStyles), []);
  const computedStyles: ComputedStyleEntry[] = Array.isArray(computedRaw)
    ? computedRaw
        .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
        .map((o) => {
          const styles = (o.styles ?? {}) as Record<string, unknown>;
          const norm: Record<string, string> = {};
          for (const [k, val] of Object.entries(styles)) {
            if (typeof val === "string") norm[k] = val;
          }
          return { selector: typeof o.selector === "string" ? o.selector : "", styles: norm };
        })
    : [];

  // 변환.
  const structure = buildStructure(html, layout);
  const designTokens = buildDesignTokens(rawTokens, computedStyles);
  const blocksBySection = assignTextBlocks(structure.sections, layout.textBlocks);
  const sections = buildSections(structure.sections, blocksBySection);
  const customizableSchema = buildCustomizableSchema(sections);

  // 출력 (결정적, pretty JSON).
  const write = (name: string, data: unknown): Promise<void> =>
    writeFile(`${outDir}/${name}`, JSON.stringify(data, null, 2) + "\n", "utf8");

  await Promise.all([
    write("structure.json", structure),
    write("design-tokens.json", designTokens),
    write("sections.json", sections),
    write("customizable-schema.json", customizableSchema),
  ]);
}
