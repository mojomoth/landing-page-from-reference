// Loop G — verifyRetention: 커스터마이징(콘텐츠만 변경) 후에도 디자인이 유지되는지 검증.
// 텍스트 영역을 마스킹(원본 layout-map textBlocks bbox)하여 텍스트 변경은 무시하고 "디자인"만 비교한다.
// 지표(0..1): designToken / layout / typography / spacing / color / component retention.
// 판정: lib/thresholds.ts 의 retentionPassed. 기록: customizationDir(id)/verification.json.
// 캡처 시퀀스는 verify.ts(captureClone) 의 안정 시퀀스(load→networkidle→fonts.ready→오토스크롤→상단복귀→안정)를 따른다.
import { chromium, type Browser, type Page } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

import type {
  DesignRetentionResult,
  Viewport,
  LayoutMap,
  RawDesignTokens,
  BBox,
} from "../clone-types";
import { VIEWPORTS, retentionPassed } from "../thresholds";
import { capFile, customizationDir, FILES } from "../paths";
import {
  pixelScore,
  ssimScore,
  paletteScore,
  layoutScore,
  maskTextBlocks,
  normalizeToSame,
} from "../verify/similarity";
import { extractLayoutMap, extractRawTokens } from "../capture/render";

const CUSTOMIZED_HTML = "customized-page.html";
const CUSTOMIZED_PNG: Record<Viewport, string> = {
  desktop: "customized-desktop.png",
  mobile: "customized-mobile.png",
};
const CUSTOMIZED_LAYOUT: Record<Viewport, string> = {
  desktop: "customized-layout-map.desktop.json",
  mobile: "customized-layout-map.mobile.json",
};
const CLONE_PNG: Record<Viewport, string> = {
  desktop: FILES.cloneDesktop,
  mobile: FILES.cloneMobile,
};
const ORIG_LAYOUT_FILE: Record<Viewport, string> = {
  desktop: FILES.layoutMapDesktop,
  mobile: FILES.layoutMapMobile,
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

async function readJson<T>(path: string): Promise<T | null> {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    return null;
  }
}

// verify.ts 의 안정 캡처 시퀀스 동일 적용 + 같은 page 로 layout-map / raw-tokens 추출.
async function captureCustomized(
  browser: Browser,
  captureId: string,
  url: string,
  viewport: Viewport,
): Promise<{ ok: boolean; layout: LayoutMap | null; tokens: RawDesignTokens | null; error?: string }> {
  const size = VIEWPORTS[viewport];
  const ctx = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 1,
  });
  try {
    const page: Page = await ctx.newPage();
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
    // 레이아웃 안정성 검사.
    let last = -1;
    for (let i = 0; i < 4; i++) {
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      if (h === last) break;
      last = h;
      await page.waitForTimeout(250);
    }
    await page.screenshot({ path: capFile(captureId, CUSTOMIZED_PNG[viewport]), fullPage: true });

    // 같은 page 로 layout-map / raw-tokens 추출(재캡처 중복 방지).
    let layout: LayoutMap | null = null;
    let tokens: RawDesignTokens | null = null;
    try {
      layout = await extractLayoutMap(page, viewport);
      await writeFile(
        capFile(captureId, CUSTOMIZED_LAYOUT[viewport]),
        JSON.stringify(layout, null, 2),
      );
    } catch {
      layout = null;
    }
    if (viewport === "desktop") {
      try {
        tokens = await extractRawTokens(page);
      } catch {
        tokens = null;
      }
    }
    return { ok: true, layout, tokens };
  } catch (e) {
    return { ok: false, layout: null, tokens: null, error: (e as Error).message };
  } finally {
    await ctx.close().catch(() => {});
  }
}

// 텍스트 영역 마스킹 후 두 PNG 를 정규화하여 pixel/ssim/palette 점수 계산.
// boxes 는 원본 layout-map 좌표계(= clone 좌표계). clone/customized 양쪽에 동일 마스킹.
async function maskedScores(
  clonePng: Buffer,
  customizedPng: Buffer,
  boxes: BBox[],
): Promise<{ component: number; color: number }> {
  const maskedClone = boxes.length ? maskTextBlocks(clonePng, boxes) : clonePng;
  const maskedCustom = boxes.length ? maskTextBlocks(customizedPng, boxes) : customizedPng;
  // 정규화(동일 해상도)로 jimp resize 후 비교.
  const { a, b } = await normalizeToSame(maskedClone, maskedCustom);
  const pixel = clamp01(pixelScore(a, b).score);
  const ssim = clamp01(ssimScore(a, b));
  const palette = clamp01(paletteScore(a, b));
  return { component: clamp01((pixel + ssim) / 2), color: palette };
}

// 겹침 비율 = |교집합| / |원본|. 원본이 비면 1.0(패널티 없음).
function overlapRatio(orig: string[] | undefined, cur: string[] | undefined): number {
  const a = new Set((orig ?? []).map((s) => s.trim()).filter(Boolean));
  const b = new Set((cur ?? []).map((s) => s.trim()).filter(Boolean));
  if (a.size === 0) return 1;
  let hit = 0;
  for (const v of a) if (b.has(v)) hit += 1;
  return clamp01(hit / a.size);
}

// 전체 토큰 겹침(designToken): 모든 토큰 카테고리를 평탄화해 한 집합으로 비교.
function flattenTokens(t: RawDesignTokens | null): string[] {
  if (!t) return [];
  return [
    ...(t.colors ?? []),
    ...(t.fontFamilies ?? []),
    ...(t.fontSizes ?? []),
    ...(t.fontWeights ?? []),
    ...(t.lineHeights ?? []),
    ...(t.letterSpacings ?? []),
    ...(t.radii ?? []),
    ...(t.shadows ?? []),
    ...(t.gradients ?? []),
    ...(t.spacings ?? []),
  ];
}

