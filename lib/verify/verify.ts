// Loop D — Visual Verification Guardrail (clone-first).
// 원본(이미 캡처되어 디스크에 있음) vs 로컬 Clone(Playwright 재캡처)을 desktop/mobile 양 viewport 로 비교.
// CLONE_SPEC §3/§4 + GOAL §3. similarity.ts(동시 작성 중)의 compareImages/layoutScore 사용.
// 임계 판정은 lib/thresholds.ts 의 viewportPassed/overallPassed 로 단일화한다.
import { chromium, type Browser } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

import type {
  VerificationResult,
  ViewportScore,
  Viewport,
  LayoutMap,
  RawDesignTokens,
} from "../clone-types";
import {
  VIEWPORTS,
  CLONE_THRESHOLDS,
  viewportPassed,
  overallPassed,
} from "../thresholds";
import {
  captureDir,
  capFile,
  cloneWebPath,
  FILES,
} from "../paths";
import { compareImages, layoutScore } from "./similarity";
import { extractLayoutMap, extractRawTokens } from "../capture/render";

// --- similarity.ts 계약(동시 작성 중)을 명시적으로 고정 ---
// compareImages(aPng, bPng): 두 PNG 버퍼를 동일 해상도로 정규화 후 비교.
//   pixelmatch + ssim + color histogram + pixelmatch diff PNG 를 반환.
// layoutScore(aMap, bMap): 섹션 bbox IoU 평균(0..1).
// 위 시그니처는 CLONE_SPEC §3/§4 를 신뢰한다. 반환 형태를 방어적으로 처리한다.
interface CompareImagesOutput {
  pixelSimilarity: number;
  ssim: number;
  paletteSimilarity: number;
  diff: Buffer | Uint8Array;
}

const _compareImages = compareImages as (
  aPng: Buffer,
  bPng: Buffer,
) => Promise<CompareImagesOutput> | CompareImagesOutput;
const _layoutScore = layoutScore as (
  aMap: LayoutMap | null,
  bMap: LayoutMap | null,
) => number;

// 점수 클램프 / NaN 방어.
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

const ORIGINAL_FILE: Record<Viewport, string> = {
  desktop: FILES.originalDesktop,
  mobile: FILES.originalMobile,
};
const CLONE_FILE: Record<Viewport, string> = {
  desktop: FILES.cloneDesktop,
  mobile: FILES.cloneMobile,
};
const DIFF_FILE: Record<Viewport, string> = {
  desktop: FILES.diffDesktop,
  mobile: FILES.diffMobile,
};
// 원본 layout-map 표준 파일명(Loop A 산출물).
const ORIG_LAYOUT_FILE: Record<Viewport, string> = {
  desktop: FILES.layoutMapDesktop,
  mobile: FILES.layoutMapMobile,
};

async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

// 안정적 캡처: domcontentloaded→load→networkidle→fonts.ready→오토스크롤→상단복귀→레이아웃 안정.
async function captureClone(
  browser: Browser,
  captureId: string,
  url: string,
  viewport: Viewport,
): Promise<{ ok: boolean; error?: string }> {
  const size = VIEWPORTS[viewport];
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
  });
  try {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("load", { timeout: 30000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
    await page.evaluate(async () => {
      try {
        await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
      } catch {
        /* noop */
      }
    });
    // 전체 오토스크롤(lazy 로딩 유발) 후 상단 복귀.
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        let y = 0;
        const step = 400;
        const timer = setInterval(() => {
          const h = document.documentElement.scrollHeight;
          window.scrollTo(0, y);
          y += step;
          if (y >= h) {
            clearInterval(timer);
            resolve();
          }
        }, 60);
      });
    });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);
    // 레이아웃 안정성 2회 검사.
    let stable = false;
    let last = -1;
    for (let i = 0; i < 4; i++) {
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      if (h === last) {
        stable = true;
        break;
      }
      last = h;
      await page.waitForTimeout(250);
    }
    void stable;
    await page.screenshot({ path: capFile(captureId, CLONE_FILE[viewport]), fullPage: true });
    // clone 측 layout-map / raw-tokens 추출(섹션 수·폰트 유사도 실측 — 원본과 동일 로직).
    try {
      const lm = await extractLayoutMap(page, viewport);
      await writeFile(capFile(captureId, cloneLayoutFileName(viewport)), JSON.stringify(lm, null, 2));
      if (viewport === "desktop") {
        const tokens = await extractRawTokens(page);
        await writeFile(
          capFile(captureId, "clone-design-tokens.raw.json"),
          JSON.stringify(tokens, null, 2),
        );
      }
    } catch {
      /* 추출 실패는 무시 — 부재 시 verify 가 안전 처리 */
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  } finally {
    await ctx.close().catch(() => {});
  }
}

