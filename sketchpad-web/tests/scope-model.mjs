import assert from "node:assert/strict";

import {
  axisPosition,
  displayTime,
  scopePointPosition,
} from "../web/scope-model.js";

assert.equal(displayTime(null, null, 8), null);
assert.equal(displayTime(100, 5, 5.025), 100.025);

assert.equal(axisPosition(0, 1024), 0);
assert.equal(axisPosition(511, 1024), 511.5);
assert.equal(axisPosition(1022, 1024), 1023);

assert.deepEqual(
  scopePointPosition({ physical_x: 0, physical_y: 0 }, 1024, 768),
  { x: 0, y: 767 },
);
assert.deepEqual(
  scopePointPosition({ physical_x: 1022, physical_y: 1022 }, 1024, 768),
  { x: 1023, y: 0 },
);
assert.deepEqual(
  scopePointPosition({ physical_x: 511, physical_y: 511 }, 1024, 768),
  { x: 511.5, y: 383.5 },
);

console.log("scope clock and boundary mapping passed");
