import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { Worker } from "node:worker_threads";

import {
  PEN_INDEX,
  PEN_STATE_LENGTH,
  readSharedPenApplication,
  writeSharedPen,
} from "../web/pen-transport.js";

const penBuffer = new SharedArrayBuffer(PEN_STATE_LENGTH * Int32Array.BYTES_PER_ELEMENT);
const penView = new Int32Array(penBuffer);
writeSharedPen(
  penView,
  { x: 0.5, y: 0.5, radius: 40 / 1022, active: false },
  1,
  performance.timeOrigin + performance.now(),
);

const worker = new Worker(new URL("./worker-node-wrapper.mjs", import.meta.url), {
  type: "module",
});
let ready = false;
let scopePoints = 0;
let simulatedTime = 0;
let penInitialized = false;
let penPositionVersion = 0;
let workerError = null;
worker.on("message", (message) => {
  if (message.type === "error") workerError = new Error(message.message);
  if (message.type === "ready") {
    ready = true;
    worker.postMessage({ type: "run" });
  }
  if (message.type === "scope") scopePoints += message.events.length;
  if (message.type === "status") {
    simulatedTime = message.simulatedTime;
    penInitialized = message.penInitialized;
    penPositionVersion = message.penPositionVersion;
  }
});
worker.on("error", (error) => {
  workerError = error;
});

worker.postMessage({
  type: "initialize",
  generation: 1,
  tape: null,
  penBuffer,
  pen: null,
  config: {
    knobs: { values: [0, 0, 0, 0], meta: false },
    external: { quarters: [0, 0, 0, 0], meta: false },
    toggles: {
      register20: { quarters: [0o400, 0, 0, 0], meta: false },
      register25: { quarters: [0o400, 0, 0, 0], meta: false },
    },
  },
});

const deadline = performance.now() + 15_000;
while (
  !workerError
  && performance.now() < deadline
  && (!ready || scopePoints === 0 || simulatedTime <= 0)
) {
  await delay(5);
}

if (workerError) throw workerError;
assert.equal(ready, true, "the worker must initialize the bundled machine");
assert.ok(simulatedTime > 0, "the worker must advance TX-2 time");
assert.ok(scopePoints > 0, "the worker must forward real unit-60 points");

writeSharedPen(
  penView,
  { x: 0.9, y: 0.9, radius: 40 / 1022, active: true },
  2,
  performance.timeOrigin + performance.now(),
);
worker.postMessage({ type: "pen-update" });
const penDeadline = performance.now() + 1000;
while (Atomics.load(penView, PEN_INDEX.appliedSequence) !== 2 && performance.now() < penDeadline) {
  await delay(1);
}
const application = readSharedPenApplication(penView);
assert.equal(application.sequence, 2, "the running worker must read the latest atomic pen state");
assert.ok(application.latencyMilliseconds >= 0);

await delay(250);
assert.equal(penInitialized, false,
  "a blank first click must not invent a light-pen position");

writeSharedPen(
  penView,
  { x: 575 / 1022, y: 1 - 575 / 1022, radius: 40 / 1022, active: true },
  3,
  performance.timeOrigin + performance.now(),
);
worker.postMessage({ type: "pen-update" });
const movedPenDeadline = performance.now() + 1000;
while (Atomics.load(penView, PEN_INDEX.appliedSequence) !== 3
  && performance.now() < movedPenDeadline) {
  await delay(1);
}
assert.equal(Atomics.load(penView, PEN_INDEX.appliedSequence), 3,
  "the active pen must keep following the pointer during acquisition");

const initializationDeadline = performance.now() + 3000;
while (!penInitialized && performance.now() < initializationDeadline) {
  await delay(5);
}
assert.equal(penInitialized, true,
  "a pen activated after boot must initialize from a real optical detection");
assert.ok(penPositionVersion > 0,
  "initial pen acquisition must store an original Sketchpad position");

worker.postMessage({ type: "pause" });
await worker.terminate();

console.log(JSON.stringify({
  simulatedTime,
  scopePoints,
  penApplyMs: application.latencyMilliseconds,
  penInitialized,
  penPositionVersion,
}));
