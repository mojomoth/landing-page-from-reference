// fixture 바이너리 에셋 생성(결정적) — hero.png 그라데이션. pngjs 사용.
import { PNG } from "pngjs";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const dir = join(process.cwd(), "public", "fixture", "assets");
await mkdir(dir, { recursive: true });

const w = 800;
const h = 400;
const png = new PNG({ width: w, height: h });
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const i = (w * y + x) << 2;
    const t = x / w;
    const u = y / h;
    png.data[i] = Math.round(40 + 120 * t + 24 * u); // R
    png.data[i + 1] = Math.round(70 + 70 * u + 20 * t); // G
    png.data[i + 2] = Math.round(210 - 60 * t + 30 * u); // B
    png.data[i + 3] = 255;
  }
}
await writeFile(join(dir, "hero.png"), PNG.sync.write(png));
console.log("✓ hero.png 생성");