/**
 * verifyRetention — Loop G.
 * @param captureId 캡처 id (= run id)
 * @param origin    customized 페이지를 서빙하는 베이스 URL (예: http://localhost:3210).
 */
export async function verifyRetention(
  captureId: string,
  origin: string,
): Promise<DesignRetentionResult> {
  const dir = customizationDir(captureId);
  await mkdir(dir, { recursive: true });

  const reasons: string[] = [];
  const url = joinOrigin(origin, `/customizations/${captureId}/${CUSTOMIZED_HTML}`);

  // 1) customized 페이지를 양 viewport 로 재캡처(+ 같은 page 로 layout/tokens 추출).
  let customizedLayoutDesktop: LayoutMap | null = null;
  let customizedTokens: RawDesignTokens | null = null;
  const customizedExists = existsSync(join(dir, CUSTOMIZED_HTML));
  if (!customizedExists) {
    reasons.push(`${CUSTOMIZED_HTML} 없음 — applyCustomization 선행 필요`);
  } else {
    const browser = await chromium.launch({ headless: true });
    try {
      for (const viewport of ["desktop", "mobile"] as Viewport[]) {
        const r = await captureCustomized(browser, captureId, url, viewport);
        if (!r.ok) reasons.push(`${viewport}: customized 재캡처 실패(${r.error ?? "unknown"})`);
        if (viewport === "desktop") {
          customizedLayoutDesktop = r.layout;
          customizedTokens = r.tokens;
        }
      }
    } finally {
      await browser.close().catch(() => {});
    }
  }

  // 2) 컴포넌트/컬러 retention: 텍스트 마스킹 후 clone vs customized PNG 비교(양 viewport 평균).
  let componentSum = 0;
  let colorSum = 0;
  let vpCount = 0;
  for (const viewport of ["desktop", "mobile"] as Viewport[]) {
    const clonePath = capFile(captureId, CLONE_PNG[viewport]);
    const customPath = capFile(captureId, CUSTOMIZED_PNG[viewport]);
    if (!existsSync(clonePath) || !existsSync(customPath)) {
      if (!existsSync(clonePath)) reasons.push(`${viewport}: clone PNG 없음(${CLONE_PNG[viewport]})`);
      if (!existsSync(customPath)) reasons.push(`${viewport}: customized PNG 없음(${CUSTOMIZED_PNG[viewport]})`);
      continue;
    }
    const origLayout = await readJson<LayoutMap>(capFile(captureId, ORIG_LAYOUT_FILE[viewport]));
    const boxes: BBox[] = Array.isArray(origLayout?.textBlocks)
      ? origLayout!.textBlocks.map((n) => n.box)
      : [];
    try {
      const [clonePng, customPng] = await Promise.all([readFile(clonePath), readFile(customPath)]);
      const s = await maskedScores(clonePng, customPng, boxes);
      componentSum += s.component;
      colorSum += s.color;
      vpCount += 1;
    } catch (e) {
      reasons.push(`${viewport}: 마스킹 비교 실패(${(e as Error).message})`);
    }
  }
  const componentRetention = vpCount > 0 ? clamp01(componentSum / vpCount) : 0;
  const colorRetention = vpCount > 0 ? clamp01(colorSum / vpCount) : 0;

  // 3) layout retention: 원본 layout-map(desktop) vs customized layout-map(desktop, 재캡처 추출).
  const origLayoutDesktop = await readJson<LayoutMap>(capFile(captureId, FILES.layoutMapDesktop));
  let layoutRetention = 0;
  if (origLayoutDesktop && customizedLayoutDesktop) {
    try {
      layoutRetention = clamp01(layoutScore(origLayoutDesktop, customizedLayoutDesktop));
    } catch {
      layoutRetention = 0;
    }
  } else {
    reasons.push("layout retention: 원본/customized layout-map 부재");
  }

  // 4) typography/spacing/designToken retention: customized rawTokens vs clone design-tokens.raw.json.
  // clone 자체 토큰(clone-design-tokens.raw.json)을 우선 기준으로, 없으면 캡처 raw 토큰으로 폴백.
  const cloneTokens =
    (await readJson<RawDesignTokens>(capFile(captureId, "clone-design-tokens.raw.json"))) ??
    (await readJson<RawDesignTokens>(capFile(captureId, FILES.rawTokens)));
  const typographyRetention = clamp01(
    (overlapRatio(cloneTokens?.fontFamilies, customizedTokens?.fontFamilies) +
      overlapRatio(cloneTokens?.fontSizes, customizedTokens?.fontSizes)) /
      2,
  );
  const spacingRetention = overlapRatio(cloneTokens?.spacings, customizedTokens?.spacings);
  const designTokenRetention = overlapRatio(
    flattenTokens(cloneTokens),
    flattenTokens(customizedTokens),
  );

  const result: DesignRetentionResult = {
    designTokenRetention,
    layoutRetention,
    typographyRetention,
    spacingRetention,
    colorRetention,
    componentRetention,
    passed: retentionPassed({
      designTokenRetention,
      layoutRetention,
      typographyRetention,
      spacingRetention,
      colorRetention,
      componentRetention,
    }),
  };

  // 5) verification.json 기록(진단용 reasons/timestamp 포함, 반환은 DesignRetentionResult).
  await writeFile(
    join(dir, FILES.verification),
    JSON.stringify(
      {
        captureId,
        ...result,
        failureReasons: result.passed ? [] : dedupe(reasons),
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

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