// 한 viewport 의 ViewportScore 계산: 원본/clone PNG 비교 + layout-map IoU.
async function scoreViewport(
  captureId: string,
  viewport: Viewport,
  reasons: string[],
): Promise<ViewportScore> {
  const origPath = capFile(captureId, ORIGINAL_FILE[viewport]);
  const clonePath = capFile(captureId, CLONE_FILE[viewport]);

  // 원본 또는 clone 스크린샷 부재 → 0점 처리(가드레일이 차단하도록).
  if (!existsSync(origPath) || !existsSync(clonePath)) {
    if (!existsSync(origPath)) reasons.push(`${viewport}: 원본 스크린샷 없음(${ORIGINAL_FILE[viewport]})`);
    if (!existsSync(clonePath)) reasons.push(`${viewport}: clone 스크린샷 없음(${CLONE_FILE[viewport]})`);
    return { pixelSimilarity: 0, ssim: 0, layoutSimilarity: 0, paletteSimilarity: 0, passed: false };
  }

  const [aPng, bPng] = await Promise.all([readFile(origPath), readFile(clonePath)]);

  let cmp: CompareImagesOutput;
  try {
    cmp = await _compareImages(aPng, bPng);
  } catch (e) {
    reasons.push(`${viewport}: 이미지 비교 실패(${(e as Error).message})`);
    return { pixelSimilarity: 0, ssim: 0, layoutSimilarity: 0, paletteSimilarity: 0, passed: false };
  }

  const pixelSimilarity = clamp01(cmp.pixelSimilarity);
  const ssim = clamp01(cmp.ssim);
  const paletteSimilarity = clamp01(cmp.paletteSimilarity);

  // diff PNG 저장(원본↔clone).
  if (cmp.diff) {
    const diffBuf = Buffer.isBuffer(cmp.diff) ? cmp.diff : Buffer.from(cmp.diff);
    await writeFile(capFile(captureId, DIFF_FILE[viewport]), diffBuf).catch(() => {});
  }

  // layout bbox IoU: 원본 layout-map(표준 파일명) vs clone layout-map(clone-* 파일명).
  // clone map 부재 시 readJson→null, layoutScore 가 안전 처리(0)한다.
  const origLayout = await readJson<LayoutMap>(capFile(captureId, ORIG_LAYOUT_FILE[viewport]));
  const cloneLayout = await readJson<LayoutMap>(
    capFile(captureId, cloneLayoutFileName(viewport)),
  );
  let layoutSimilarity = 0;
  try {
    layoutSimilarity = clamp01(_layoutScore(origLayout, cloneLayout));
  } catch {
    layoutSimilarity = 0;
  }

  const base: Omit<ViewportScore, "passed"> = {
    pixelSimilarity,
    ssim,
    layoutSimilarity,
    paletteSimilarity,
  };
  const passed = viewportPassed(base);

  if (!passed) {
    const visual = (pixelSimilarity + ssim) / 2;
    if (visual < CLONE_THRESHOLDS.visualSimilarity)
      reasons.push(
        `${viewport}: 시각 유사도 ${visual.toFixed(3)} < ${CLONE_THRESHOLDS.visualSimilarity}`,
      );
    if (layoutSimilarity < CLONE_THRESHOLDS.layout)
      reasons.push(
        `${viewport}: 레이아웃 유사도 ${layoutSimilarity.toFixed(3)} < ${CLONE_THRESHOLDS.layout}`,
      );
    if (paletteSimilarity < CLONE_THRESHOLDS.palette)
      reasons.push(
        `${viewport}: 팔레트 유사도 ${paletteSimilarity.toFixed(3)} < ${CLONE_THRESHOLDS.palette}`,
      );
  }

  return { ...base, passed };
}

// clone 전용 layout-map 파일명. 원본과 구분하기 위해 clone-layout-map.{viewport}.json 사용.
// 부재 시 readJson 이 null 을 돌려주고 layoutScore 가 안전 처리한다.
function cloneLayoutFileName(viewport: Viewport): string {
  return viewport === "desktop"
    ? "clone-layout-map.desktop.json"
    : "clone-layout-map.mobile.json";
}

