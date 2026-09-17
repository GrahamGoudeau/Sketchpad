import assert from "node:assert/strict";

import {
  PEN_STATE_LENGTH,
  decodePenValue,
  encodePenValue,
  readSharedPenApplication,
  readSharedPen,
  recordSharedPenApplication,
  writeSharedPen,
} from "../web/pen-transport.js";

assert.equal(encodePenValue(-1), 0);
assert.equal(encodePenValue(2), 1_000_000);
assert.equal(decodePenValue(125_000), 0.125);

const view = new Int32Array(new SharedArrayBuffer(PEN_STATE_LENGTH * Int32Array.BYTES_PER_ELEMENT));
writeSharedPen(
  view,
  { x: 0.125, y: 0.875, radius: 40 / 1022, active: true },
  17,
  1_700_000_000_125.25,
);
const pen = readSharedPen(view);
assert.equal(pen.sequence, 17);
assert.equal(pen.x, 0.125);
assert.equal(pen.y, 0.875);
assert.ok(Math.abs(pen.radius - 40 / 1022) < 0.000001);
assert.equal(pen.active, true);
recordSharedPenApplication(view, pen, 1_700_000_000_125.625);
assert.deepEqual(readSharedPenApplication(view), {
  sequence: 17,
  latencyMilliseconds: 0.375,
});

console.log("atomic light-pen transport passed");
