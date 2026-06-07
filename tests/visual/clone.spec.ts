// Visual Regression — fixture clone 이 원본과 ≥90% 시각 일치하는지 자동 검증(DoD 12).
// 파이프라인이 산출한 original/clone/diff PNG 를 test-results/visual/ 로 아카이브한다.
import { test, expect } from "@playwright/test";
import { mkdir, copyFile } from "node:fs/promises";

test("fixture clone ≥90% (desktop+mobile visual regression)", async ({ baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "파이프라인은 한 번만 실행");
  test.setTimeout(180_000);

  const url = `${baseURL}/fixture/index.html`;
  const res = await fetch(`${baseURL}/api/clone`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, captureId: "visual-fixture" }),
  });
  expect(res.ok, `/api/clone HTTP ${res.status}`).toBeTruthy();
  const data = (await res.json()) as {
    verification: {
      overallPassed: boolean;
      failureReasons: string[];
      desktop: { pixelSimilarity: number; ssim: number };
      mobile: { pixelSimilarity: number; ssim: number };
    };
  };
  const v = data.verification;

  // 산출 PNG 아카이브.
  await mkdir("test-results/visual", { recursive: true });
  for (const vp of ["desktop", "mobile"]) {
    for (const kind of ["original", "clone", "diff"]) {
      await copyFile(
        `captures/visual-fixture/${kind}-${vp}.png`,
        `test-results/visual/${kind}-${vp}.png`,
      ).catch(() => {});
    }
  }

  const dVis = (v.desktop.pixelSimilarity + v.desktop.ssim) / 2;
  const mVis = (v.mobile.pixelSimilarity + v.mobile.ssim) / 2;
  expect(dVis, "desktop 시각 유사도").toBeGreaterThanOrEqual(0.9);
  expect(mVis, "mobile 시각 유사도").toBeGreaterThanOrEqual(0.9);
  expect(v.overallPassed, JSON.stringify(v.failureReasons)).toBe(true);
});
