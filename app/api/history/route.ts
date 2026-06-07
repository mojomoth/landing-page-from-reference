// /api/history?runId= — GET: 작업 기록
import { listHistory } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const runId = new URL(req.url).searchParams.get("runId") ?? "";
  if (!runId) return Response.json({ error: "runId 필수" }, { status: 400 });
  return Response.json({ history: listHistory(runId) });
}
