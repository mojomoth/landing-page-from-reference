// SSOT 데이터 모델 (clone-first). CLONE_SPEC.md §2 의 거울. 모든 모듈이 여기서 import.

export type Viewport = "desktop" | "mobile";

export type CaptureStatus =
  | "pending" | "rendering" | "capturing" | "mirroring_assets"
  | "generating_clone" | "verifying" | "passed" | "failed";

export interface ViewportSize {
  width: number;
  height: number;
}

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutNode {
  selector: string;
  role: string; // tag/visual role
  box: BBox;
  text: string | null;
  isText: boolean;
}

export interface LayoutMap {
  viewport: Viewport;
  pageWidth: number;
  pageHeight: number;
  sections: LayoutNode[]; // 주요 섹션 bbox
  textBlocks: LayoutNode[]; // 텍스트 element bbox (마스킹용)
}

export interface ComputedStyleEntry {
  selector: string;
  styles: Record<string, string>;
}

export interface RawDesignTokens {
  colors: string[];
  fontFamilies: string[];
  fontSizes: string[];
  fontWeights: string[];
  lineHeights: string[];
  letterSpacings: string[];
  radii: string[];
  shadows: string[];
  gradients: string[];
  spacings: string[];
}

export interface CaptureMeta {
  captureId: string;
  url: string;
  status: CaptureStatus;
  viewports: Viewport[];
  timings: Record<string, number>;
  blockers: string[]; // cookie/modal/CSP 등
  assetCount: number;
  fontsLoaded: boolean;
  imageCount: number;
  sectionCount: Partial<Record<Viewport, number>>;
  createdAt: string;
  updatedAt: string;
}

export interface ViewportScore {
  pixelSimilarity: number; // 1 - mismatched/total (pixelmatch)
  ssim: number; // 0..1 (ssim.js)
  layoutSimilarity: number; // bbox IoU 평균
  paletteSimilarity: number; // color histogram overlap
  passed: boolean;
}

export interface VerificationResult {
  captureId: string;
  desktop: ViewportScore;
  mobile: ViewportScore;
  sectionCountDiff: number;
  fontSimilarity: number;
  overallPassed: boolean;
  failureReasons: string[];
  createdAt: string;
}

export interface DesignRetentionResult {
  designTokenRetention: number;
  layoutRetention: number;
  typographyRetention: number;
  spacingRetention: number;
  colorRetention: number;
  componentRetention: number;
  passed: boolean;
}
