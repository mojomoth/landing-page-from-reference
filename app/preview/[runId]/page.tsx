// 영속 프리뷰 — DB 의 최신 분석 JSON 으로 랜딩을 서버 렌더 (검증 사다리 7단계).
import { getRun, getAnalysis } from "@/lib/db";
import { LandingRenderer } from "@/components/LandingRenderer";

export const dynamic = "force-dynamic";

export default async function PreviewPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const run = getRun(runId);
  const analysis = getAnalysis(runId);

  if (!run || !analysis) {
    return (
      <main style={{ padding: 48, fontFamily: "system-ui, sans-serif", color: "#333" }}>
        <h2>프리뷰 준비 안 됨</h2>
        <p>
          run <code>{runId}</code> 의 분석 결과가 아직 없습니다. 워크스페이스에서 먼저 분석을 실행하세요.
        </p>
      </main>
    );
  }

  return <LandingRenderer analysis={analysis} />;
}
