/**
 * `npx tsx scripts/make-web-icons.ts`: the home-screen icons of the web app (public/), made from assets/icon.png:
 * icon-192.png and icon-512.png for the manifest, apple-touch-icon.png (180) for iPhones. The icon has no alpha channel
 * (iOS would paint transparent pixels black), and is shrunk by averaging, so the edges stay smooth.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = path.resolve(__dirname, '..');
const src = PNG.sync.read(fs.readFileSync(path.join(root, 'assets', 'icon.png')));

/** Box-filter resize to size x size, flattening any transparency onto the dark background. */
function resize(size: number): PNG {
  const out = new PNG({ width: size, height: size });
  const bg = [0x14, 0x16, 0x1a];
  const scaleX = src.width / size;
  const scaleY = src.height / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * scaleX);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * scaleX));
      const y0 = Math.floor(y * scaleY);
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scaleY));
      const sum = [0, 0, 0];
      let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * src.width + sx) * 4;
          const a = src.data[i + 3] / 255;
          for (let c = 0; c < 3; c++) sum[c] += src.data[i + c] * a + bg[c] * (1 - a);
          n++;
        }
      }
      const o = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) out.data[o + c] = Math.round(sum[c] / n);
      out.data[o + 3] = 255;
    }
  }
  return out;
}

fs.mkdirSync(path.join(root, 'public'), { recursive: true });
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
] as const) {
  fs.writeFileSync(path.join(root, 'public', name), PNG.sync.write(resize(size)));
  console.log(`public/${name}`);
}
