// /api/clone — POST {url, captureId?}: Loop A/B/C/D 구동.
// captureAndClone(원본 캡처+에셋 mirror+clone 생성) → verifyClone(clone 재캡처+≥90% 검증).
import { captureAndClone } from "@/lib/capture/pipeline";
import { verifyClone } from "@/lib/verify/verify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function genId(): string {
  return `cap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const url = String(body.url ?? "").trim();
  if (!url) return Response.json({ error: "url 필수" }, { status: 400 });

  const captureId = body.captureId ? String(body.captureId) : genId();
  const origin = new URL(req.url).origin;

  try {
    const meta = await captureAndClone(captureId, url, url);
    const verification = await verifyClone(captureId, origin);
    return Response.json({ captureId, meta, verification });
  } catch (e) {
    return Response.json(
      { error: `clone 파이프라인 실패: ${(e as Error).message}`, captureId },
      { status: 500 },
    );
  }
}
