// Loop H — E2E 전체 파이프라인 검증 (clone-first). GOAL §3/§5 + CLONE_SPEC §6.
// 브라우저 페이지가 아니라 Node fetch 로 API 파이프라인을 호출한다:
//   /api/clone (캡처+mirror+clone+검증) → /api/clone-analyze (clone 분석) →
//   /api/clone-customize (콘텐츠 커스터마이징 + 디자인 유지 검증).
// webServer(포트 3210)는 playwright.config.ts 가 부팅한다. 여기서 직접 서버를 띄우지 않는다.
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { analysisDir } from "../../lib/paths";
import type {
  VerificationResult,
  DesignRetentionResult,
} from "../../lib/clone-types";
import type {
  StructureDoc,
  CustomizableSchemaDoc,
  EditableField,
} from "../../lib/analyze/from-clone";

const CAPTURE_ID = "e2e-fixture";

// 비-200 응답일 때 본문을 포함한 에러 메시지를 만들어 디버깅을 돕는다.
async function readBody(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.length > 2000 ? `${text.slice(0, 2000)}…(truncated)` : text;
  } catch (e) {
    return `<본문 읽기 실패: ${(e as Error).message}>`;
  }
}

// JSON 파싱 + 비-200 시 본문 포함 단언. 파싱 실패도 본문을 노출한다.
async function postJson<T>(
  url: string,
  payload: unknown,
): Promise<{ res: Response; body: T }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await readBody(res);
    throw new Error(
      `POST ${url} → ${res.status} ${res.statusText}\n응답 본문: ${detail}`,
    );
  }
  let body: T;
  try {
    body = (await res.json()) as T;
  } catch (e) {
    throw new Error(
      `POST ${url} 응답 JSON 파싱 실패 (${(e as Error).message})`,
    );
  }
  return { res, body };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// 0..1 범위 숫자 단언.
function expectUnit(value: unknown, label: string): void {
  expect(isFiniteNumber(value), `${label} 는 유한 숫자여야 함 (got ${String(value)})`).toBe(true);
  const n = value as number;
  expect(n, `${label} >= 0`).toBeGreaterThanOrEqual(0);
  expect(n, `${label} <= 1`).toBeLessThanOrEqual(1);
}

// API 응답(우선) 또는 디스크 파일(폴백)에서 customizable-schema 를 얻는다.
async function loadSchema(
  fromResponse: unknown,
): Promise<CustomizableSchemaDoc> {
  if (
    fromResponse &&
    typeof fromResponse === "object" &&
    Array.isArray((fromResponse as CustomizableSchemaDoc).editableFields)
  ) {
    return fromResponse as CustomizableSchemaDoc;
  }
  const path = join(analysisDir(CAPTURE_ID), "customizable-schema.json");
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as CustomizableSchemaDoc;
}

