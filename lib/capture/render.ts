// Loop A — captureRendered: Playwright(Chromium)로 Reference URL 을 완전히 렌더한 뒤
// 스크린샷/렌더DOM/computed styles/layout map/raw tokens 를 캡처해 captures/{id}/ 에 저장.
// 리플레이(replay)지 재구성이 아니다. LLM 미관여.
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import type {
  Viewport,
  LayoutMap,
  LayoutNode,
  RawDesignTokens,
  ComputedStyleEntry,
  BBox,
} from "../clone-types";
import { VIEWPORTS } from "../thresholds";
import { captureDir, capFile, FILES } from "../paths";

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export interface RenderResult {
  screenshotPath: string;
  renderedDom: string | null; // desktop 일 때만 직렬화
  computedStyles: ComputedStyleEntry[] | null; // desktop 일 때만
  layoutMap: LayoutMap;
  rawTokens: RawDesignTokens | null; // desktop 일 때만
  blockers: string[];
  fontsLoaded: boolean;
  imageCount: number;
  sectionCount: number;
  timings: Record<string, number>;
}

// 흔한 cookie/consent/modal 닫기 셀렉터.
const DISMISS_SELECTORS = [
  "#onetrust-accept-btn-handler",
  "button#onetrust-accept-btn-handler",
  "[aria-label='Accept all']",
  "[aria-label='Accept cookies']",
  "[data-testid='cookie-accept']",
  "button[aria-label*='close' i]",
  "button[aria-label*='dismiss' i]",
  ".cookie-accept",
  ".cookie-consent button",
  "#cookie-accept",
  "button[title*='Accept' i]",
  "[id*='cookie' i] button",
  "[class*='consent' i] button",
  "[class*='modal' i] [aria-label*='close' i]",
];

// computed style 를 수집할 대표 셀렉터들.
const STYLE_SELECTORS = [
  ":root",
  "body",
  "header",
  "nav",
  "main",
  "footer",
  "section",
  "h1",
  "h2",
  "h3",
  "h4",
  "p",
  "a",
  "button",
  ".btn",
  "img",
];

export async function captureRendered(
  captureId: string,
  url: string,
  viewport: Viewport,
): Promise<RenderResult> {
  const t0 = Date.now();
  const timings: Record<string, number> = {};
  const blockers: string[] = [];
  await mkdir(captureDir(captureId), { recursive: true });

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({
      viewport: VIEWPORTS[viewport],
      deviceScaleFactor: 1,
      userAgent: CHROME_UA,
    });
    const page: Page = await context.newPage();

    await page.goto(url, { waitUntil: "load", timeout: 30000 });
    timings.goto = Date.now() - t0;

    await page.waitForLoadState("networkidle").catch(() => {});
    await page.evaluate(() => (document as Document).fonts.ready).catch(() => {});

    // cookie/consent/modal 닫기. 보이면 클릭, 못 닫으면 blockers 기록.
    await dismissBlockers(page, blockers);

    // 오토스크롤 (lazy 로딩 트리거): top -> bottom step 600px, 각 200ms 대기 후 top 복귀.
    await autoScroll(page);
    timings.autoscroll = Date.now() - t0;

    // 레이아웃 안정성: body.scrollHeight 가 300ms 간격으로 2회 연속 동일할 때까지 (최대 5회).
    await waitForStableLayout(page);
    timings.stable = Date.now() - t0;

    // 닫기 재시도 (오토스크롤로 새로 뜬 modal 대비).
    await dismissBlockers(page, blockers);

    // 스크롤 0 복귀 후 캡처 (fixed/sticky mismatch 방지).
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);

    const screenshotName =
      viewport === "desktop" ? FILES.originalDesktop : FILES.originalMobile;
    const screenshotPath = capFile(captureId, screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    timings.screenshot = Date.now() - t0;

    const fontsLoaded = await page
      .evaluate(() => (document as Document).fonts.status === "loaded")
      .catch(() => false);

    const layoutMap = await extractLayoutMap(page, viewport);
    const imageCount = await page
      .evaluate(() => document.querySelectorAll("img").length)
      .catch(() => 0);
    const sectionCount = layoutMap.sections.length;

    // layout map 저장 (desktop/mobile).
    const layoutName =
      viewport === "desktop" ? FILES.layoutMapDesktop : FILES.layoutMapMobile;
    await writeFile(capFile(captureId, layoutName), JSON.stringify(layoutMap, null, 2));

    let renderedDom: string | null = null;
    let computedStyles: ComputedStyleEntry[] | null = null;
    let rawTokens: RawDesignTokens | null = null;

    if (viewport === "desktop") {
      // 렌더된 DOM 직렬화.
      renderedDom = await page.evaluate(
        () => document.documentElement.outerHTML,
      );
      await writeFile(capFile(captureId, FILES.renderedDom), renderedDom);

      computedStyles = await extractComputedStyles(page);
      await writeFile(
        capFile(captureId, FILES.computedStyles),
        JSON.stringify(computedStyles, null, 2),
      );

      rawTokens = await extractRawTokens(page);
      await writeFile(
        capFile(captureId, FILES.rawTokens),
        JSON.stringify(rawTokens, null, 2),
      );
    }

    timings.total = Date.now() - t0;
    return {
      screenshotPath,
      renderedDom,
      computedStyles,
      layoutMap,
      rawTokens,
      blockers,
      fontsLoaded,
      imageCount,
      sectionCount,
      timings,
    };
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

async function dismissBlockers(page: Page, blockers: string[]): Promise<void> {
  for (const sel of DISMISS_SELECTORS) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 250 }).catch(() => false)) {
        await el.click({ timeout: 1000 }).catch(() => {
          if (!blockers.includes(sel)) blockers.push(sel);
        });
        await page.waitForTimeout(150);
      }
    } catch {
      // 셀렉터 평가 실패는 무시.
    }
  }
  // 여전히 가시적인 대형 overlay 가 있으면 못 닫은 것으로 기록.
  const stuck = await page
    .evaluate(() => {
      const candidates = Array.from(
        document.querySelectorAll<HTMLElement>(
          "[class*='cookie' i],[class*='consent' i],[id*='cookie' i],[class*='modal' i][style*='block'],[role='dialog']",
        ),
      );
      return candidates
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return (
            s.display !== "none" &&
            s.visibility !== "hidden" &&
            r.width > 200 &&
            r.height > 60
          );
        })
        .map((el) => el.className || el.id || el.getAttribute("role") || "overlay")
        .slice(0, 3);
    })
    .catch(() => [] as string[]);
  for (const s of stuck) {
    const tag = `blocker:${s}`;
    if (!blockers.includes(tag)) blockers.push(tag);
  }
}

