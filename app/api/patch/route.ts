// /api/patch — POST {runId, instruction}: 자연어 → patch → 적용 (customization 버전 +1)
import { getRun, getAnalysis, setAnalysis, appendHistory } from "@/lib/db";
import { customize, applyPatch } from "@/lib/agents/customizer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const run = getRun(String(body.runId ?? ""));
  if (!run) return Response.json({ error: "run 없음" }, { status: 404 });

  const analysis = getAnalysis(run.id);
  if (!analysis) return Response.json({ error: "분석 결과가 먼저 필요합니다" }, { status: 400 });

  const instruction = String(body.instruction ?? "").trim();
  if (!instruction) return Response.json({ error: "instruction 필수" }, { status: 400 });

  const { patch, mode } = await customize(instruction, analysis);
  const next = applyPatch(analysis, patch);
  setAnalysis(run.id, next, "customization");
  appendHistory(run.id, "patch", { instruction, mode, operations: patch.operations });
  return Response.json({ run: getRun(run.id), analysis: next, patch, mode });
}
