// 시각 유사도 순수 함수 (clone-first, CLONE_SPEC.md §3/§4).
// 브라우저/네트워크 없음. PNG Buffer 와 LayoutMap 만 입력. 측정 도구이므로 정확성 최우선.
//
// 라이브러리:
//  - pixelmatch v5 (default import) : 픽셀 단위 mismatch 카운트.
//  - pngjs v7 (PNG.sync.read / PNG.sync.write) : PNG Buffer <-> RGBA.
//  - ssim.js v3 ({ ssim }) : 구조적 유사도 (mssim).
//  - jimp v1 ({ Jimp }) : 두 이미지 해상도 정규화(resize).
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { ssim } from "ssim.js";
import { Jimp } from "jimp";
import type { LayoutMap, BBox } from "../clone-types";

export interface NormalizedPair {
  a: Buffer;
  b: Buffer;
  width: number;
  height: number;
}

export interface PixelScore {
  score: number; // 1 - mismatched/(w*h)
  diff: Buffer; // pixelmatch diff PNG
}

export interface CompareResult {
  pixelSimilarity: number;
  ssim: number;
  paletteSimilarity: number;
  diff: Buffer;
}

/**
 * 두 PNG 를 공통 min(width)/min(height) 로 resize 해 같은 해상도로 맞춘다.
 * jimp v1 API: const img = await Jimp.read(buf); img.resize({ w, h }); await img.getBuffer("image/png").
 */
export async function normalizeToSame(
  aPng: Buffer,
  bPng: Buffer,
): Promise<NormalizedPair> {
  const imgA = await Jimp.read(aPng);
  const imgB = await Jimp.read(bPng);

  const width = Math.max(1, Math.min(imgA.bitmap.width, imgB.bitmap.width));
  const height = Math.max(1, Math.min(imgA.bitmap.height, imgB.bitmap.height));

  // 이미 동일하면 resize 생략(jimp 재인코딩으로 인한 미세 손실 회피).
  if (imgA.bitmap.width !== width || imgA.bitmap.height !== height) {
    imgA.resize({ w: width, h: height });
  }
  if (imgB.bitmap.width !== width || imgB.bitmap.height !== height) {
    imgB.resize({ w: width, h: height });
  }

  const a = await imgA.getBuffer("image/png");
  const b = await imgB.getBuffer("image/png");
  return { a, b, width, height };
}

/**
 * pixelmatch 기반 픽셀 유사도. 동일 해상도 가정.
 * score = 1 - mismatched/(w*h), diff 는 pixelmatch 출력 PNG Buffer.
 */
export function pixelScore(aPng: Buffer, bPng: Buffer): PixelScore {
  const a = PNG.sync.read(aPng);
  const b = PNG.sync.read(bPng);
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);

  const diff = new PNG({ width, height });
  const mismatched = pixelmatch(a.data, b.data, diff.data, width, height, {
    threshold: 0.1,
    includeAA: false,
  });
  const total = width * height;
  const score = total === 0 ? 1 : 1 - mismatched / total;
  return { score, diff: PNG.sync.write(diff) };
}

/**
 * ssim.js 기반 구조적 유사도. RGBA {data,width,height} 두 개 -> mssim (0..1).
 */
export function ssimScore(aPng: Buffer, bPng: Buffer): number {
  const a = PNG.sync.read(aPng);
  const b = PNG.sync.read(bPng);
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);

  const imgA = {
    data: new Uint8ClampedArray(a.data.buffer, a.data.byteOffset, a.data.length),
    width: a.width,
    height: a.height,
  };
  const imgB = {
    data: new Uint8ClampedArray(b.data.buffer, b.data.byteOffset, b.data.length),
    width: b.width,
    height: b.height,
  };

  // 해상도가 다르면 ssim 이 거부하므로 안전하게 공통 크기로 잘라낸 복사본 사용.
  const a2 =
    a.width === width && a.height === height
      ? imgA
      : cropRGBA(a.data, a.width, width, height);
  const b2 =
    b.width === width && b.height === height
      ? imgB
      : cropRGBA(b.data, b.width, width, height);

  const { mssim } = ssim(a2, b2);
  if (!Number.isFinite(mssim)) return 0;
  return clamp01(mssim);
}

function cropRGBA(
  src: Buffer | Uint8Array,
  srcWidth: number,
  width: number,
  height: number,
): { data: Uint8ClampedArray; width: number; height: number } {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = (y * srcWidth + x) * 4;
      const di = (y * width + x) * 4;
      out[di] = src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
      out[di + 3] = src[si + 3];
    }
  }
  return { data: out, width, height };
}

