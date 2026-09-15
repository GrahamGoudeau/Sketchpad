import init, { SketchpadMachine, sketchpad_tape } from "./pkg/sketchpad_web.js";

const canvas = document.querySelector("#scope");
const context = canvas.getContext("2d", { alpha: false });
const beamHead = document.querySelector("#beam-head");
const beamReadout = document.querySelector("#beam-readout");
const lightPenSurface = document.querySelector("#light-pen-surface");
const runButton = document.querySelector("#run");
const resetButton = document.querySelector("#reset");
const tapeInput = document.querySelector("#tape");
const stateNode = document.querySelector("#state");
const timeNode = document.querySelector("#machine-time");
const countNode = document.querySelector("#point-count");
const messageNode = document.querySelector("#message");
const knobInputs = Array.from(document.querySelectorAll("[data-knob]"));
const knobMeta = document.querySelector("#knob-meta");
const externalButtonRows = document.querySelector("#external-buttons");
const externalMeta = document.querySelector("#external-meta");

for (const quarter of [4, 3, 2, 1]) {
  const row = document.createElement("div");
  row.className = "switch-row";
  const label = document.createElement("span");
  label.textContent = `Q${quarter}`;
  row.append(label);
  for (let bit = 1; bit <= 9; bit += 1) {
    const button = document.createElement("button");
    button.className = "external-button";
    button.type = "button";
    button.textContent = String(bit);
    button.dataset.externalButton = "";
    button.dataset.switchQuarter = String(quarter);
    button.dataset.switchBit = String(bit);
    button.setAttribute("aria-label", `External input bit ${quarter}.${bit}`);
    button.setAttribute("aria-pressed", "false");
    row.append(button);
  }
  externalButtonRows.append(row);
}

const externalButtons = Array.from(document.querySelectorAll("[data-external-button]"));
const heldExternalButtons = new Set();

let machine;
let activeTape;
let running = false;
let pointCount = 0;
let startedAt = performance.now();
let frameRequest;
const MACHINE_BUDGET_MS = 2.5;
const TICKS_PER_SLICE = 32;
const MAX_TICKS_PER_FRAME = 2048;
const MAX_RENDERED_POINTS_PER_FRAME = 840;
const MAX_PENDING_SCOPE_POINTS = 2048;
const MAX_CANVAS_AXIS = 1024;
const MIN_FRAME_INTERVAL_MS = 15;
const MAX_SAFE_FRAME_MS = 20;
const MAX_OVERLOADED_FRAMES = 3;
const DISPLAY_LEAD_SECONDS = 0.025;
const PHOSPHOR_HALF_LIFE_SECONDS = 0.12;
let lastFrameAt = 0;
let lastPhosphorAt = 0;
let overloadedFrames = 0;
let canvasPixelScale = 1;
const scopeQueue = [];
let scopeQueueHead = 0;
let displaySourceEpoch = null;
let displayRealEpoch = null;
let displayStoppedAt = null;
let beamRateWindowStartedAt = 0;
let beamRateWindowSpots = 0;
const lightPen = { active: false, pointerId: null, x: 0, y: 0 };

function setMessage(message, error = false) {
  messageNode.textContent = message;
  messageNode.classList.toggle("error", error);
}

function resizeCanvas() {
  const box = canvas.getBoundingClientRect();
  const requestedScale = window.devicePixelRatio || 1;
  const scale = Math.min(
    requestedScale,
    MAX_CANVAS_AXIS / Math.max(1, box.width),
    MAX_CANVAS_AXIS / Math.max(1, box.height),
  );
  canvasPixelScale = scale;
  const width = Math.max(1, Math.round(box.width * scale));
  const height = Math.max(1, Math.round(box.height * scale));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#010503";
    context.fillRect(0, 0, width, height);
  }
}

function axisPosition(value, movedOrigin, extent) {
  const normalized = movedOrigin ? value / 511 : (value + 511) / 1022;
  return Math.max(0, Math.min(extent, normalized * extent));
}

function scopePointPosition(event) {
  const leftOrigin = event.origin === "left_center" || event.origin === "lower_left";
  const bottomOrigin = event.origin === "bottom_center" || event.origin === "lower_left";
  return {
    x: axisPosition(event.x, leftOrigin, canvas.width),
    y: canvas.height - axisPosition(event.y, bottomOrigin, canvas.height),
  };
}

