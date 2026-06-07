// Agent: Customization — 자연어 → CustomizationPatch, 그리고 patch 를 분석에 적용.
// 사용자 JSON 은 덮어쓰지 않고 patch 로만 변경 (GOAL.md Iron Law 4).
import { structuredJson, hasApiKey } from "../openai";
import { validatePatch } from "../validate";
import { normalizeAnalysis } from "../schema";
import { mockPatch } from "../mock";
import patchSchema from "../../schemas/patch.schema.json";
import type { LandingReferenceAnalysis, CustomizationPatch, PatchOperation } from "../schema";

export async function customize(
  instruction: string,
  analysis: LandingReferenceAnalysis,
): Promise<{ patch: CustomizationPatch; mode: "openai" | "mock" }> {
  if (hasApiKey()) {
    try {
      const system =
        "너는 랜딩 커스터마이저다. 현재 분석 JSON 과 사용자 지시를 받아 변경을 operations 배열로 만든다. " +
        "path 는 분석 객체 루트 기준 JSON Pointer 다 (예: /structure/sections/0/content/headline, /designSystem/spacing/sectionGap). " +
        'value 는 반드시 JSON 인코딩된 문자열이다 (문자열이면 따옴표 포함, 예: "\\"새 헤드라인\\""; 객체/배열이면 그 JSON 문자열). ' +
        "remove 면 value 는 null. 원본 자산 복사 금지, 카피는 한국어.";
      const user = `현재 분석 JSON:\n${JSON.stringify(analysis)}\n\n사용자 지시: ${instruction}\n\n위 지시를 반영하는 operations 를 만들어라.`;

      const raw = await structuredJson<CustomizationPatch>({
        schema: patchSchema as Record<string, unknown>,
        schemaName: "CustomizationPatch",
        system,
        user,
      });
      const v = validatePatch(raw);
      if (!v.ok) throw new Error("patch schema 검증 실패");
      return { patch: v.data, mode: "openai" };
    } catch {
      // 폴백 (조기 정지 금지)
    }
  }
  return { patch: mockPatch(instruction, analysis), mode: "mock" };
}

// ───────────── JSON Pointer 기반 patch 적용 ─────────────
// 지원: 숫자 인덱스, 섹션 id 세그먼트(/structure/sections/sec-hero/...), "/sections/" 단축.
function tokenize(path: string): string[] {
  let p = path;
  if (p.startsWith("/sections/")) p = "/structure" + p;
  return p
    .split("/")
    .filter((t) => t.length > 0)
    .map((t) => t.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function indexInArray(arr: unknown[], token: string): number {
  if (/^\d+$/.test(token)) return Number(token);
  return arr.findIndex((el) => !!el && typeof el === "object" && (el as { id?: unknown }).id === token);
}

function applyOp(root: unknown, op: PatchOperation): void {
  const toks = tokenize(op.path);
  if (toks.length === 0) return;
  /* eslint-disable @typescript-eslint/no-explicit-any */
  let parent: any = root;
  for (let i = 0; i < toks.length - 1; i++) {
    const t = toks[i];
    parent = Array.isArray(parent) ? parent[indexInArray(parent, t)] : parent[t];
    if (parent === null || typeof parent !== "object") throw new Error(`경로 없음: ${op.path}`);
  }
  const lastTok = toks[toks.length - 1];
  const value = op.value == null ? null : JSON.parse(op.value);

  if (Array.isArray(parent)) {
    const idx = lastTok === "-" ? parent.length : indexInArray(parent, lastTok);
    if (op.op === "remove") {
      if (idx >= 0) parent.splice(idx, 1);
    } else {
      parent[idx < 0 ? parent.length : idx] = value;
    }
  } else {
    if (op.op === "remove") delete parent[lastTok];
    else parent[lastTok] = value;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export function applyPatch(analysis: LandingReferenceAnalysis, patch: CustomizationPatch): LandingReferenceAnalysis {
  const draft = structuredClone(analysis) as unknown;
  for (const op of patch.operations) {
    try {
      applyOp(draft, op);
    } catch {
      // 잘못된 op 는 건너뜀 — 부분 적용 허용 (데이터 파괴 방지)
    }
  }
  return normalizeAnalysis(draft);
}
