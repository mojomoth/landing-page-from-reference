// 임계값 단일 출처. CLONE_SPEC.md §0/§4.
import type { ViewportScore, Viewport, ViewportSize } from "./clone-types";

export const VIEWPORTS: Record<Viewport, ViewportSize> = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
};

export const CLONE_THRESHOLDS = {
  visualSimilarity: 0.9, // (pixel + ssim) / 2
  layout: 0.85,
  palette: 0.85,
  font: 0.8,
  sectionCountDiff: 1,
} as const;

export const RETENTION_THRESHOLDS = {
  designToken: 0.9,
  layout: 0.88,
  typography: 0.9,
  spacing: 0.88,
  color: 0.85,
  component: 0.88,
} as const;

/** viewport 점수 통과: (pixel+ssim)/2 ≥ 0.90 && layout ≥ 0.85 && palette ≥ 0.85 */
export function viewportPassed(s: Omit<ViewportScore, "passed">): boolean {
  const visual = (s.pixelSimilarity + s.ssim) / 2;
  return (
    visual >= CLONE_THRESHOLDS.visualSimilarity &&
    s.layoutSimilarity >= CLONE_THRESHOLDS.layout &&
    s.paletteSimilarity >= CLONE_THRESHOLDS.palette
  );
}

export function overallPassed(args: {
  desktop: ViewportScore;
  mobile: ViewportScore;
  sectionCountDiff: number;
  fontSimilarity: number;
}): boolean {
  return (
    args.desktop.passed &&
    args.mobile.passed &&
    args.sectionCountDiff <= CLONE_THRESHOLDS.sectionCountDiff &&
    args.fontSimilarity >= CLONE_THRESHOLDS.font
  );
}

export function retentionPassed(r: {
  designTokenRetention: number;
  layoutRetention: number;
  typographyRetention: number;
  spacingRetention: number;
  colorRetention: number;
  componentRetention: number;
}): boolean {
  return (
    r.designTokenRetention >= RETENTION_THRESHOLDS.designToken &&
    r.layoutRetention >= RETENTION_THRESHOLDS.layout &&
    r.typographyRetention >= RETENTION_THRESHOLDS.typography &&
    r.spacingRetention >= RETENTION_THRESHOLDS.spacing &&
    r.colorRetention >= RETENTION_THRESHOLDS.color &&
    r.componentRetention >= RETENTION_THRESHOLDS.component
  );
}
