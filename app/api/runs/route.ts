// /api/runs — GET 목록, POST 생성
import { listRuns, createRun } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ runs: listRuns() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const referenceUrl = String(body.referenceUrl ?? "").trim();
  const userGoal = String(body.userGoal ?? "").trim();
  if (!referenceUrl) return Response.json({ error: "referenceUrl 필수" }, { status: 400 });
  const run = createRun({ referenceUrl, userGoal });
  return Response.json({ run });
}