async function autoScroll(page: Page): Promise<void> {
  await page
    .evaluate(async () => {
      const step = 600;
      const delay = 200;
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      const maxY = () =>
        Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight,
        );
      let y = 0;
      // bottom 까지 단계적 스크롤.
      while (y < maxY()) {
        window.scrollTo(0, y);
        await sleep(delay);
        y += step;
        if (y > 60000) break; // 안전장치.
      }
      window.scrollTo(0, maxY());
      await sleep(delay);
      // top 복귀.
      window.scrollTo(0, 0);
      await sleep(delay);
    })
    .catch(() => {});
}

async function waitForStableLayout(page: Page): Promise<void> {
  let prev = -1;
  let same = 0;
  for (let i = 0; i < 5; i++) {
    const h = await page
      .evaluate(() => document.body.scrollHeight)
      .catch(() => prev);
    if (h === prev) {
      same += 1;
      if (same >= 1) break; // 2회 연속 동일(직전 + 현재).
    } else {
      same = 0;
    }
    prev = h;
    await page.waitForTimeout(300);
  }
}

export async function extractLayoutMap(
  page: Page,
  viewport: Viewport,
): Promise<LayoutMap> {
  const raw = await page.evaluate(() => {
    const sectionSel = "header,nav,main,footer,section,div[class],aside,article";
    const textSel = "h1,h2,h3,h4,h5,h6,p,a,button,span,li";
    const toBox = (el: Element) => {
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.x + window.scrollX),
        y: Math.round(r.y + window.scrollY),
        width: Math.round(r.width),
        height: Math.round(r.height),
      };
    };
    const cssPath = (el: Element): string => {
      const parts: string[] = [];
      let cur: Element | null = el;
      let depth = 0;
      while (cur && cur.nodeType === 1 && depth < 4) {
        let part = cur.tagName.toLowerCase();
        if (cur.id) {
          part += `#${cur.id}`;
          parts.unshift(part);
          break;
        } else {
          const cls = (cur.className || "")
            .toString()
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2);
          if (cls.length) part += "." + cls.join(".");
          const parent = cur.parentElement;
          if (parent) {
            const idx =
              Array.from(parent.children).indexOf(cur) + 1;
            part += `:nth-child(${idx})`;
          }
        }
        parts.unshift(part);
        cur = cur.parentElement;
        depth += 1;
      }
      return parts.join(" > ");
    };
    const visible = (el: Element, minW: number, minH: number) => {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0)
        return false;
      const r = el.getBoundingClientRect();
      return r.width >= minW && r.height >= minH;
    };

    const sections = Array.from(document.querySelectorAll(sectionSel))
      .filter((el) => visible(el, 200, 80))
      .slice(0, 120)
      .map((el) => ({
        selector: cssPath(el),
        role: el.tagName.toLowerCase(),
        box: toBox(el),
        text: null as string | null,
        isText: false,
      }));

    const textBlocks = Array.from(document.querySelectorAll(textSel))
      .filter((el) => visible(el, 8, 8))
      .filter((el) => (el.textContent || "").trim().length > 0)
      .slice(0, 400)
      .map((el) => ({
        selector: cssPath(el),
        role: el.tagName.toLowerCase(),
        box: toBox(el),
        text: (el.textContent || "").trim().slice(0, 120),
        isText: true,
      }));

    return {
      pageWidth: Math.round(
        Math.max(document.documentElement.scrollWidth, window.innerWidth),
      ),
      pageHeight: Math.round(
        Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
      ),
      sections,
      textBlocks,
    };
  });

  const sections: LayoutNode[] = raw.sections.map((n) => ({
    selector: n.selector,
    role: n.role,
    box: n.box as BBox,
    text: n.text,
    isText: n.isText,
  }));
  const textBlocks: LayoutNode[] = raw.textBlocks.map((n) => ({
    selector: n.selector,
    role: n.role,
    box: n.box as BBox,
    text: n.text,
    isText: n.isText,
  }));

  return {
    viewport,
    pageWidth: raw.pageWidth,
    pageHeight: raw.pageHeight,
    sections,
    textBlocks,
  };
}

