// fixture 독립 검증 — public/ 정적 서빙 + playwright 스크린샷(desktop/mobile).
import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { chromium } from "playwright";

const ROOT = join(process.cwd(), "public");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const server = http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p.endsWith("/")) p += "index.html";
    const abs = join(ROOT, p);
    if (!abs.startsWith(ROOT) || !existsSync(abs) || statSync(abs).isDirectory()) {
      res.writeHead(404);
      res.end("nf");
      return;
    }
    const buf = await readFile(abs);
    res.writeHead(200, { "content-type": TYPES[extname(abs)] ?? "application/octet-stream" });
    res.end(buf);
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
});

const PORT = 3222;
await new Promise((r) => server.listen(PORT, r));
const browser = await chromium.launch({ headless: true });
for (const [name, vp] of [
  ["desktop", { width: 1440, height: 900 }],
  ["mobile", { width: 390, height: 844 }],
]) {
  const page = await browser.newPage({ viewport: vp });
  await page.goto(`http://localhost:${PORT}/fixture/index.html`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `/tmp/fixture-${name}.png`, fullPage: true });
  console.log("shot", name);
  await page.close();
}
await browser.close();
server.close();
console.log("done");
