import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const [inputPath, outputDirectory] = process.argv.slice(2);
if (!inputPath || !outputDirectory) {
  throw new Error("usage: node tools/render-relax-motion.mjs TRACE.json OUTPUT_DIRECTORY");
}

const report = JSON.parse(await readFile(inputPath, "utf8"));
const samples = report.solve?.motion;
if (!Array.isArray(samples) || samples.length < 2) {
  throw new Error("the report does not contain a RELAX motion trace");
}

const parseOnesComplementOctal = (text) => {
  const value = Number.parseInt(text, 8);
  const modulus = 2 ** 36;
  return value >= modulus / 2 ? -(modulus - 1 - value) : value;
};

const vertices = (sample) => sample.geometry.map(({ first }) => ({
  x: parseOnesComplementOctal(first[0]),
  y: parseOnesComplementOctal(first[1]),
}));

const allVertices = samples.flatMap(vertices);
const xMin = Math.min(...allVertices.map(({ x }) => x));
const xMax = Math.max(...allVertices.map(({ x }) => x));
const yMin = Math.min(...allVertices.map(({ y }) => y));
const yMax = Math.max(...allVertices.map(({ y }) => y));
const plot = { left: 92, top: 116, width: 816, height: 514 };
const scale = Math.min(plot.width / (xMax - xMin), plot.height / (yMax - yMin));
const offsetX = plot.left + (plot.width - (xMax - xMin) * scale) / 2;
const offsetY = plot.top + (plot.height - (yMax - yMin) * scale) / 2;
const mapPoint = ({ x, y }) => ({
  x: offsetX + (x - xMin) * scale,
  y: offsetY + (y - yMin) * scale,
});
const closePointsText = (sample) => {
  const points = vertices(sample).map(mapPoint);
  points.push(points[0]);
  return points.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
};

const framesPerSecond = 24;
const speed = 8;
const leadFrames = Math.round(framesPerSecond * 1.2);
const motionDuration = samples.at(-1).elapsedSeconds / speed;
const motionFrames = Math.ceil(motionDuration * framesPerSecond);
const tailFrames = Math.round(framesPerSecond * 1.8);
const frameCount = leadFrames + motionFrames + tailFrames;
const initialPoints = closePointsText(samples[0]);

await mkdir(outputDirectory, { recursive: true });

for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
  const motionFrame = Math.max(0, Math.min(motionFrames - 1, frameIndex - leadFrames));
  const targetTime = motionFrame / framesPerSecond * speed;
  let sampleIndex = 0;
  while (sampleIndex + 1 < samples.length
    && samples[sampleIndex + 1].elapsedSeconds <= targetTime) {
    sampleIndex += 1;
  }
  if (frameIndex >= leadFrames + motionFrames) sampleIndex = samples.length - 1;
  const sample = samples[sampleIndex];
  const angleError = Math.asin(Math.min(1, Math.abs(sample.maximumAbsoluteCosine)))
    * 180 / Math.PI;
  const solved = frameIndex >= leadFrames + motionFrames;
  const sweep = solved ? 8 : Math.min(8, sample.completedPasses + 1);
  const currentPoints = closePointsText(sample);
  const endpointCircles = vertices(sample).map(mapPoint).map(({ x, y }) =>
    `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="3.2" fill="#d8fff1"/>`).join("");
  const progress = solved ? 1 : Math.max(0, Math.min(1, targetTime / samples.at(-1).elapsedSeconds));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="760" viewBox="0 0 1000 760">
  <rect width="1000" height="760" rx="28" fill="#06100e"/>
  <text x="56" y="60" fill="#d8fff1" font-family="Helvetica,Arial,sans-serif" font-size="25" font-weight="500">SKETCHPAD RELAX</text>
  <text x="944" y="60" text-anchor="end" fill="#90ada4" font-family="Helvetica,Arial,sans-serif" font-size="18">${solved ? "SOLVED" : `SWEEP ${sweep} OF 8`}</text>
  <polyline points="${initialPoints}" fill="none" stroke="#718a82" stroke-width="2" stroke-dasharray="8 9" opacity="0.52"/>
  <polyline points="${currentPoints}" fill="none" stroke="#284a40" stroke-width="9" opacity="0.62"/>
  <polyline points="${currentPoints}" fill="none" stroke="#d8fff1" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round"/>
  ${endpointCircles}
  <text x="56" y="675" fill="#90ada4" font-family="Helvetica,Arial,sans-serif" font-size="17">WORST CORNER ERROR</text>
  <text x="56" y="711" fill="#d8fff1" font-family="Helvetica,Arial,sans-serif" font-size="28" font-weight="500">${angleError.toFixed(angleError < 0.01 ? 4 : 2)}°</text>
  <text x="944" y="684" text-anchor="end" fill="#90ada4" font-family="Helvetica,Arial,sans-serif" font-size="16">95 ASSEMBLY-WRITTEN STATES · 8× EMULATED TIME</text>
  <rect x="400" y="704" width="544" height="3" rx="1.5" fill="#31423d"/>
  <rect x="400" y="704" width="${(544 * progress).toFixed(2)}" height="3" rx="1.5" fill="#9cf5d7"/>
</svg>`;
  const frameName = `frame-${String(frameIndex).padStart(4, "0")}.svg`;
  await writeFile(join(outputDirectory, frameName), svg);
}

await writeFile(join(outputDirectory, "manifest.json"), JSON.stringify({
  source: basename(inputPath),
  framesPerSecond,
  speed,
  frameCount,
  sourceSamples: samples.length,
  sourceElapsedSeconds: samples.at(-1).elapsedSeconds,
  initialWorstCornerDegrees: Math.asin(Math.abs(samples[0].maximumAbsoluteCosine))
    * 180 / Math.PI,
  finalWorstCornerDegrees: Math.asin(Math.abs(samples.at(-1).maximumAbsoluteCosine))
    * 180 / Math.PI,
}, null, 2));

console.log(JSON.stringify({ outputDirectory, frameCount, sourceSamples: samples.length }));
