import assert from "node:assert/strict";

import {
  axisPosition,
  displayTime,
  scopePointPosition,
} from "../web/scope-model.js";

assert.equal(displayTime(null, null, 8), null);
assert.equal(displayTime(100, 5, 5.025), 100.025);

assert.equal(axisPosition(-511, false, 1024), 0);
assert.equal(axisPosition(511, false, 1024), 1023);
assert.equal(axisPosition(0, true, 1024), 0);
assert.equal(axisPosition(511, true, 1024), 1023);

assert.deepEqual(
  scopePointPosition({ x: -511, y: -511, origin: "center" }, 1024, 768),
  { x: 0, y: 767 },
);
assert.deepEqual(
  scopePointPosition({ x: 511, y: 511, origin: "center" }, 1024, 768),
  { x: 1023, y: 0 },
);
assert.deepEqual(
  scopePointPosition({ x: 0, y: 0, origin: "lower_left" }, 1024, 768),
  { x: 0, y: 767 },
);
assert.deepEqual(
  scopePointPosition({ x: 511, y: 511, origin: "lower_left" }, 1024, 768),
  { x: 1023, y: 0 },
);

console.log("scope clock and boundary mapping passed");