function pendingScopePointCount() {
  return scopeQueue.length - scopeQueueHead;
}

function resetScopeTimeline() {
  scopeQueue.length = 0;
  scopeQueueHead = 0;
  displaySourceEpoch = null;
  displayRealEpoch = null;
  displayStoppedAt = null;
  beamRateWindowStartedAt = 0;
  beamRateWindowSpots = 0;
  lastPhosphorAt = 0;
  beamHead.style.opacity = "0";
  beamReadout.textContent = "TIMED POINT BEAM · UNIT 60";
  document.documentElement.dataset.scopeQueue = "0";
}

function freezeScopeTimeline(realNowSeconds = performance.now() / 1000) {
  if (displayRealEpoch !== null && displayStoppedAt === null) {
    displayStoppedAt = realNowSeconds;
  }
}

function resumeScopeTimeline(realNowSeconds = performance.now() / 1000) {
  if (displayRealEpoch !== null && displayStoppedAt !== null) {
    displayRealEpoch += realNowSeconds - displayStoppedAt;
  }
  displayStoppedAt = null;
}

function queueScopePoint(event, realNowSeconds) {
  if (!Number.isFinite(event.at_seconds)) {
    return;
  }
  if (displaySourceEpoch === null) {
    displaySourceEpoch = event.at_seconds;
    displayRealEpoch = realNowSeconds;
  }
  scopeQueue.push(event);
  pointCount += 1;
}

function drawScopePoint(event, realElapsed) {
  const { x, y } = scopePointPosition(event);
  const strength = [0.28, 0.42, 0.62, 0.84][event.intensity] ?? 0.28;
  const radius = (0.85 + event.intensity * 0.28) * canvasPixelScale;
  context.fillStyle = `rgb(155 255 167 / ${strength})`;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);

  const detectionRadius = 18 * canvasPixelScale;
  const dx = x - lightPen.x;
  const dy = y - lightPen.y;
  if (lightPen.active && dx * dx + dy * dy <= detectionRadius * detectionRadius) {
    machine.light_pen_detected(realElapsed);
  }
  return { x, y };
}

function fadePhosphor(elapsedSeconds) {
  const fade = Math.min(
    0.995,
    1 - Math.pow(0.5, Math.max(0, elapsedSeconds) / PHOSPHOR_HALF_LIFE_SECONDS),
  );
  context.fillStyle = `rgb(1 5 3 / ${fade})`;
  context.fillRect(0, 0, canvas.width, canvas.height);
}

function renderDueScopePoints(realNowSeconds, realElapsed) {
  beamHead.style.opacity = "0";
  if (displaySourceEpoch === null) {
    document.documentElement.dataset.renderedSpots = "0";
    return 0;
  }

  const displayTime = displaySourceEpoch + (realNowSeconds - displayRealEpoch);
  let rendered = 0;
  let beamPosition = null;
  context.globalCompositeOperation = "lighter";
  while (scopeQueueHead < scopeQueue.length && rendered < MAX_RENDERED_POINTS_PER_FRAME) {
    const event = scopeQueue[scopeQueueHead];
    if (event.at_seconds > displayTime) {
      break;
    }
    beamPosition = drawScopePoint(event, realElapsed);
    scopeQueueHead += 1;
    rendered += 1;
  }
  context.globalCompositeOperation = "source-over";

  if (beamPosition) {
    beamHead.style.left = `${beamPosition.x / canvas.width * 100}%`;
    beamHead.style.top = `${beamPosition.y / canvas.height * 100}%`;
    beamHead.style.opacity = "1";
  }
  if (scopeQueueHead > 1024 && scopeQueueHead * 2 > scopeQueue.length) {
    scopeQueue.splice(0, scopeQueueHead);
    scopeQueueHead = 0;
  }
  document.documentElement.dataset.scopeQueue = String(pendingScopePointCount());
  document.documentElement.dataset.renderedSpots = String(rendered);
  return rendered;
}

function updateBeamRate(realNowSeconds, renderedSpots) {
  if (beamRateWindowStartedAt === 0) {
    beamRateWindowStartedAt = realNowSeconds;
  }
  beamRateWindowSpots += renderedSpots;
  const elapsed = realNowSeconds - beamRateWindowStartedAt;
  if (elapsed < 1) {
    return;
  }
  const rate = Math.round(beamRateWindowSpots / elapsed);
  beamReadout.textContent = `POINT BEAM · ${rate.toLocaleString()} SPOTS/S`;
  document.documentElement.dataset.beamSpotRate = String(rate);
  beamRateWindowStartedAt = realNowSeconds;
  beamRateWindowSpots = 0;
}

