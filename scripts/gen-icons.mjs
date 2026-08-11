import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(scriptDir, "../public/icons");
mkdirSync(outDir, { recursive: true });

function svg(size, padding) {
  const inner = size - padding * 2;
  const cx = size / 2;
  const cy = size / 2;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#a78bfa"/>
      <stop offset="1" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${size * 0.22}" fill="url(#g)"/>
  <g transform="translate(${cx} ${cy})">
    <circle r="${inner * 0.30}" fill="#ffffff" opacity="0.95"/>
    <path d="M ${-inner * 0.10} ${-inner * 0.15} L ${inner * 0.16} 0 L ${-inner * 0.10} ${inner * 0.15} Z" fill="#7c3aed"/>
    <circle cx="${inner * 0.30}" cy="${-inner * 0.30}" r="${inner * 0.09}" fill="#ffffff"/>
    <circle cx="${-inner * 0.32}" cy="${inner * 0.30}" r="${inner * 0.07}" fill="#ffffff" opacity="0.85"/>
  </g>
</svg>`;
}

const jobs = [
  { file: "icon-192.png", size: 192, padding: 0 },
  { file: "icon-512.png", size: 512, padding: 0 },
  { file: "maskable-192.png", size: 192, padding: 192 * 0.14 },
  { file: "maskable-512.png", size: 512, padding: 512 * 0.14 },
  { file: "apple-touch-icon.png", size: 180, padding: 0 },
];

for (const job of jobs) {
  await sharp(Buffer.from(svg(job.size, job.padding)))
    .png()
    .toFile(`${outDir}/${job.file}`);
  console.log("wrote", job.file);
}