async function extractComputedStyles(page: Page): Promise<ComputedStyleEntry[]> {
  const props = [
    "color",
    "background-color",
    "background-image",
    "font-family",
    "font-size",
    "font-weight",
    "line-height",
    "letter-spacing",
    "text-align",
    "border-radius",
    "box-shadow",
    "margin",
    "padding",
    "display",
    "position",
    "width",
    "height",
    "max-width",
    "gap",
  ];
  const entries = await page.evaluate(
    (args: { selectors: string[]; props: string[] }) => {
      const { selectors, props } = args;
      const out: { selector: string; styles: Record<string, string> }[] = [];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const cs = getComputedStyle(el);
        const styles: Record<string, string> = {};
        for (const p of props) {
          const v = cs.getPropertyValue(p);
          if (v) styles[p] = v.trim();
        }
        out.push({ selector: sel, styles });
      }
      return out;
    },
    { selectors: STYLE_SELECTORS, props },
  );
  return entries;
}

export async function extractRawTokens(page: Page): Promise<RawDesignTokens> {
  const raw = await page.evaluate(() => {
    const colors = new Set<string>();
    const fontFamilies = new Set<string>();
    const fontSizes = new Set<string>();
    const fontWeights = new Set<string>();
    const lineHeights = new Set<string>();
    const letterSpacings = new Set<string>();
    const radii = new Set<string>();
    const shadows = new Set<string>();
    const gradients = new Set<string>();
    const spacings = new Set<string>();

    const add = (set: Set<string>, v: string | null | undefined) => {
      if (!v) return;
      const t = v.trim();
      if (!t || t === "none" || t === "normal" || t === "auto" || t === "0px")
        return;
      if (set.size < 200) set.add(t);
    };

    const els = Array.from(document.querySelectorAll<HTMLElement>("*")).slice(
      0,
      4000,
    );
    for (const el of els) {
      const cs = getComputedStyle(el);
      add(colors, cs.color);
      add(colors, cs.backgroundColor);
      add(fontFamilies, cs.fontFamily);
      add(fontSizes, cs.fontSize);
      add(fontWeights, cs.fontWeight);
      add(lineHeights, cs.lineHeight);
      add(letterSpacings, cs.letterSpacing);
      add(radii, cs.borderRadius);
      add(shadows, cs.boxShadow);
      add(spacings, cs.margin);
      add(spacings, cs.padding);
      const bg = cs.backgroundImage;
      if (bg && bg.includes("gradient")) add(gradients, bg);
    }
    return {
      colors: Array.from(colors),
      fontFamilies: Array.from(fontFamilies),
      fontSizes: Array.from(fontSizes),
      fontWeights: Array.from(fontWeights),
      lineHeights: Array.from(lineHeights),
      letterSpacings: Array.from(letterSpacings),
      radii: Array.from(radii),
      shadows: Array.from(shadows),
      gradients: Array.from(gradients),
      spacings: Array.from(spacings),
    };
  });
  return raw;
}