function updateReadouts() {
  stateNode.textContent = running ? "RUNNING" : "STOPPED";
  const simulatedTime = machine?.simulated_time ?? 0;
  timeNode.textContent = `${simulatedTime.toFixed(6)} s`;
  countNode.textContent = pointCount.toLocaleString();
  runButton.textContent = running ? "PAUSE" : "RUN";
}

function applyKnobRegister() {
  const values = knobInputs.map((input) => Number(input.value));
  for (const input of knobInputs) {
    input.nextElementSibling.value = Number(input.value).toString(8).padStart(3, "0");
  }
  machine?.set_knob_register(...values, knobMeta.checked);
}

function applyExternalInputRegister() {
  const quarters = [0, 0, 0, 0];
  for (const button of heldExternalButtons) {
    if (button === externalMeta) {
      continue;
    }
    const quarter = Number(button.dataset.switchQuarter);
    const bit = Number(button.dataset.switchBit);
    quarters[4 - quarter] |= 1 << (bit - 1);
  }
  machine?.set_external_input_register(
    ...quarters,
    heldExternalButtons.has(externalMeta),
  );
}

function holdExternalButton(button, held) {
  if (held) {
    heldExternalButtons.add(button);
  } else {
    heldExternalButtons.delete(button);
  }
  button.classList.toggle("held", held);
  button.setAttribute("aria-pressed", String(held));
  applyExternalInputRegister();
}

function stopWithError(error) {
  running = false;
  cancelAnimationFrame(frameRequest);
  freezeScopeTimeline();
  const message = typeof error === "string" ? error : String(error);
  setMessage(`The TX-2 stopped: ${message}`, true);
  updateReadouts();
}

function frame(now = performance.now()) {
  if (!running) {
    return;
  }
  if (now - lastFrameAt < MIN_FRAME_INTERVAL_MS) {
    frameRequest = requestAnimationFrame(frame);
    return;
  }
  lastFrameAt = now;
  if (document.visibilityState === "hidden") {
    freezeScopeTimeline(now / 1000);
    frameRequest = requestAnimationFrame(frame);
    return;
  }
  resumeScopeTimeline(now / 1000);
  const frameStart = performance.now();
  const realNowSeconds = frameStart / 1000;
  const phosphorElapsed = lastPhosphorAt === 0
    ? 1 / 60
    : (now - lastPhosphorAt) / 1000;
  lastPhosphorAt = now;
  resizeCanvas();
  fadePhosphor(phosphorElapsed);
  const realElapsed = (frameStart - startedAt) / 1000;
  let scopeEventCount = 0;
  let executedTicks = 0;

  try {
    while (
      executedTicks < MAX_TICKS_PER_FRAME
      && performance.now() - frameStart < MACHINE_BUDGET_MS
      && pendingScopePointCount() < MAX_PENDING_SCOPE_POINTS
      && (
        displaySourceEpoch === null
        || machine.simulated_time < displaySourceEpoch
          + (realNowSeconds - displayRealEpoch)
          + DISPLAY_LEAD_SECONDS
      )
    ) {
      const tickCount = Math.min(TICKS_PER_SLICE, MAX_TICKS_PER_FRAME - executedTicks);
      const events = machine.step_batch(realElapsed, tickCount);
      executedTicks += tickCount;
      for (const event of events) {
        if (event?.kind === "scope_point") {
          queueScopePoint(event, realNowSeconds);
          scopeEventCount += 1;
        }
      }
    }
    const renderedSpots = renderDueScopePoints(realNowSeconds, realElapsed);
    updateBeamRate(realNowSeconds, renderedSpots);
  } catch (error) {
    stopWithError(error);
    return;
  }

  document.documentElement.dataset.machineTicks = String(executedTicks);
  document.documentElement.dataset.scopeEvents = String(scopeEventCount);

  updateReadouts();
  const frameDuration = performance.now() - frameStart;
  document.documentElement.dataset.frameWorkMs = frameDuration.toFixed(2);
  overloadedFrames = frameDuration > MAX_SAFE_FRAME_MS
    ? overloadedFrames + 1
    : Math.max(0, overloadedFrames - 1);
  if (overloadedFrames >= MAX_OVERLOADED_FRAMES) {
    running = false;
    freezeScopeTimeline();
    setMessage("The TX-2 paused because the browser frame budget was exceeded.", true);
    updateReadouts();
    return;
  }
  frameRequest = requestAnimationFrame(frame);
}

