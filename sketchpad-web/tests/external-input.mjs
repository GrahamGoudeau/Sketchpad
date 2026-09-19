import assert from "node:assert/strict";

import {
  HeldControls,
  drawCanStart,
  drawKeyTransitions,
  sketchpadToggleState,
} from "../web/external-input.js";

const controls = new HeldControls();
controls.set("STARTDRAW", "keyboard", true);
controls.set("STARTDRAW", "pointer", true);
controls.set("STARTDRAW", "keyboard", false);
assert.equal(controls.has("STARTDRAW"), true,
  "one input source must not release a control held by another source");
controls.set("STARTDRAW", "pointer", false);
assert.equal(controls.has("STARTDRAW"), false);

assert.deepEqual(drawKeyTransitions(true), [
  { command: "STOPMOVEP", held: false },
  { command: "STARTDRAW", held: true },
]);
assert.deepEqual(drawKeyTransitions(false), [
  { command: "STARTDRAW", held: false },
  { command: "STOPMOVEP", held: true },
]);

assert.equal(drawCanStart(false, false), false);
assert.equal(drawCanStart(true, false), false);
assert.equal(drawCanStart(true, true), true,
  "transient assembly tracking misses must not suppress the physical D button");

assert.deepEqual(sketchpadToggleState({
  drawCycle: true,
  solve: false,
  showBlocks: true,
  showConstraints: false,
  showPoints: true,
  showTypicalVariables: true,
  suppressLines: true,
  constraintCode: 0o37,
}), {
  register20: { quarters: [0o400, 0, 0, 0], meta: false },
  register25: { quarters: [0o510, 0o400, 0, 0o37], meta: false },
}, "the browser must reproduce the verified P-constraint console state exactly");

assert.throws(() => sketchpadToggleState({
  drawCycle: true,
  solve: false,
  showBlocks: true,
  showConstraints: false,
  showPoints: false,
  showTypicalVariables: false,
  suppressLines: false,
  constraintCode: 0o1000,
}), /fit one TX-2 quarter/);

console.log("external input ownership, draw release, and toggle mapping passed");
