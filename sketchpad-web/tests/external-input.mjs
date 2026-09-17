import assert from "node:assert/strict";

import {
  HeldControls,
  drawKeyTransitions,
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

console.log("external input ownership and draw release passed");
