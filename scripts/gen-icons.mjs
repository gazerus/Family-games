import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(scriptDir, "../public/icons");
const resourcesDir = path.join(scriptDir, "../resources");
mkdirSync(outDir, { recursive: true });
mkdirSync(resourcesDir, { recursive: true });

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

function splashSvg(size) {
  const logoSize = size * 0.42;
  const offset = (size - logoSize) / 2;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#17151c"/>
  <g transform="translate(${offset} ${offset})">
    ${svg(logoSize, 0)
      .replace(/<\?xml[^>]*>/, "")
      .replace(/<svg[^>]*>/, "")
      .replace("</svg>", "")}
  </g>
</svg>`;
}

const jobs = [
  { file: `${outDir}/icon-192.png`, size: 192, render: svg, padding: 0 },
  { file: `${outDir}/icon-512.png`, size: 512, render: svg, padding: 0 },
  { file: `${outDir}/maskable-192.png`, size: 192, render: svg, padding: 192 * 0.14 },
  { file: `${outDir}/maskable-512.png`, size: 512, render: svg, padding: 512 * 0.14 },
  { file: `${outDir}/apple-touch-icon.png`, size: 180, render: svg, padding: 0 },
  // Source images for @capacitor/assets (Android/iOS app icon + splash generation).
  { file: `${resourcesDir}/icon.png`, size: 1024, render: svg, padding: 0 },
  { file: `${resourcesDir}/splash.png`, size: 2732, render: splashSvg, padding: 0 },
];

for (const job of jobs) {
  await sharp(Buffer.from(job.render(job.size, job.padding)))
    .png()
    .toFile(job.file);
  console.log("wrote", job.file);
}
