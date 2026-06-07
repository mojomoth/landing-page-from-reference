// /api/clone-analyze — POST {captureId}: Loop E (Analyze-from-clone) 진입점.
// 가드레일(GOAL §3): verification.json 의 overallPassed!==true 면 분석 차단(409).
// 통과 시에만 analyzeFromClone 실행 → analysisDir 의 4개 산출물 JSON 을 읽어 반환.
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { analyzeFromClone } from "@/lib/analyze/from-clone";
import { analysisDir, capFile, FILES } from "@/lib/paths";
import type { VerificationResult } from "@/lib/clone-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// analysisDir(id) 의 표준 산출물 파일명 (analyzeFromClone 가 생성).
const ANALYSIS_FILES = {
  structure: "structure.json",
  designTokens: "design-tokens.json",
  sections: "sections.json",
  customizableSchema: "customizable-schema.json",
} as const;

// 안전 JSON 읽기 — 부재/파싱 실패 시 null.
async function readJsonSafe<T = unknown>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const captureId = String(body.captureId ?? "").trim();
  if (!captureId) {
    return Response.json({ error: "captureId 필수" }, { status: 400 });
  }

  // 존재하지 않는 captureId → verification.json 부재로 404.
  const verificationPath = capFile(captureId, FILES.verification);
  if (!existsSync(verificationPath)) {
    return Response.json(
      { error: `captureId 없음 또는 검증 결과 부재(${captureId})` },
      { status: 404 },
    );
  }

  // 가드레일: overallPassed!==true 면 분석 차단(GOAL §3).
  const verification = await readJsonSafe<VerificationResult>(verificationPath);
  if (!verification || verification.overallPassed !== true) {
    return Response.json(
      { error: "clone 미통과 — 분석 차단(GOAL §3)" },
      { status: 409 },
    );
  }

  // 통과 — 분석 실행 (LLM 없이 결정적, clone 아티팩트만 입력).
  try {
    await analyzeFromClone(captureId);
  } catch (e) {
    return Response.json(
      { error: `분석 실패: ${(e as Error).message}`, captureId },
      { status: 500 },
    );
  }

  // analysisDir 산출물 읽어 반환.
  const dir = analysisDir(captureId);
  const [structure, designTokens, sections, customizableSchema] =
    await Promise.all([
      readJsonSafe(`${dir}/${ANALYSIS_FILES.structure}`),
      readJsonSafe(`${dir}/${ANALYSIS_FILES.designTokens}`),
      readJsonSafe(`${dir}/${ANALYSIS_FILES.sections}`),
      readJsonSafe(`${dir}/${ANALYSIS_FILES.customizableSchema}`),
    ]);

  return Response.json({
    captureId,
    structure,
    designTokens,
    sections,
    customizableSchema,
  });
}
