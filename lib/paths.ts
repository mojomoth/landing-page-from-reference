// 경로 단일 출처. CLONE_SPEC.md §1.
import { join } from "node:path";

const ROOT = process.cwd();

export function capturesRoot(): string {
  return join(ROOT, "captures");
}
export function captureDir(id: string): string {
  return join(ROOT, "captures", id);
}
export function captureAssetsDir(id: string): string {
  return join(captureDir(id), "assets");
}
export function analysisDir(id: string): string {
  return join(ROOT, "analysis", id);
}
export function customizationDir(id: string): string {
  return join(ROOT, "customizations", id);
}
export function capFile(id: string, name: string): string {
  return join(captureDir(id), name);
}

// 표준 파일명
export const FILES = {
  meta: "meta.json",
  originalDesktop: "original-desktop.png",
  originalMobile: "original-mobile.png",
  cloneDesktop: "clone-desktop.png",
  cloneMobile: "clone-mobile.png",
  renderedDom: "rendered-dom.html",
  computedStyles: "computed-styles.json",
  layoutMapDesktop: "layout-map.desktop.json",
  layoutMapMobile: "layout-map.mobile.json",
  rawTokens: "design-tokens.raw.json",
  har: "network.har",
  clone: "clone.html",
  verification: "verification.json",
  diffDesktop: "diff-desktop.png",
  diffMobile: "diff-mobile.png",
  failureReport: "failure-report.md",
} as const;

// 웹 경로 (app/captures/[...path] 가 captures/ 를 정적 서빙)
export function cloneWebPath(id: string): string {
  return `/captures/${id}/clone.html`;
}
export function captureAssetWebPath(id: string, name: string): string {
  return `/captures/${id}/assets/${name}`;
}
