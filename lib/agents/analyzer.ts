// Agent: Design Extractor + Structure Mapper (단일 프로세스에서 통합).
// 스크린샷(vision) + 텍스트 → LandingReferenceAnalysis. 실패/키부재 시 mock 폴백.
import { structuredJson, hasApiKey } from "../openai";
import { validateAnalysis } from "../validate";
import { normalizeAnalysis } from "../schema";
import { mockAnalysis } from "../mock";
import analysisSchema from "../../schemas/analysis.schema.json";
import type { LandingReferenceAnalysis } from "../schema";
import type { CaptureResult } from "./crawler";

export interface AnalyzeInput {
  url: string;
  goal: string;
  capture: CaptureResult;
}

export async function analyzeReference(input: AnalyzeInput): Promise<{ analysis: LandingReferenceAnalysis; mode: "openai" | "mock" }> {
  if (hasApiKey()) {
    try {
      const system =
        "너는 시니어 웹 디자인 분석가다. 레퍼런스의 스크린샷과 텍스트를 보고 디자인 시스템(색·타이포·간격·시각 스타일)과 섹션 구조를 추출한다. " +
        "원본의 이미지/문구/로고를 그대로 복사하지 말고 레이아웃·시각 토큰만 재해석하라. 모든 카피는 한국어로, 사용자의 목적/브랜드에 맞춰 새로 작성한다.";
      const user =
        `레퍼런스 URL: ${input.url}\n사용자 목적/브랜드: ${input.goal || "(미지정)"}\n\n` +
        `페이지 텍스트(발췌):\n${input.capture.domText.slice(0, 3000) || "(텍스트 없음 — 스크린샷과 일반 랜딩 패턴으로 추론)"}\n\n` +
        `위를 바탕으로 header, hero, feature 또는 cards, pricing, faq, footer 를 포함한 5~7개 섹션의 랜딩 분석 JSON 을 만들어라. ` +
        `각 섹션의 content(headline/body/ctas/items)를 사용자 목적에 맞게 채워라.`;
      const imagesDataUrls = input.capture.screenshotDataUrl ? [input.capture.screenshotDataUrl] : [];

      const raw = await structuredJson<LandingReferenceAnalysis>({
        schema: analysisSchema as Record<string, unknown>,
        schemaName: "LandingReferenceAnalysis",
        system,
        user,
        imagesDataUrls,
      });

      // source 는 신뢰 가능한 값으로 강제하고, 전체를 정규화 후 검증.
      const normalized = normalizeAnalysis({
        ...raw,
        source: { url: input.url, capturedAt: new Date().toISOString(), viewport: "desktop" },
      });
      const v = validateAnalysis(normalized);
      if (!v.ok) throw new Error("분석 schema 검증 실패: " + v.errors.slice(0, 3).join("; "));
      return { analysis: normalized, mode: "openai" };
    } catch {
      // 폴백으로 진행 (조기 정지 금지)
    }
  }
  return { analysis: mockAnalysis(input.url, input.goal), mode: "mock" };
}