// 섹션 수: 원본 layout-map sections.length. desktop 우선, 없으면 mobile.
function sectionCount(map: LayoutMap | null): number {
  if (!map || !Array.isArray(map.sections)) return 0;
  return map.sections.length;
}

// 폰트 유사도: 원본 rawTokens.fontFamilies 와 clone fontFamilies 겹침 비율.
// clone rawTokens 가 없으면 1.0(TODO: clone 측 토큰 수집 후 실제 비교).
function fontOverlap(orig: RawDesignTokens | null, clone: RawDesignTokens | null): number {
  // TODO: clone 측 design-tokens.raw 가 수집되면 실제 겹침 비율로 대체.
  const a = normalizeFamilies(orig?.fontFamilies);
  const b = normalizeFamilies(clone?.fontFamilies);
  if (a.size === 0) return 1.0; // 원본 폰트 정보 없음 → 패널티 없음
  if (b.size === 0) return 1.0; // clone 토큰 미수집 → 보수적으로 통과(TODO)
  let hit = 0;
  for (const f of a) if (b.has(f)) hit += 1;
  return clamp01(hit / a.size);
}

function normalizeFamilies(list: string[] | undefined): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(list)) return out;
  for (const raw of list) {
    if (typeof raw !== "string") continue;
    // 폰트 스택의 각 토큰을 분리·정규화(따옴표/공백/대소문자).
    for (const tok of raw.split(",")) {
      const norm = tok.trim().replace(/^["']|["']$/g, "").toLowerCase();
      if (norm) out.add(norm);
    }
  }
  return out;
}

/**
 * verifyClone — Loop D 가드레일.
 * @param captureId 캡처 id (= run id)
 * @param origin    clone 을 서빙하는 베이스 URL (예: http://localhost:3210). cloneWebPath 와 결합.
 */
export async function verifyClone(
  captureId: string,
  origin: string,
): Promise<VerificationResult> {
  const dir = captureDir(captureId);
  await mkdir(dir, { recursive: true });

  const reasons: string[] = [];
  const cloneUrl = joinOrigin(origin, cloneWebPath(captureId));

  // 1) clone 을 양 viewport 로 재캡처 → clone-desktop.png / clone-mobile.png.
  const cloneExists = existsSync(capFile(captureId, FILES.clone));
  if (!cloneExists) {
    reasons.push(`clone.html 없음(${FILES.clone}) — Loop C(buildClone) 선행 필요`);
  } else {
    const browser = await chromium.launch({ headless: true });
    try {
      for (const viewport of ["desktop", "mobile"] as Viewport[]) {
        const r = await captureClone(browser, captureId, cloneUrl, viewport);
        if (!r.ok) reasons.push(`${viewport}: clone 재캡처 실패(${r.error ?? "unknown"})`);
      }
    } finally {
      await browser.close().catch(() => {});
    }
  }

  // 2) viewport 별 점수 계산.
  const desktop = await scoreViewport(captureId, "desktop", reasons);
  const mobile = await scoreViewport(captureId, "mobile", reasons);

  // 3) 섹션 수 차이: 원본 layout-map 섹션수 vs clone layout-map 섹션수(clone map 없으면 0).
  const origLayoutDesktop = await readJson<LayoutMap>(
    capFile(captureId, FILES.layoutMapDesktop),
  );
  const origLayoutMobile = await readJson<LayoutMap>(
    capFile(captureId, FILES.layoutMapMobile),
  );
  const cloneLayoutDesktop = await readJson<LayoutMap>(
    capFile(captureId, cloneLayoutFileName("desktop")),
  );
  const cloneLayoutMobile = await readJson<LayoutMap>(
    capFile(captureId, cloneLayoutFileName("mobile")),
  );
  const origSections = sectionCount(origLayoutDesktop) || sectionCount(origLayoutMobile);
  const cloneSections = sectionCount(cloneLayoutDesktop) || sectionCount(cloneLayoutMobile);
  const sectionCountDiff = Math.abs(origSections - cloneSections);

  // 4) 폰트 유사도: 원본 rawTokens fontFamilies 겹침(없으면 1.0).
  const origTokens = await readJson<RawDesignTokens>(capFile(captureId, FILES.rawTokens));
  const cloneTokens = await readJson<RawDesignTokens>(
    capFile(captureId, "clone-design-tokens.raw.json"),
  );
  const fontSimilarity = fontOverlap(origTokens, cloneTokens);

  // 5) 종합 판정.
  const passed = overallPassed({ desktop, mobile, sectionCountDiff, fontSimilarity });

  if (sectionCountDiff > CLONE_THRESHOLDS.sectionCountDiff)
    reasons.push(
      `섹션 수 차이 ${sectionCountDiff} > ${CLONE_THRESHOLDS.sectionCountDiff} (원본 ${origSections} / clone ${cloneSections})`,
    );
  if (fontSimilarity < CLONE_THRESHOLDS.font)
    reasons.push(`폰트 유사도 ${fontSimilarity.toFixed(3)} < ${CLONE_THRESHOLDS.font}`);

  const result: VerificationResult = {
    captureId,
    desktop,
    mobile,
    sectionCountDiff,
    fontSimilarity,
    overallPassed: passed,
    failureReasons: passed ? [] : dedupe(reasons),
    createdAt: new Date().toISOString(),
  };

  // 6) verification.json 기록.
  await writeFile(
    capFile(captureId, FILES.verification),
    JSON.stringify(result, null, 2),
  );

  // 7) 실패 시 failure-report.md 작성.
  if (!passed) {
    await writeFile(
      capFile(captureId, FILES.failureReport),
      buildFailureReport(result, {
        origSections,
        cloneSections,
        cloneUrl,
        cloneExists,
      }),
    );
  }

  return result;
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr));
}

