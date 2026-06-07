import { describe, it, expect } from "vitest";
import { PNG } from "pngjs";
import {
  normalizeToSame,
  pixelScore,
  ssimScore,
  paletteScore,
  layoutScore,
  maskTextBlocks,
  compareImages,
} from "../../lib/verify/similarity";
import type { LayoutMap, LayoutNode, BBox } from "../../lib/clone-types";

// pngjs 로 단색 PNG Buffer 생성.
function solidPng(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
): Buffer {
  const png = new PNG({ width, height });
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    png.data[o] = r;
    png.data[o + 1] = g;
    png.data[o + 2] = b;
    png.data[o + 3] = 255;
  }
  return PNG.sync.write(png);
}

// 좌우 반반 두 색으로 나뉜 PNG (구조가 있는 이미지).
function halfPng(
  width: number,
  height: number,
  left: [number, number, number],
  right: [number, number, number],
): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const c = x < width / 2 ? left : right;
      png.data[o] = c[0];
      png.data[o + 1] = c[1];
      png.data[o + 2] = c[2];
      png.data[o + 3] = 255;
    }
  }
  return PNG.sync.write(png);
}

function node(box: BBox): LayoutNode {
  return { selector: "section", role: "section", box, text: null, isText: false };
}

function layoutMap(boxes: BBox[]): LayoutMap {
  return {
    viewport: "desktop",
    pageWidth: 1440,
    pageHeight: 900,
    sections: boxes.map(node),
    textBlocks: [],
  };
}

describe("similarity — identical images", () => {
  const a = halfPng(64, 64, [240, 30, 30], [30, 30, 240]);
  const b = halfPng(64, 64, [240, 30, 30], [30, 30, 240]);

  it("pixelScore.score >= 0.99 for identical PNG", () => {
    const { score } = pixelScore(a, b);
    expect(score).toBeGreaterThanOrEqual(0.99);
  });

  it("ssim >= 0.99 for identical PNG", () => {
    expect(ssimScore(a, b)).toBeGreaterThanOrEqual(0.99);
  });

  it("palette >= 0.99 for identical PNG", () => {
    expect(paletteScore(a, b)).toBeGreaterThanOrEqual(0.99);
  });

  it("compareImages reports near-perfect for identical PNG", async () => {
    const r = await compareImages(a, b);
    expect(r.pixelSimilarity).toBeGreaterThanOrEqual(0.99);
    expect(r.ssim).toBeGreaterThanOrEqual(0.99);
    expect(r.paletteSimilarity).toBeGreaterThanOrEqual(0.99);
    expect(Buffer.isBuffer(r.diff)).toBe(true);
  });
});

describe("similarity — white vs black 32x32", () => {
  const white = solidPng(32, 32, 255, 255, 255);
  const black = solidPng(32, 32, 0, 0, 0);

  it("pixelScore.score <= 0.1", () => {
    const { score } = pixelScore(white, black);
    expect(score).toBeLessThanOrEqual(0.1);
  });

  it("ssim <= 0.5", () => {
    expect(ssimScore(white, black)).toBeLessThanOrEqual(0.5);
  });

  it("palette is near 0 (disjoint histograms)", () => {
    expect(paletteScore(white, black)).toBeLessThanOrEqual(0.1);
  });
});

describe("normalizeToSame", () => {
  it("resizes both to common min dimensions", async () => {
    const a = solidPng(100, 80, 10, 20, 30);
    const b = solidPng(60, 120, 10, 20, 30);
    const r = await normalizeToSame(a, b);
    expect(r.width).toBe(60);
    expect(r.height).toBe(80);
    const pa = PNG.sync.read(r.a);
    const pb = PNG.sync.read(r.b);
    expect(pa.width).toBe(60);
    expect(pa.height).toBe(80);
    expect(pb.width).toBe(60);
    expect(pb.height).toBe(80);
  });

  it("compareImages handles different-sized inputs without throwing", async () => {
    const a = halfPng(120, 90, [200, 10, 10], [10, 200, 10]);
    const b = halfPng(80, 70, [200, 10, 10], [10, 200, 10]);
    const r = await compareImages(a, b);
    expect(r.pixelSimilarity).toBeGreaterThan(0.8);
    expect(r.ssim).toBeGreaterThan(0.5);
  });
});

describe("layoutScore", () => {
  it("returns 1 for identical section layouts", () => {
    const boxes: BBox[] = [
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 0, y: 60, width: 100, height: 80 },
    ];
    expect(layoutScore(layoutMap(boxes), layoutMap(boxes))).toBeCloseTo(1, 5);
  });

  it("penalizes when section counts differ", () => {
    const a: BBox[] = [
      { x: 0, y: 0, width: 100, height: 50 },
      { x: 0, y: 60, width: 100, height: 80 },
    ];
    const b: BBox[] = [{ x: 0, y: 0, width: 100, height: 50 }];
    const score = layoutScore(layoutMap(a), layoutMap(b));
    // 1 매칭, max 2 -> countRatio 0.5, IoU 1 -> 0.5
    expect(score).toBeCloseTo(0.5, 5);
  });

  it("returns low score for non-overlapping boxes", () => {
    const a: BBox[] = [{ x: 0, y: 0, width: 100, height: 50 }];
    const b: BBox[] = [{ x: 500, y: 500, width: 100, height: 50 }];
    expect(layoutScore(layoutMap(a), layoutMap(b))).toBe(0);
  });

  it("returns 1 when both maps have no sections", () => {
    expect(layoutScore(layoutMap([]), layoutMap([]))).toBe(1);
  });

  it("partial overlap yields IoU between 0 and 1", () => {
    const a: BBox[] = [{ x: 0, y: 0, width: 100, height: 100 }];
    const b: BBox[] = [{ x: 50, y: 0, width: 100, height: 100 }];
    const score = layoutScore(layoutMap(a), layoutMap(b));
    // intersection 50x100=5000, union 20000-5000=15000 -> 1/3
    expect(score).toBeCloseTo(1 / 3, 4);
  });
});

describe("maskTextBlocks", () => {
  it("fills given boxes with gray 128 and preserves outside pixels", () => {
    const src = solidPng(20, 20, 255, 0, 0);
    const masked = maskTextBlocks(src, [{ x: 5, y: 5, width: 10, height: 10 }]);
    const png = PNG.sync.read(masked);
    // inside mask
    const inside = (8 * 20 + 8) * 4;
    expect(png.data[inside]).toBe(128);
    expect(png.data[inside + 1]).toBe(128);
    expect(png.data[inside + 2]).toBe(128);
    // outside mask retains original red
    const outside = (0 * 20 + 0) * 4;
    expect(png.data[outside]).toBe(255);
    expect(png.data[outside + 1]).toBe(0);
    expect(png.data[outside + 2]).toBe(0);
  });

  it("clamps boxes outside image bounds without throwing", () => {
    const src = solidPng(10, 10, 0, 0, 0);
    const masked = maskTextBlocks(src, [
      { x: 8, y: 8, width: 100, height: 100 },
    ]);
    const png = PNG.sync.read(masked);
    const corner = (9 * 10 + 9) * 4;
    expect(png.data[corner]).toBe(128);
  });
});