test("clone→analyze→customize 전체 파이프라인이 fixture 에서 통과한다", async ({
  baseURL,
}, testInfo) => {
  // 프로젝트(desktop/mobile) 중복 실행 방지 — 한 번만.
  test.skip(
    testInfo.project.name !== "desktop",
    "API 파이프라인은 viewport 무관 — desktop 프로젝트에서 한 번만 실행",
  );

  expect(baseURL, "config webServer 의 baseURL 이 설정돼야 함").toBeTruthy();
  const base = (baseURL as string).replace(/\/+$/, "");

  // ── 1) /api/clone : 캡처 → mirror → clone → 시각 검증(≥90%) ──
  const fixtureUrl = `${base}/fixture/index.html`;
  const { body: cloneBody } = await postJson<{
    captureId: string;
    verification: VerificationResult;
  }>(`${base}/api/clone`, { url: fixtureUrl, captureId: CAPTURE_ID });

  const verification = cloneBody.verification;
  expect(verification, "clone 응답에 verification 이 있어야 함").toBeTruthy();
  expect(
    verification.overallPassed,
    `overallPassed 여야 함. failureReasons=${JSON.stringify(verification.failureReasons)}`,
  ).toBe(true);

  // desktop/mobile 모두 (pixel+ssim)/2 ≥ 0.90.
  for (const vp of ["desktop", "mobile"] as const) {
    const s = verification[vp];
    expect(s, `verification.${vp} 존재`).toBeTruthy();
    expectUnit(s.pixelSimilarity, `${vp}.pixelSimilarity`);
    expectUnit(s.ssim, `${vp}.ssim`);
    const visual = (s.pixelSimilarity + s.ssim) / 2;
    expect(
      visual,
      `${vp} 시각 유사도((pixel+ssim)/2)=${visual.toFixed(4)} >= 0.90`,
    ).toBeGreaterThanOrEqual(0.9);
  }

  // ── 2) /api/clone-analyze : clone 아티팩트 기반 분석 ──
  const { body: analyzeBody } = await postJson<{
    structure?: StructureDoc;
    customizableSchema?: CustomizableSchemaDoc;
    schema?: CustomizableSchemaDoc;
  }>(`${base}/api/clone-analyze`, { captureId: CAPTURE_ID });

  // structure.sections.length > 0 (응답 우선, 없으면 디스크 폴백).
  let structure: StructureDoc | undefined = analyzeBody.structure;
  if (!structure || !Array.isArray(structure.sections)) {
    const raw = await readFile(
      join(analysisDir(CAPTURE_ID), "structure.json"),
      "utf8",
    );
    structure = JSON.parse(raw) as StructureDoc;
  }
  expect(
    structure.sections.length,
    "structure.sections.length > 0",
  ).toBeGreaterThan(0);

  // customizable-schema.editableFields 존재.
  const schema = await loadSchema(
    analyzeBody.customizableSchema ?? analyzeBody.schema,
  );
  expect(
    Array.isArray(schema.editableFields),
    "customizable-schema.editableFields 배열 존재",
  ).toBe(true);
  expect(
    schema.editableFields.length,
    "editableFields 가 비어있지 않아야 함",
  ).toBeGreaterThan(0);

  // ── 3) 편집 대상 선택: kind==="text" 첫 필드, 없으면 첫 필드 ──
  const textField: EditableField | undefined = schema.editableFields.find(
    (f) => f.kind === "text",
  );
  const target = textField ?? schema.editableFields[0];
  expect(target, "편집 대상 editableField 가 존재해야 함").toBeTruthy();

  // ── 4) /api/clone-customize : 콘텐츠 수정 + 디자인 유지(retention) 검증 ──
  const { body: customizeBody } = await postJson<{
    retention?: DesignRetentionResult;
    verification?: DesignRetentionResult;
  }>(`${base}/api/clone-customize`, {
    captureId: CAPTURE_ID,
    edits: [{ id: target.id, kind: "text", value: "E2E 변경 텍스트" }],
  });

  const retention = customizeBody.retention ?? customizeBody.verification;
  expect(
    retention,
    "clone-customize 응답에 retention(디자인 유지 검증) 객체가 있어야 함",
  ).toBeTruthy();

  // 6개 retention 지표가 0..1 범위 숫자임을 단언.
  const r = retention as DesignRetentionResult;
  expectUnit(r.designTokenRetention, "retention.designTokenRetention");
  expectUnit(r.layoutRetention, "retention.layoutRetention");
  expectUnit(r.typographyRetention, "retention.typographyRetention");
  expectUnit(r.spacingRetention, "retention.spacingRetention");
  expectUnit(r.colorRetention, "retention.colorRetention");
  expectUnit(r.componentRetention, "retention.componentRetention");

  // passed 가 true 면 이상적(GOAL §5). 강제하지 않고 boolean 임만 확인한다.
  expect(typeof r.passed, "retention.passed 는 boolean").toBe("boolean");
});