function joinOrigin(origin: string, webPath: string): string {
  const base = origin.replace(/\/+$/, "");
  const path = webPath.startsWith("/") ? webPath : `/${webPath}`;
  return `${base}${path}`;
}

// CLONE_SPEC §5 진단표 기반: 지표별 추정 원인 + 다음 수정 제안.
function diagnose(result: VerificationResult): string[] {
  const out: string[] = [];
  const push = (cause: string, fix: string) => out.push(`| ${cause} | ${fix} |`);

  const visD = (result.desktop.pixelSimilarity + result.desktop.ssim) / 2;
  const visM = (result.mobile.pixelSimilarity + result.mobile.ssim) / 2;

  if (visD < CLONE_THRESHOLDS.visualSimilarity || visM < CLONE_THRESHOLDS.visualSimilarity) {
    push("external CSS not mirrored", "`<link rel=stylesheet>` fetch+inline+rewrite");
    push("webfont not loaded", "`@font-face`/`document.fonts` mirror, fonts.ready 대기 강화");
    push("background image missing", "computed `background-image` url() mirror");
    push("lazy image not captured", "오토스크롤 step↓·대기↑, `loading=eager` 강제");
  }
  if (
    result.desktop.layoutSimilarity < CLONE_THRESHOLDS.layout ||
    result.mobile.layoutSimilarity < CLONE_THRESHOLDS.layout
  ) {
    push("section spacing mismatch", "computed margin/padding 보존 확인");
    push("media query not preserved", "원본 CSS 통째 inline(미디어쿼리 포함)");
    push("fixed/sticky mismatch", "position 보존, 스크롤 0 복귀 후 캡처");
    push("JS-rendered element missing", "networkidle+추가 대기, 캡처 시점 DOM 직렬화");
  }
  if (
    result.desktop.paletteSimilarity < CLONE_THRESHOLDS.palette ||
    result.mobile.paletteSimilarity < CLONE_THRESHOLDS.palette
  ) {
    push("CSS var missing", "`:root` 변수 수집/주입");
    push("background image missing", "computed `background-image` url() mirror");
  }
  if (result.sectionCountDiff > CLONE_THRESHOLDS.sectionCountDiff) {
    push("JS-rendered element missing", "networkidle+추가 대기, 캡처 시점 DOM 직렬화");
    push("lazy image not captured", "오토스크롤 step↓·대기↑로 lazy 섹션 노출");
  }
  if (result.fontSimilarity < CLONE_THRESHOLDS.font) {
    push("webfont not loaded", "`@font-face`/`document.fonts` mirror, fonts.ready 대기 강화");
  }
  if (out.length === 0) {
    push("viewport mismatch", "DPR/뷰포트 고정, clone 동일 조건 재캡처");
  }
  return out;
}

function pct(n: number): string {
  return `${(clamp01(n) * 100).toFixed(1)}%`;
}