/**
 * color histogram overlap. RGB 각 채널 16-bin 정규화 히스토그램의 교집합(min) 합을
 * 채널마다 구한 뒤 3채널 평균. 동일 분포면 1, 완전 분리면 0.
 */
export function paletteScore(aPng: Buffer, bPng: Buffer): number {
  const a = PNG.sync.read(aPng);
  const b = PNG.sync.read(bPng);
  const ha = histogram(a.data);
  const hb = histogram(b.data);

  let sum = 0;
  for (let ch = 0; ch < 3; ch++) {
    let inter = 0;
    for (let bin = 0; bin < 16; bin++) {
      inter += Math.min(ha[ch][bin], hb[ch][bin]);
    }
    sum += inter; // 정규화 히스토그램이므로 교집합 합은 0..1
  }
  return clamp01(sum / 3);
}

function histogram(data: Buffer | Uint8Array): [number[], number[], number[]] {
  const r = new Array<number>(16).fill(0);
  const g = new Array<number>(16).fill(0);
  const bl = new Array<number>(16).fill(0);
  const px = Math.floor(data.length / 4);
  for (let i = 0; i < px; i++) {
    const o = i * 4;
    r[data[o] >> 4]++;
    g[data[o + 1] >> 4]++;
    bl[data[o + 2] >> 4]++;
  }
  const n = px === 0 ? 1 : px;
  for (let bin = 0; bin < 16; bin++) {
    r[bin] /= n;
    g[bin] /= n;
    bl[bin] /= n;
  }
  return [r, g, bl];
}

/**
 * 레이아웃 유사도. 섹션 bbox 를 순서대로 IoU 평균.
 * 섹션 개수가 다르면 min 개수까지 비교하고 개수차에 비례한 페널티를 곱한다.
 */
export function layoutScore(a: LayoutMap, b: LayoutMap): number {
  const sa = a.sections;
  const sb = b.sections;
  const n = Math.min(sa.length, sb.length);
  const maxN = Math.max(sa.length, sb.length);

  if (maxN === 0) return 1; // 양쪽 모두 섹션 없음 -> 동일
  if (n === 0) return 0; // 한쪽만 섹션 있음

  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += iou(sa[i].box, sb[i].box);
  }
  const meanIoU = sum / n;

  // 개수차 페널티: 일치 비율(min/max) 을 곱한다. 개수 같으면 1.
  const countRatio = n / maxN;
  return clamp01(meanIoU * countRatio);
}

function iou(a: BBox, b: BBox): number {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;

  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const inter = ix * iy;

  const areaA = Math.max(0, a.width) * Math.max(0, a.height);
  const areaB = Math.max(0, b.width) * Math.max(0, b.height);
  const union = areaA + areaB - inter;
  if (union <= 0) return areaA === 0 && areaB === 0 ? 1 : 0;
  return clamp01(inter / union);
}

/**
 * 텍스트 영역 마스킹. 주어진 bbox 들을 회색(128) 으로 채워 retention 비교 시 텍스트 차이를 제외.
 * 입력 PNG Buffer 를 받아 마스킹된 새 PNG Buffer 를 반환한다.
 */
export function maskTextBlocks(png: Buffer, boxes: BBox[]): Buffer {
  const img = PNG.sync.read(png);
  const { width, height, data } = img;
  for (const box of boxes) {
    const x0 = Math.max(0, Math.floor(box.x));
    const y0 = Math.max(0, Math.floor(box.y));
    const x1 = Math.min(width, Math.ceil(box.x + box.width));
    const y1 = Math.min(height, Math.ceil(box.y + box.height));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const o = (y * width + x) * 4;
        data[o] = 128;
        data[o + 1] = 128;
        data[o + 2] = 128;
        data[o + 3] = 255;
      }
    }
  }
  return PNG.sync.write(img);
}

/**
 * 두 PNG 를 정규화 후 pixel/ssim/palette 유사도와 diff 이미지를 계산한다.
 */
export async function compareImages(
  aPng: Buffer,
  bPng: Buffer,
): Promise<CompareResult> {
  const { a, b } = await normalizeToSame(aPng, bPng);
  const ps = pixelScore(a, b);
  const sim = ssimScore(a, b);
  const palette = paletteScore(a, b);
  return {
    pixelSimilarity: ps.score,
    ssim: sim,
    paletteSimilarity: palette,
    diff: ps.diff,
  };
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
