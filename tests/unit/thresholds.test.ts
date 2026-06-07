import { describe, it, expect } from "vitest";
import {
  viewportPassed,
  overallPassed,
  retentionPassed,
  CLONE_THRESHOLDS,
  RETENTION_THRESHOLDS,
} from "../../lib/thresholds";
import type { ViewportScore } from "../../lib/clone-types";

// Helper: build a ViewportScore (passed 필드는 viewportPassed 로 채움).
function makeScore(p: Omit<ViewportScore, "passed">): ViewportScore {
  return { ...p, passed: viewportPassed(p) };
}

describe("viewportPassed", () => {
  it("passes when (pixel+ssim)/2, layout, palette all meet thresholds", () => {
    expect(
      viewportPassed({
        pixelSimilarity: 0.92,
        ssim: 0.9,
        layoutSimilarity: 0.86,
        paletteSimilarity: 0.86,
      }),
    ).toBe(true);
  });

  it("passes exactly at every boundary (visual=0.90, layout=0.85, palette=0.85)", () => {
    expect(
      viewportPassed({
        pixelSimilarity: 0.9,
        ssim: 0.9,
        layoutSimilarity: CLONE_THRESHOLDS.layout,
        paletteSimilarity: CLONE_THRESHOLDS.palette,
      }),
    ).toBe(true);
  });

  it("fails when visual average is just below 0.90", () => {
    // (0.90 + 0.899)/2 = 0.8995 < 0.90
    expect(
      viewportPassed({
        pixelSimilarity: 0.9,
        ssim: 0.899,
        layoutSimilarity: 0.95,
        paletteSimilarity: 0.95,
      }),
    ).toBe(false);
  });

  it("fails when layout is below 0.85 even if visual & palette pass", () => {
    expect(
      viewportPassed({
        pixelSimilarity: 0.95,
        ssim: 0.95,
        layoutSimilarity: 0.8499,
        paletteSimilarity: 0.95,
      }),
    ).toBe(false);
  });

  it("fails when palette is below 0.85 even if visual & layout pass", () => {
    expect(
      viewportPassed({
        pixelSimilarity: 0.95,
        ssim: 0.95,
        layoutSimilarity: 0.95,
        paletteSimilarity: 0.8499,
      }),
    ).toBe(false);
  });
});

describe("overallPassed", () => {
  const goodViewport = makeScore({
    pixelSimilarity: 0.95,
    ssim: 0.95,
    layoutSimilarity: 0.9,
    paletteSimilarity: 0.9,
  });
  const badViewport = makeScore({
    pixelSimilarity: 0.5,
    ssim: 0.5,
    layoutSimilarity: 0.5,
    paletteSimilarity: 0.5,
  });

  it("passes when both viewports pass, sectionCountDiff<=1, fontSimilarity>=0.80", () => {
    expect(
      overallPassed({
        desktop: goodViewport,
        mobile: goodViewport,
        sectionCountDiff: 1,
        fontSimilarity: 0.8,
      }),
    ).toBe(true);
  });

  it("fails when desktop viewport fails", () => {
    expect(
      overallPassed({
        desktop: badViewport,
        mobile: goodViewport,
        sectionCountDiff: 0,
        fontSimilarity: 0.95,
      }),
    ).toBe(false);
  });

  it("fails when mobile viewport fails", () => {
    expect(
      overallPassed({
        desktop: goodViewport,
        mobile: badViewport,
        sectionCountDiff: 0,
        fontSimilarity: 0.95,
      }),
    ).toBe(false);
  });

  it("fails when sectionCountDiff exceeds the allowed max (2 > 1)", () => {
    expect(
      overallPassed({
        desktop: goodViewport,
        mobile: goodViewport,
        sectionCountDiff: 2,
        fontSimilarity: 0.95,
      }),
    ).toBe(false);
  });

  it("fails when fontSimilarity is just below 0.80", () => {
    expect(
      overallPassed({
        desktop: goodViewport,
        mobile: goodViewport,
        sectionCountDiff: 0,
        fontSimilarity: 0.7999,
      }),
    ).toBe(false);
  });

  it("passes exactly at the font boundary (0.80)", () => {
    expect(
      overallPassed({
        desktop: goodViewport,
        mobile: goodViewport,
        sectionCountDiff: 0,
        fontSimilarity: CLONE_THRESHOLDS.font,
      }),
    ).toBe(true);
  });
});

describe("retentionPassed", () => {
  const allMeet = {
    designTokenRetention: RETENTION_THRESHOLDS.designToken,
    layoutRetention: RETENTION_THRESHOLDS.layout,
    typographyRetention: RETENTION_THRESHOLDS.typography,
    spacingRetention: RETENTION_THRESHOLDS.spacing,
    colorRetention: RETENTION_THRESHOLDS.color,
    componentRetention: RETENTION_THRESHOLDS.component,
  };

  it("passes when every retention metric meets its threshold exactly", () => {
    expect(retentionPassed(allMeet)).toBe(true);
  });

  it("passes comfortably when all metrics exceed thresholds", () => {
    expect(
      retentionPassed({
        designTokenRetention: 0.99,
        layoutRetention: 0.95,
        typographyRetention: 0.99,
        spacingRetention: 0.95,
        colorRetention: 0.95,
        componentRetention: 0.95,
      }),
    ).toBe(true);
  });

  it("fails when designTokenRetention is below 0.90", () => {
    expect(retentionPassed({ ...allMeet, designTokenRetention: 0.8999 })).toBe(false);
  });

  it("fails when layoutRetention is below 0.88", () => {
    expect(retentionPassed({ ...allMeet, layoutRetention: 0.8799 })).toBe(false);
  });

  it("fails when typographyRetention is below 0.90", () => {
    expect(retentionPassed({ ...allMeet, typographyRetention: 0.8999 })).toBe(false);
  });

  it("fails when spacingRetention is below 0.88", () => {
    expect(retentionPassed({ ...allMeet, spacingRetention: 0.8799 })).toBe(false);
  });

  it("fails when colorRetention is below 0.85", () => {
    expect(retentionPassed({ ...allMeet, colorRetention: 0.8499 })).toBe(false);
  });

  it("fails when componentRetention is below 0.88", () => {
    expect(retentionPassed({ ...allMeet, componentRetention: 0.8799 })).toBe(false);
  });
});
