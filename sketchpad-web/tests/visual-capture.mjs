import assert from "node:assert/strict";

import {
  captureFileName,
  supportedCaptureType,
  VisualCapture,
} from "../web/visual-capture.js";

const fakeRecorder = {
  isTypeSupported(type) {
    return type === "video/webm;codecs=vp8";
  },
};

assert.equal(supportedCaptureType(null), null);
assert.equal(supportedCaptureType(fakeRecorder), "video/webm;codecs=vp8");
assert.equal(
  captureFileName(new Date("2026-09-16T03:12:34.567Z")),
  "sketchpad-visual-2026-09-16T03-12-34.567Z.webm",
);

const calls = [];
const sourceCanvas = { width: 1024, height: 1024, captureStream() {} };
const capture = new VisualCapture(sourceCanvas, () => ({
  x: 0.25,
  y: 0.75,
  active: true,
  penState: "TRACKING",
  simulatedTime: 123.456,
}), fakeRecorder);
capture.captureCanvas = { width: 0, height: 0 };
capture.captureContext = {
  beginPath() {},
  drawImage(...arguments_) { calls.push(["drawImage", ...arguments_]); },
  fillRect(...arguments_) { calls.push(["fillRect", ...arguments_]); },
  fillText(...arguments_) { calls.push(["fillText", ...arguments_]); },
  lineTo(...arguments_) { calls.push(["lineTo", ...arguments_]); },
  moveTo(...arguments_) { calls.push(["moveTo", ...arguments_]); },
  stroke() {},
};
capture.drawFrame(100, true);
assert.equal(capture.captureCanvas.width, 1024);
assert.equal(capture.captureCanvas.height, 1024);
assert.ok(calls.some(([name, x, y]) => name === "moveTo" && x === 246 && y === 768));
assert.ok(calls.some(([name, text]) => name === "fillText"
  && text.includes("INPUT DOWN  TRACKING  X 0.2500  Y 0.7500  TX2 123.456 s")));

console.log("visual capture naming, codec selection, and diagnostic overlay passed");
