// Loop A+B+C 오케스트레이션 — captureAndClone: desktop+mobile 렌더 -> clone 빌드 -> meta.json 저장.
// 리플레이 파이프라인의 단일 진입점. LLM 미관여.
import { mkdir, writeFile } from "node:fs/promises";
import type { CaptureMeta, CaptureStatus, Viewport } from "../clone-types";
import { captureDir, capFile, FILES } from "../paths";
import { captureRendered } from "./render";
import { buildClone } from "./clone";

export async function captureAndClone(
  captureId: string,
  url: string,
  baseUrl: string,
): Promise<CaptureMeta> {
  await mkdir(captureDir(captureId), { recursive: true });
  const now = () => new Date().toISOString();

  const meta: CaptureMeta = {
    captureId,
    url,
    status: "pending",
    viewports: ["desktop", "mobile"],
    timings: {},
    blockers: [],
    assetCount: 0,
    fontsLoaded: false,
    imageCount: 0,
    sectionCount: {},
    createdAt: now(),
    updatedAt: now(),
  };

  const persist = async (status: CaptureStatus) => {
    meta.status = status;
    meta.updatedAt = now();
    await writeFile(
      capFile(captureId, FILES.meta),
      JSON.stringify(meta, null, 2),
    );
  };

  const tStart = Date.now();
  await persist("rendering");

  // desktop 렌더 (rendered-dom/computed-styles/raw-tokens 도 desktop 에서 산출).
  const desktop = await captureRendered(captureId, url, "desktop");
  mergeRender(meta, "desktop", desktop);
  meta.timings.renderDesktop = Date.now() - tStart;
  await persist("capturing");

  // mobile 렌더.
  const tMobile = Date.now();
  const mobile = await captureRendered(captureId, url, "mobile");
  mergeRender(meta, "mobile", mobile);
  meta.timings.renderMobile = Date.now() - tMobile;

  await persist("mirroring_assets");

  // clone 빌드 (rendered-dom desktop 기준).
  await persist("generating_clone");
  const tClone = Date.now();
  const clone = await buildClone(captureId, baseUrl);
  meta.assetCount = clone.assetCount;
  for (const b of clone.blocked) {
    const tag = `asset-blocked:${b}`;
    if (!meta.blockers.includes(tag)) meta.blockers.push(tag);
  }
  meta.timings.buildClone = Date.now() - tClone;
  meta.timings.total = Date.now() - tStart;

  // status: clone 생성 완료. 검증(Loop D)은 별도 모듈이 담당하므로 verifying 으로 둔다.
  await persist("verifying");
  return meta;
}

function mergeRender(
  meta: CaptureMeta,
  viewport: Viewport,
  r: {
    blockers: string[];
    fontsLoaded: boolean;
    imageCount: number;
    sectionCount: number;
    timings: Record<string, number>;
  },
): void {
  for (const b of r.blockers) {
    if (!meta.blockers.includes(b)) meta.blockers.push(b);
  }
  meta.fontsLoaded = meta.fontsLoaded || r.fontsLoaded;
  if (viewport === "desktop") meta.imageCount = r.imageCount;
  meta.sectionCount[viewport] = r.sectionCount;
  for (const [k, v] of Object.entries(r.timings)) {
    meta.timings[`${viewport}:${k}`] = v;
  }
}
