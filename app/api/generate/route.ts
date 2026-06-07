// /api/generate — POST {runId}: 코드 스냅샷 산출 + completed (generation 버전 +1)
import { getRun, getAnalysis, setAnalysis, setStatus, appendHistory } from "@/lib/db";
import { generatePageCode } from "@/lib/agents/generator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const run = getRun(String(body.runId ?? ""));
  if (!run) return Response.json({ error: "run 없음" }, { status: 404 });

  const analysis = getAnalysis(run.id);
  if (!analysis) return Response.json({ error: "분석 결과가 먼저 필요합니다" }, { status: 400 });

  setStatus(run.id, "generating");
  const { codePath } = await generatePageCode(run.id, analysis);
  setAnalysis(run.id, analysis, "generation");
  setStatus(run.id, "completed");
  appendHistory(run.id, "generation", { codePath });
  return Response.json({ run: getRun(run.id), previewUrl: `/preview/${run.id}`, codePath });
}
