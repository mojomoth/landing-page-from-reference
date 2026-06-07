// /api/runs/[id] — GET (run+analysis+history), PUT (컨트롤 편집 저장)
import { getRun, getAnalysis, listHistory, setAnalysis, appendHistory } from "@/lib/db";
import { validateAnalysis } from "@/lib/validate";
import { normalizeAnalysis } from "@/lib/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const run = getRun(id);
  if (!run) return Response.json({ error: "run 없음" }, { status: 404 });
  return Response.json({ run, analysis: getAnalysis(id), history: listHistory(id) });
}

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const run = getRun(id);
  if (!run) return Response.json({ error: "run 없음" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const normalized = normalizeAnalysis(body.analysis);
  const v = validateAnalysis(normalized);
  if (!v.ok) return Response.json({ error: "분석 검증 실패", details: v.errors }, { status: 400 });

  setAnalysis(id, normalized, "customization");
  appendHistory(id, "edit", { via: "controls" });
  return Response.json({ run: getRun(id), analysis: normalized });
}
