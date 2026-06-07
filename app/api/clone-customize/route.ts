// /api/clone-customize — POST {captureId, edits}: Loop F/G (콘텐츠 커스터마이징 + 디자인 유지검증).
// applyCustomization(captureId, edits)(콘텐츠만 수정, 디자인 잠금 — GOAL §5) →
// verifyRetention(captureId, origin)(텍스트 영역 마스킹 후 token/layout/typo/spacing/color/component 유지 비교) →
// 반환 {customizedHtmlWebPath, retention}.
import { existsSync } from "node:fs";
import {
  applyCustomization,
  type CustomizationEdit,
} from "@/lib/customize/customize";
import { verifyRetention } from "@/lib/customize/retention";
import { capFile, FILES } from "@/lib/paths";
import type { DesignRetentionResult } from "@/lib/clone-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// 커스터마이즈 산출물 표준 파일명 (CLONE_SPEC §1).
const CUSTOMIZED_HTML = "customized-page.html";

// body.edits 를 CustomizationEdit[] 로 안전 정규화 (배열만 허용, 형태 검증).
function normalizeEdits(raw: unknown): CustomizationEdit[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomizationEdit[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id : "";
    if (id === "") continue;
    const kind: CustomizationEdit["kind"] =
      o.kind === "cta" ? "cta" : o.kind === "image" ? "image" : "text";
    const value = typeof o.value === "string" ? o.value : String(o.value ?? "");
    out.push({ id, kind, value });
  }
  return out;
}

// applyCustomization 결과에서 web path 를 추출. 없으면 customizations/ 규약으로 폴백.
function resolveCustomizedWebPath(captureId: string, applyResult: unknown): string {
  if (applyResult && typeof applyResult === "object") {
    const v = (applyResult as Record<string, unknown>).customizedHtmlWebPath;
    if (typeof v === "string" && v.trim() !== "") return v;
  }
  return `/customizations/${captureId}/${CUSTOMIZED_HTML}`;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const captureId = String(body.captureId ?? "").trim();
  if (!captureId) {
    return Response.json({ error: "captureId 필수" }, { status: 400 });
  }

  // 존재하지 않는 captureId → clone.html 부재로 404.
  if (!existsSync(capFile(captureId, FILES.clone))) {
    return Response.json(
      { error: `captureId 없음 또는 clone 부재(${captureId})` },
      { status: 404 },
    );
  }

  const edits = normalizeEdits(body.edits);
  const origin = new URL(req.url).origin;

  try {
    // 1) 콘텐츠 커스터마이징 적용 (디자인 잠금, 콘텐츠 전용 — GOAL §5).
    const applyResult = await applyCustomization(captureId, edits);

    // 2) 디자인 유지 검증 (텍스트 영역 마스킹 후 비교 — origin 으로 커스터마이즈 페이지 재캡처).
    const retention: DesignRetentionResult = await verifyRetention(
      captureId,
      origin,
    );

    // 3) 서빙 경로 결정 후 반환.
    const customizedHtmlWebPath = resolveCustomizedWebPath(captureId, applyResult);
    return Response.json({ customizedHtmlWebPath, retention });
  } catch (e) {
    return Response.json(
      { error: `커스터마이징 실패: ${(e as Error).message}`, captureId },
      { status: 500 },
    );
  }
}
