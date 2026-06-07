// /api/analyze — POST {runId}: Design Extractor + Structure Mapper
import { getRun, setStatus, setAnalysis, appendHistory } from "@/lib/db";
import { loadCapture, captureReference } from "@/lib/agents/crawler";
import { analyzeReference } from "@/lib/agents/analyzer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const run = getRun(String(body.runId ?? ""));
  if (!run) return Response.json({ error: "run 없음" }, { status: 404 });

  setStatus(run.id, "analyzing");
  const capture = (await loadCapture(run.id)) ?? (await captureReference(run.id, run.referenceUrl));
  const { analysis, mode } = await analyzeReference({ url: run.referenceUrl, goal: run.userGoal, capture });

  setAnalysis(run.id, analysis, "analysis");
  setStatus(run.id, "customizing");
  appendHistory(run.id, "analysis", { mode, sections: analysis.structure.sections.length });
  return Response.json({ run: getRun(run.id), analysis, mode });
}
