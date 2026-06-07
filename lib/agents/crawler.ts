// Agent: Reference Crawler — Playwright(Node)로 URL 캡처. 실패 시 폴백(조기 정지 금지).
import { chromium } from "playwright";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface CaptureResult {
  ok: boolean;
  fallback: boolean;
  summary: string;
  title: string;
  screenshotPath: string | null;
  screenshotDataUrl: string | null;
  domText: string;
}

function captureDir(runId: string): string {
  return join(process.cwd(), "runs", runId, "capture");
}

export async function captureReference(runId: string, url: string): Promise<CaptureResult> {
  const d = captureDir(runId);
  await mkdir(d, { recursive: true });
  try {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      await page.waitForTimeout(900);
      const shotAbs = join(d, "desktop.png");
      const buf = await page.screenshot({ path: shotAbs, fullPage: false });
      const title = await page.title().catch(() => "");
      const domText = await page.evaluate(() => document.body?.innerText?.slice(0, 4000) ?? "").catch(() => "");
      const result: CaptureResult = {
        ok: true,
        fallback: false,
        summary: `${title || url} · ${domText.length}자 텍스트`,
        title,
        screenshotPath: `runs/${runId}/capture/desktop.png`,
        screenshotDataUrl: `data:image/png;base64,${buf.toString("base64")}`,
        domText,
      };
      await writeFile(
        join(d, "capture.json"),
        JSON.stringify(
          { url, title, fallback: false, summary: result.summary, domText, screenshotPath: result.screenshotPath, capturedAt: new Date().toISOString() },
          null,
          2,
        ),
      );
      return result;
    } finally {
      await browser.close();
    }
  } catch (e) {
    const result: CaptureResult = {
      ok: false,
      fallback: true,
      summary: `캡처 실패(폴백): ${(e as Error).message.slice(0, 80)}`,
      title: "",
      screenshotPath: null,
      screenshotDataUrl: null,
      domText: "",
    };
    await writeFile(
      join(d, "capture.json"),
      JSON.stringify({ url, fallback: true, summary: result.summary, domText: "", screenshotPath: null, capturedAt: new Date().toISOString() }, null, 2),
    ).catch(() => {});
    return result;
  }
}

export async function loadCapture(runId: string): Promise<CaptureResult | null> {
  const d = captureDir(runId);
  const metaPath = join(d, "capture.json");
  if (!existsSync(metaPath)) return null;
  try {
    const meta = JSON.parse(await readFile(metaPath, "utf8")) as {
      domText?: string;
      fallback?: boolean;
      summary?: string;
      screenshotPath?: string | null;
      title?: string;
    };
    let dataUrl: string | null = null;
    const shotAbs = join(d, "desktop.png");
    if (meta.screenshotPath && existsSync(shotAbs)) {
      const buf = await readFile(shotAbs);
      dataUrl = `data:image/png;base64,${buf.toString("base64")}`;
    }
    return {
      ok: !meta.fallback,
      fallback: !!meta.fallback,
      summary: meta.summary ?? "",
      title: meta.title ?? "",
      screenshotPath: meta.screenshotPath ?? null,
      screenshotDataUrl: dataUrl,
      domText: meta.domText ?? "",
    };
  } catch {
    return null;
  }
}