function start() {
  if (running) {
    return;
  }
  running = true;
  resumeScopeTimeline();
  lastFrameAt = 0;
  lastPhosphorAt = 0;
  overloadedFrames = 0;
  startedAt = performance.now() - machine.simulated_time * 1000;
  setMessage("The TX-2 is executing the mounted paper tape.");
  updateReadouts();
  frameRequest = requestAnimationFrame(frame);
}

function pause() {
  running = false;
  cancelAnimationFrame(frameRequest);
  freezeScopeTimeline();
  setMessage("The TX-2 clock is paused.");
  updateReadouts();
}

function loadMachine(tape) {
  pause();
  machine = new SketchpadMachine();
  activeTape = tape;
  lightPen.active = false;
  lightPen.pointerId = null;
  pointCount = 0;
  lastFrameAt = 0;
  overloadedFrames = 0;
  resetScopeTimeline();
  startedAt = performance.now();
  resizeCanvas();
  context.fillStyle = "#010503";
  context.fillRect(0, 0, canvas.width, canvas.height);
  machine.mount_tape(activeTape, 0);
  applyKnobRegister();
  applyExternalInputRegister();
  machine.codabo(0);
  setMessage("The reconstructed Sketchpad tape is mounted. The TX-2 is ready.");
  updateReadouts();
}

function toggleRunning() {
  if (running) {
    pause();
  } else {
    start();
  }
}

runButton.addEventListener("click", toggleRunning);

function resetMachine() {
  loadMachine(activeTape ?? sketchpad_tape());
  start();
}

resetButton.addEventListener("click", resetMachine);

tapeInput.addEventListener("change", async () => {
  const [file] = tapeInput.files;
  if (!file) {
    return;
  }
  try {
    loadMachine(new Uint8Array(await file.arrayBuffer()));
    setMessage(`${file.name} is mounted on the paper-tape reader.`);
    start();
  } catch (error) {
    stopWithError(error);
  }
});

function updateLightPen(event) {
  const box = lightPenSurface.getBoundingClientRect();
  lightPen.x = (event.clientX - box.left) * canvas.width / box.width;
  lightPen.y = (event.clientY - box.top) * canvas.height / box.height;
}

lightPenSurface.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }
  event.preventDefault();
  updateLightPen(event);
  lightPen.active = true;
  lightPen.pointerId = event.pointerId;
  lightPenSurface.setPointerCapture(event.pointerId);
});

lightPenSurface.addEventListener("pointermove", (event) => {
  event.preventDefault();
  if (lightPen.active && event.pointerId === lightPen.pointerId) {
    updateLightPen(event);
  }
});

for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
  lightPenSurface.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (lightPen.pointerId !== null && event.pointerId !== lightPen.pointerId) {
      return;
    }
    lightPen.active = false;
    lightPen.pointerId = null;
  });
}

for (const eventName of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
  lightPenSurface.addEventListener(eventName, (event) => event.preventDefault(), { passive: false });
}

for (const eventName of ["selectstart", "contextmenu", "dragstart"]) {
  document.addEventListener(eventName, (event) => event.preventDefault());
}

for (const input of [...knobInputs, knobMeta]) {
  input.addEventListener("input", applyKnobRegister);
}

for (const button of externalButtons) {
  button.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    holdExternalButton(button, true);
  });
  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(eventName, () => holdExternalButton(button, false));
  }
  button.addEventListener("keydown", (event) => {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) {
      event.preventDefault();
      holdExternalButton(button, true);
    }
  });
  button.addEventListener("keyup", (event) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      holdExternalButton(button, false);
    }
  });
  button.addEventListener("blur", () => holdExternalButton(button, false));
}

window.addEventListener("resize", resizeCanvas);

try {
  await init();
  loadMachine(sketchpad_tape());
  runButton.disabled = false;
  resetButton.disabled = false;
  start();
} catch (error) {
  stopWithError(error);
}