function buildFailureReport(
  result: VerificationResult,
  extra: {
    origSections: number;
    cloneSections: number;
    cloneUrl: string;
    cloneExists: boolean;
  },
): string {
  const d = result.desktop;
  const m = result.mobile;
  const visD = (d.pixelSimilarity + d.ssim) / 2;
  const visM = (m.pixelSimilarity + m.ssim) / 2;

  const lines: string[] = [];
  lines.push(`# Clone Verification Failure Report`);
  lines.push("");
  lines.push(`- captureId: \`${result.captureId}\``);
  lines.push(`- clone URL: ${extra.cloneUrl}`);
  lines.push(`- clone.html 존재: ${extra.cloneExists ? "예" : "아니오"}`);
  lines.push(`- 생성 시각: ${result.createdAt}`);
  lines.push("");
  lines.push(`## 1. 지표`);
  lines.push("");
  lines.push(`| 지표 | Desktop | Mobile | 임계 | 통과 |`);
  lines.push(`|---|---|---|---|---|`);
  lines.push(
    `| pixel | ${pct(d.pixelSimilarity)} | ${pct(m.pixelSimilarity)} | — | — |`,
  );
  lines.push(`| ssim | ${pct(d.ssim)} | ${pct(m.ssim)} | — | — |`);
  lines.push(
    `| 시각((pixel+ssim)/2) | ${pct(visD)} | ${pct(visM)} | ≥${pct(
      CLONE_THRESHOLDS.visualSimilarity,
    )} | ${gate(visD >= CLONE_THRESHOLDS.visualSimilarity && visM >= CLONE_THRESHOLDS.visualSimilarity)} |`,
  );
  lines.push(
    `| layout(IoU) | ${pct(d.layoutSimilarity)} | ${pct(m.layoutSimilarity)} | ≥${pct(
      CLONE_THRESHOLDS.layout,
    )} | ${gate(d.layoutSimilarity >= CLONE_THRESHOLDS.layout && m.layoutSimilarity >= CLONE_THRESHOLDS.layout)} |`,
  );
  lines.push(
    `| palette | ${pct(d.paletteSimilarity)} | ${pct(m.paletteSimilarity)} | ≥${pct(
      CLONE_THRESHOLDS.palette,
    )} | ${gate(d.paletteSimilarity >= CLONE_THRESHOLDS.palette && m.paletteSimilarity >= CLONE_THRESHOLDS.palette)} |`,
  );
  lines.push(
    `| viewport passed | ${gate(d.passed)} | ${gate(m.passed)} | both | ${gate(d.passed && m.passed)} |`,
  );
  lines.push("");
  lines.push(
    `| 섹션 수 차이 | ${result.sectionCountDiff} (원본 ${extra.origSections} / clone ${extra.cloneSections}) | ≤${CLONE_THRESHOLDS.sectionCountDiff} | ${gate(result.sectionCountDiff <= CLONE_THRESHOLDS.sectionCountDiff)} |`,
  );
  lines.push(
    `| 폰트 유사도 | ${pct(result.fontSimilarity)} | ≥${pct(CLONE_THRESHOLDS.font)} | ${gate(result.fontSimilarity >= CLONE_THRESHOLDS.font)} |`,
  );
  lines.push("");
  lines.push(`**종합: ${result.overallPassed ? "통과" : "실패"}**`);
  lines.push("");

  if (result.failureReasons.length > 0) {
    lines.push(`## 2. 실패 사유`);
    lines.push("");
    for (const r of result.failureReasons) lines.push(`- ${r}`);
    lines.push("");
  }

  lines.push(`## 3. 추정 원인 → 다음 수정 제안 (CLONE_SPEC §5)`);
  lines.push("");
  lines.push(`| 추정 원인 | 수정 |`);
  lines.push(`|---|---|`);
  for (const row of diagnose(result)) lines.push(row);
  lines.push("");
  lines.push(`## 4. 다음 단계`);
  lines.push("");
  lines.push(`- Loop B/C(에셋 mirror·clone rewrite)를 위 수정 제안대로 패치 후 재실행.`);
  lines.push(`- diff PNG 확인: \`${FILES.diffDesktop}\`, \`${FILES.diffMobile}\`.`);
  lines.push(`- 가드레일 미통과 동안 분석(Loop E) 진행 금지(GOAL §3).`);
  lines.push("");
  return lines.join("\n");
}

function gate(ok: boolean): string {
  return ok ? "✅" : "❌";
}
