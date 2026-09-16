import init, { SketchpadMachine, sketchpad_tape } from "./pkg/sketchpad_web.js";
import {
  readSharedPen,
  recordSharedPenApplication,
} from "./pen-transport.js?v=20260915-12";

const SLICE_BUDGET_MS = 0.25;
const TICKS_PER_BATCH = 16;
const MAX_SCOPE_BACKLOG = 2048;
const SCOPE_FLUSH_INTERVAL_MS = 4;
const STATUS_INTERVAL_MS = 32;
const ATBITS_ADDRESS = 0o200044;
const LPLOST_ADDRESS = 0o200042;

let machine = null;
let activeTape = null;
let running = false;
let generation = 0;
let startedAt = 0;
let displayClockStarted = false;
let scheduled = false;
let scheduledTimer = null;
let pendingScope = [];
let mainScopeBacklog = 0;
let lastScopeFlushAt = 0;
let lastStatusAt = 0;
let penView = null;
let lastPenSequence = -1;
let fallbackPen = { sequence: 0, x: 0.5, y: 0.5, radius: 12 / 1022, active: false };
let knobState = { values: [0, 0, 0, 0], meta: false };
let externalState = { quarters: [0, 0, 0, 0], meta: false };
let toggleState = {
  register20: { quarters: [0o400, 0, 0, 0], meta: false },
  register25: { quarters: [0o400, 0, 0, 0], meta: false },
};

const wasmReady = init();
const loopChannel = new MessageChannel();
loopChannel.port1.onmessage = runSlice;

function errorText(error) {
  return typeof error === "string" ? error : error?.message ?? String(error);
}

function postError(error) {
  running = false;
  self.postMessage({ type: "error", generation, message: errorText(error) });
}

function scheduleRun(delay = 0) {
  if (scheduled || !running) return;
  scheduled = true;
  if (delay > 0) {
    scheduledTimer = setTimeout(() => {
      scheduledTimer = null;
      loopChannel.port2.postMessage(0);
    }, delay);
  } else {
    loopChannel.port2.postMessage(0);
  }
}

function cancelScheduledRun() {
  scheduled = false;
  if (scheduledTimer !== null) {
    clearTimeout(scheduledTimer);
    scheduledTimer = null;
  }
}

function currentPen() {
  return penView ? readSharedPen(penView) : fallbackPen;
}

function applyPen() {
  if (!machine) return;
  const pen = currentPen();
  if (pen.sequence === lastPenSequence) return;
  machine.set_light_pen(pen.x, pen.y, pen.radius, pen.active);
  lastPenSequence = pen.sequence;
  if (penView) {
    recordSharedPenApplication(
      penView,
      pen,
      performance.timeOrigin + performance.now(),
    );
  } else {
    self.postMessage({ type: "pen-applied", generation, sequence: pen.sequence });
  }
}

function applyKnobs() {
  machine?.set_knob_register(...knobState.values, knobState.meta);
}

function applyExternalInput() {
  machine?.set_external_input_register(...externalState.quarters, externalState.meta);
}

function applyToggles() {
  if (!machine) return;
  machine.set_toggle_register(
    0o20,
    ...toggleState.register20.quarters,
    toggleState.register20.meta,
  );
  machine.set_toggle_register(
    0o25,
    ...toggleState.register25.quarters,
    toggleState.register25.meta,
  );
}

function flushScope(now = performance.now()) {
  if (pendingScope.length === 0) return;
  self.postMessage({ type: "scope", generation, events: pendingScope });
  pendingScope = [];
  lastScopeFlushAt = now;
}

function postStatus(now = performance.now()) {
  if (!machine) return;
  const simulatedTime = machine.simulated_time;
  self.postMessage({
    type: "status",
    generation,
    running,
    simulatedTime,
    detectionCount: machine.light_pen_detection_count,
    lost: machine.memory_word(LPLOST_ADDRESS, simulatedTime).meta,
    atBits: machine.memory_word(ATBITS_ADDRESS, simulatedTime).value,
  });
  lastStatusAt = now;
}

function runSlice() {
  scheduled = false;
  if (!running || !machine) return;
  const sliceStartedAt = performance.now();
  const realElapsed = () => Math.max(0, (performance.now() - startedAt) / 1000);

  try {
    applyPen();
    while (
      (!displayClockStarted || machine.simulated_time < realElapsed())
      && mainScopeBacklog + pendingScope.length < MAX_SCOPE_BACKLOG
      && performance.now() - sliceStartedAt < SLICE_BUDGET_MS
    ) {
      const events = machine.step_batch(realElapsed(), TICKS_PER_BATCH);
      for (const event of events) {
        if (event?.kind !== "scope_point") continue;
        if (!displayClockStarted) {
          displayClockStarted = true;
          startedAt = performance.now() - event.at_seconds * 1000;
        }
        pendingScope.push(event);
      }
      applyPen();
    }
  } catch (error) {
    flushScope();
    postError(error);
    return;
  }

  const now = performance.now();
  if (
    pendingScope.length >= 128
    || (pendingScope.length > 0 && now - lastScopeFlushAt >= SCOPE_FLUSH_INTERVAL_MS)
  ) {
    flushScope(now);
  }
  if (now - lastStatusAt >= STATUS_INTERVAL_MS) postStatus(now);

  const backpressured = mainScopeBacklog + pendingScope.length >= MAX_SCOPE_BACKLOG;
  scheduleRun(backpressured ? 1 : 0);
}

async function initialize(message) {
  running = false;
  cancelScheduledRun();
  await wasmReady;
  generation = message.generation;
  if (machine) machine.free();
  machine = new SketchpadMachine();
  activeTape = message.tape ? new Uint8Array(message.tape) : sketchpad_tape();
  penView = message.penBuffer ? new Int32Array(message.penBuffer) : null;
  fallbackPen = message.pen ?? fallbackPen;
  knobState = message.config.knobs;
  externalState = message.config.external;
  toggleState = message.config.toggles;
  lastPenSequence = -1;
  displayClockStarted = false;
  pendingScope = [];
  mainScopeBacklog = 0;
  lastScopeFlushAt = 0;
  lastStatusAt = 0;
  machine.mount_tape(activeTape, 0);
  applyKnobs();
  applyExternalInput();
  applyToggles();
  applyPen();
  machine.codabo(0);
  postStatus();
  self.postMessage({ type: "ready", generation });
}

function startMachine() {
  if (!machine || running) return;
  running = true;
  startedAt = displayClockStarted
    ? performance.now() - machine.simulated_time * 1000
    : performance.now();
  postStatus();
  scheduleRun();
}

function pauseMachine() {
  running = false;
  cancelScheduledRun();
  flushScope();
  postStatus();
}

async function handleMessage(message) {
  switch (message.type) {
    case "initialize":
      await initialize(message);
      break;
    case "run":
      startMachine();
      break;
    case "pause":
      pauseMachine();
      break;
    case "pen":
      fallbackPen = message.pen;
      applyPen();
      break;
    case "pen-update":
      applyPen();
      break;
    case "knobs":
      knobState = message.state;
      applyKnobs();
      break;
    case "external":
      externalState = message.state;
      applyExternalInput();
      break;
    case "toggles":
      toggleState = message.state;
      applyToggles();
      break;
    case "display-backlog":
      mainScopeBacklog = message.points;
      break;
    default:
      throw new Error(`unknown worker message: ${message.type}`);
  }
}

let messageChain = Promise.resolve();
self.onmessage = ({ data }) => {
  messageChain = messageChain.then(() => handleMessage(data)).catch(postError);
};
