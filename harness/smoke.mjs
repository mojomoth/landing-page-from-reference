// 검증 사다리 최상단(가장 비쌈): 실제 서버에 end-to-end 파이프라인 + 브라우저 스크린샷.
// 사용: (서버 기동 후) BASE_URL=http://localhost:3100 node harness/smoke.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const REF_URL = process.env.REF_URL ?? "https://stripe.com";

async function j(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${String(text).slice(0, 200)}`);
  return data;
}

let failures = 0;
function check(label, cond, detail = "") {
  console.log(`${cond ? "✓" : "✗"} ${label}${detail ? " — " + detail : ""}`);
  if (!cond) failures++;
}

console.log(`▶ end-to-end against ${BASE} (ref: ${REF_URL})`);

const { run } = await j("POST", "/api/runs", { referenceUrl: REF_URL, userGoal: "AI 강의 랜딩" });
check("1. create run", !!run?.id, run?.id);

const cap = await j("POST", "/api/capture", { runId: run.id });
check("2. capture", cap.ok === true || cap.fallback === true, cap.fallback ? "fallback" : cap.summary);

const ana = await j("POST", "/api/analyze", { runId: run.id });
const nSections = ana?.analysis?.structure?.sections?.length ?? 0;
check("3. analyze", nSections > 0, `mode=${ana.mode}, sections=${nSections}`);

const pat = await j("POST", "/api/patch", { runId: run.id, instruction: "전체를 다크모드로 바꿔줘" });
check("4. patch(dark)", Array.isArray(pat?.patch?.operations), `mode=${pat.mode}, ops=${pat?.patch?.operations?.length}`);

const gen = await j("POST", "/api/generate", { runId: run.id });
check("5. generate", gen?.previewUrl?.includes("/preview/"), `code=${gen.codePath}`);

const previewHtml = await (await fetch(BASE + gen.previewUrl)).text();
check("6. preview html", previewHtml.length > 500, `${previewHtml.length} bytes`);

const list = await j("GET", "/api/runs");
check("7. history list", Array.isArray(list.runs) && list.runs.some((r) => r.id === run.id), `${list.runs.length} runs`);

// ── 스크린샷 (피드백용) ──
await mkdir("screenshots", { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1024 } });
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const firstRun = page.locator(".run-item").first();
  if (await firstRun.count()) {
    await firstRun.click();
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: "screenshots/01-ui-shell.png" });
  console.log("✓ screenshot: screenshots/01-ui-shell.png");

  await page.goto(BASE + gen.previewUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: "screenshots/02-generated-preview.png", fullPage: true });
  console.log("✓ screenshot: screenshots/02-generated-preview.png");
} finally {
  await browser.close();
}

console.log(failures === 0 ? "\n✅ smoke 통과" : `\n✗ smoke 실패 (${failures})`);
process.exit(failures === 0 ? 0 : 1);
