import assert from "node:assert/strict";

import {
  captureFileName,
  supportedCaptureType,
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

console.log("visual capture naming and codec selection passed");
