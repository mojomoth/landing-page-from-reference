// /api/clone-status — GET ?captureId=: 캡처/검증/분석 상태 종합 조회.
// meta.json + verification.json + (있으면) analysisDir 의 customizable-schema.json / structure.json 을 읽어 반환.
// 부재 필드는 null. 존재하지 않는 captureId 는 404.
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { analysisDir, captureDir, capFile, FILES } from "@/lib/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// analysisDir 산출물 파일명.
const ANALYSIS_FILES = {
  structure: "structure.json",
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

export async function GET(req: Request) {
  const captureId = (new URL(req.url).searchParams.get("captureId") ?? "").trim();
  if (!captureId) {
    return Response.json({ error: "captureId 필수" }, { status: 400 });
  }

  // 존재하지 않는 captureId → 캡처 디렉터리 부재로 404.
  if (!existsSync(captureDir(captureId))) {
    return Response.json(
      { error: `captureId 없음(${captureId})` },
      { status: 404 },
    );
  }

  const dir = analysisDir(captureId);
  const [meta, verification, customizableSchema, structure] = await Promise.all([
    readJsonSafe(capFile(captureId, FILES.meta)),
    readJsonSafe(capFile(captureId, FILES.verification)),
    readJsonSafe(`${dir}/${ANALYSIS_FILES.customizableSchema}`),
    readJsonSafe(`${dir}/${ANALYSIS_FILES.structure}`),
  ]);

  return Response.json({
    captureId,
    meta,
    verification,
    customizableSchema,
    structure,
  });
}
