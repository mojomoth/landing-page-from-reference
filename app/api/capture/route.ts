// /api/capture — POST {runId}: Reference Crawler 실행
import { getRun, setStatus, appendHistory } from "@/lib/db";
import { captureReference } from "@/lib/agents/crawler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const run = getRun(String(body.runId ?? ""));
  if (!run) return Response.json({ error: "run 없음" }, { status: 404 });

  setStatus(run.id, "capturing");
  const cap = await captureReference(run.id, run.referenceUrl);
  appendHistory(run.id, "capture", { fallback: cap.fallback, summary: cap.summary, screenshotPath: cap.screenshotPath });
  return Response.json({ ok: cap.ok, fallback: cap.fallback, summary: cap.summary, screenshotPath: cap.screenshotPath });
}
