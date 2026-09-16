import {
  displayTime,
  lightPenStatus,
  scopePointPosition,
} from "./scope-model.js?v=20260915-12";
import {
  PEN_STATE_LENGTH,
  readSharedPenApplication,
  writeSharedPen,
} from "./pen-transport.js?v=20260915-12";
import { HeldControls, drawKeyTransitions } from "./external-input.js?v=20260915-12";
import {
  captureFileName,
  isCaptureShortcut,
  VisualCapture,
} from "./visual-capture.js?v=20260915-17";

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
const penStateNode = document.querySelector("#pen-state");
const selectionNode = document.querySelector("#selection-state");
const inputLatencyNode = document.querySelector("#input-latency");
const workerLatencyNode = document.querySelector("#worker-latency");
const messageNode = document.querySelector("#message");
const penSensitivityInput = document.querySelector("#pen-sensitivity");
const penSensitivityOutput = document.querySelector("#pen-sensitivity-output");
const knobInputs = Array.from(document.querySelectorAll("[data-knob]"));
const knobMeta = document.querySelector("#knob-meta");
const externalButtonRows = document.querySelector("#external-buttons");
const externalMeta = document.querySelector("#external-meta");
const drawCycleToggle = document.querySelector("#draw-cycle-toggle");
const solveToggle = document.querySelector("#solve-toggle");
const showBlocksToggle = document.querySelector("#show-blocks-toggle");
const showConstraintsToggle = document.querySelector("#show-constraints-toggle");
const captureButton = document.querySelector("#capture-toggle");
const captureDownloadButton = document.querySelector("#capture-download");
const captureStatus = document.querySelector("#capture-status");

const commandButtons = new Map([
  ["1.1", { name: "MOVEPIC" }],
  ["1.2", { name: "CONSTOUT" }],
  ["1.3", { name: "ERASE" }],
  ["1.4", { name: "POINTSOUT" }],
  ["1.5", { name: "PICOUT" }],
  ["1.6", { name: "STOPMOVEP" }],
  ["1.7", { name: "DESIGNATE" }],
  ["1.8", { name: "STARTDRAW", shortcut: "D" }],
  ["1.9", { name: "CPY1" }],
  ["2.1", { name: "MOVEPOINT" }],
  ["2.2", { name: "DESIGIT" }],
  ["2.3", { name: "DUMMY" }],
  ["2.4", { name: "SUBPIC" }],
  ["2.5", { name: "CPY2" }],
  ["2.6", { name: "MAKPATA" }],
  ["2.7", { name: "UNFIX", shortcut: "U" }],
  ["2.8", { name: "MAKECONS" }],
  ["2.9", { name: "TRUEUP", shortcut: "T" }],
  ["3.1", { name: "CPY3" }],
  ["3.2", { name: "MAKETEXT" }],
  ["3.3", { name: "FIXIT", shortcut: "F" }],
  ["3.6", { name: "CPY4" }],
  ["3.7", { name: "MAKESCALER" }],
  ["3.9", { name: "RDTX2" }],
  ["4.1", { name: "MGPSTART" }],
  ["4.4", { name: "UNMAC" }],
  ["4.5", { name: "ORDSTARTW" }],
  ["4.6", { name: "ORDSTARTB" }],
]);

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
    button.dataset.externalButton = "";
    button.dataset.switchQuarter = String(quarter);
    button.dataset.switchBit = String(bit);
    const command = commandButtons.get(`${quarter}.${bit}`);
    button.textContent = command?.shortcut ? `${bit} ${command.shortcut}` : String(bit);
    if (command) {
      button.classList.add("command-button");
      button.dataset.command = command.name;
      button.title = command.shortcut
        ? `${command.name} · keyboard ${command.shortcut}`
        : command.name;
    }
    button.setAttribute(
      "aria-label",
      command
        ? `External input bit ${quarter}.${bit}, ${command.name}${command.shortcut ? `, keyboard ${command.shortcut}` : ""}`
        : `External input bit ${quarter}.${bit}`,
    );
    button.setAttribute("aria-pressed", "false");
    row.append(button);
  }
  externalButtonRows.append(row);
}

const externalButtons = Array.from(document.querySelectorAll("[data-external-button]"));
const heldExternalButtons = new HeldControls();
const heldShortcutCodes = new Set();
const keyboardButtons = new Map([
  ["KeyD", externalButtons.find((button) => button.dataset.command === "STARTDRAW")],
  ["KeyT", externalButtons.find((button) => button.dataset.command === "TRUEUP")],
  ["KeyF", externalButtons.find((button) => button.dataset.command === "FIXIT")],
  ["KeyU", externalButtons.find((button) => button.dataset.command === "UNFIX")],
]);

const machineWorker = new Worker(new URL("./machine-worker.js?v=20260915-12", import.meta.url), {
  type: "module",
});
const penBuffer = globalThis.crossOriginIsolated && typeof SharedArrayBuffer === "function"
  ? new SharedArrayBuffer(PEN_STATE_LENGTH * Int32Array.BYTES_PER_ELEMENT)
  : null;
const penView = penBuffer ? new Int32Array(penBuffer) : null;
let activeTape = null;
let machineReady = false;
let machineGeneration = 0;
let machineState = {
  simulatedTime: 0,
  detectionCount: 0n,
  lost: true,
  atBits: 0n,
};
let running = false;
let pointCount = 0;
let frameRequest;
const MAX_RENDERED_POINTS_PER_FRAME = 840;
const MAX_CANVAS_AXIS = 1024;
const MIN_FRAME_INTERVAL_MS = 15;
const MAX_SAFE_FRAME_MS = 20;
const MAX_OVERLOADED_FRAMES = 3;
const PHOSPHOR_HALF_LIFE_SECONDS = 0.12;
const SELECTION_BITS = [
  [0o2000000n, "POINT"],
  [0o4000000n, "LINE"],
  [0o10000000n, "CIRCLE"],
  [0o200000000n, "INSTANCE"],
];
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
const lightPen = { active: false, x: 0.5, y: 0.5, radius: 12 / 1022 };
const visualCapture = new VisualCapture(canvas, () => ({
  x: lightPen.x,
  y: lightPen.y,
  active: lightPen.active,
  penState: lightPenStatus(lightPen.active, machineState.lost),
  simulatedTime: machineState.simulatedTime,
}));
let lightPenBounds = null;
let penSequence = 0;
let lastPenDispatch = null;
let displayedPenApplicationSequence = 0;
let latestInputHandlerMs = null;
let latestEventQueueMs = null;
let captureClock = null;

function captureDuration() {
  if (visualCapture.startedAt === null) return 0;
  return Math.max(0, performance.now() - visualCapture.startedAt);
}

function formatCaptureDuration(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updateCaptureClock() {
  captureStatus.value = `RECORDING ${formatCaptureDuration(captureDuration())} · ${visualCapture.chunks.length} CHUNKS`;
}

async function toggleVisualCapture() {
  if (!visualCapture.recording) {
    try {
      visualCapture.start();
      captureButton.textContent = "STOP VISUAL LOG · R";
      captureDownloadButton.disabled = true;
      updateCaptureClock();
      captureClock = setInterval(updateCaptureClock, 250);
    } catch (error) {
      captureStatus.value = String(error);
    }
    return;
  }

  captureButton.disabled = true;
  const duration = captureDuration();
  const blob = await visualCapture.stop();
  clearInterval(captureClock);
  captureClock = null;
  captureButton.disabled = false;
  captureButton.textContent = "START NEW VISUAL LOG · R";
  captureDownloadButton.disabled = false;
  captureStatus.value = `READY · ${formatCaptureDuration(duration)} · ${(blob.size / 1_048_576).toFixed(1)} MB · ${captureFileName(visualCapture.startedOn)}`;
}

captureButton.addEventListener("click", toggleVisualCapture);
captureDownloadButton.addEventListener("click", () => {
  try {
    visualCapture.download();
  } catch (error) {
    captureStatus.value = String(error);
  }
});

if (!visualCapture.supported) {
  captureButton.disabled = true;
  captureDownloadButton.disabled = true;
  captureStatus.value = "VISUAL RECORDING IS NOT AVAILABLE IN THIS BROWSER";
}

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

function drawScopePoint(event) {
  const { x, y } = scopePointPosition(event, canvas.width, canvas.height);
  const strength = [0.28, 0.42, 0.62, 0.84][event.intensity] ?? 0.28;
  const radius = (0.85 + event.intensity * 0.28) * canvasPixelScale;
  context.fillStyle = `rgb(155 255 167 / ${strength})`;
  context.fillRect(x - radius, y - radius, radius * 2, radius * 2);

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

function renderDueScopePoints(realNowSeconds) {
  beamHead.style.opacity = "0";
  if (displaySourceEpoch === null) {
    document.documentElement.dataset.renderedSpots = "0";
    return 0;
  }

  const currentDisplayTime = displayTime(displaySourceEpoch, displayRealEpoch, realNowSeconds);
  let rendered = 0;
  let beamPosition = null;
  context.globalCompositeOperation = "lighter";
  while (scopeQueueHead < scopeQueue.length && rendered < MAX_RENDERED_POINTS_PER_FRAME) {
    const event = scopeQueue[scopeQueueHead];
    if (event.at_seconds > currentDisplayTime) {
      break;
    }
    beamPosition = drawScopePoint(event);
    scopeQueueHead += 1;
    rendered += 1;
  }
  context.globalCompositeOperation = "source-over";

  if (beamPosition) {
    beamHead.style.left = `${beamPosition.x / Math.max(1, canvas.width - 1) * 100}%`;
    beamHead.style.top = `${beamPosition.y / Math.max(1, canvas.height - 1) * 100}%`;
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
  const simulatedTime = machineState.simulatedTime;
  timeNode.textContent = `${simulatedTime.toFixed(6)} s`;
  countNode.textContent = pointCount.toLocaleString();
  runButton.textContent = running ? "PAUSE" : "RUN";

  if (!machineReady) {
    penStateNode.textContent = "UP";
    selectionNode.textContent = "NONE";
    return;
  }

  penStateNode.textContent = lightPenStatus(lightPen.active, machineState.lost);

  const atBits = machineState.atBits;
  const selections = SELECTION_BITS
    .filter(([mask]) => (BigInt(atBits) & mask) !== 0n)
    .map(([, label]) => label);
  selectionNode.textContent = selections.join(" + ") || "NONE";
}

function applyPenSensitivity() {
  const scopeUnits = Number(penSensitivityInput.value);
  penSensitivityOutput.value = `${scopeUnits} UNITS`;
  lightPen.radius = scopeUnits / 1022;
  publishLightPen();
}

function applyKnobRegister() {
  const values = knobInputs.map((input) => Number(input.value));
  for (const input of knobInputs) {
    input.nextElementSibling.value = Number(input.value).toString(8).padStart(3, "0");
  }
  machineWorker.postMessage({
    type: "knobs",
    state: { values, meta: knobMeta.checked },
  });
}

function applyExternalInputRegister() {
  const quarters = [0, 0, 0, 0];
  for (const button of heldExternalButtons.values()) {
    if (button === externalMeta) {
      continue;
    }
    const quarter = Number(button.dataset.switchQuarter);
    const bit = Number(button.dataset.switchBit);
    quarters[4 - quarter] |= 1 << (bit - 1);
  }
  machineWorker.postMessage({
    type: "external",
    state: { quarters, meta: heldExternalButtons.has(externalMeta) },
  });
}

function toggleRegisterState() {
  const register20Quarter4 = drawCycleToggle.checked ? 0o400 : 0;
  let register25Quarter4 = 0;
  if (showBlocksToggle.checked) register25Quarter4 |= 0o400;
  if (showConstraintsToggle.checked) register25Quarter4 |= 0o200;
  return {
    register20: {
      quarters: [register20Quarter4, 0, 0, 0],
      meta: solveToggle.checked,
    },
    register25: {
      quarters: [register25Quarter4, 0, 0, 0],
      meta: false,
    },
  };
}

function applyToggleRegisters() {
  machineWorker.postMessage({ type: "toggles", state: toggleRegisterState() });
}

function holdExternalButton(button, owner, held) {
  heldExternalButtons.set(button, owner, held);
  const effectiveHeld = heldExternalButtons.has(button);
  button.classList.toggle("held", effectiveHeld);
  button.setAttribute("aria-pressed", String(effectiveHeld));
  applyExternalInputRegister();
}

function releaseAllExternalButtons() {
  heldExternalButtons.clear();
  heldShortcutCodes.clear();
  for (const button of externalButtons) {
    button.classList.remove("held");
    button.setAttribute("aria-pressed", "false");
  }
  externalMeta.classList.remove("held");
  externalMeta.setAttribute("aria-pressed", "false");
  applyExternalInputRegister();
}

function applyDrawKey(held) {
  for (const transition of drawKeyTransitions(held)) {
    const button = externalButtons.find(
      (candidate) => candidate.dataset.command === transition.command,
    );
    holdExternalButton(button, "shortcut:KeyD", transition.held);
  }
}

function stopWithError(error) {
  running = false;
  cancelAnimationFrame(frameRequest);
  freezeScopeTimeline();
  machineWorker.postMessage({ type: "pause" });
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
  if (latestInputHandlerMs !== null) {
    inputLatencyNode.textContent = `${latestInputHandlerMs.toFixed(3)} ms`;
    document.documentElement.dataset.penInputHandlerMs = latestInputHandlerMs.toFixed(3);
    latestInputHandlerMs = null;
  }
  if (latestEventQueueMs !== null) {
    document.documentElement.dataset.penEventQueueMs = latestEventQueueMs.toFixed(3);
    latestEventQueueMs = null;
  }
  if (penView) {
    const application = readSharedPenApplication(penView);
    if (application.sequence > displayedPenApplicationSequence) {
      displayedPenApplicationSequence = application.sequence;
      workerLatencyNode.textContent = `${application.latencyMilliseconds.toFixed(3)} ms`;
      document.documentElement.dataset.penWorkerApplyMs =
        application.latencyMilliseconds.toFixed(3);
    }
  }
  const frameStart = performance.now();
  const realNowSeconds = frameStart / 1000;
  const phosphorElapsed = lastPhosphorAt === 0
    ? 1 / 60
    : (now - lastPhosphorAt) / 1000;
  lastPhosphorAt = now;
  resizeCanvas();
  fadePhosphor(phosphorElapsed);
  try {
    const renderedSpots = renderDueScopePoints(realNowSeconds);
    updateBeamRate(realNowSeconds, renderedSpots);
    machineWorker.postMessage({
      type: "display-backlog",
      points: pendingScopePointCount(),
    });
  } catch (error) {
    stopWithError(error);
    return;
  }

  updateReadouts();
  const frameDuration = performance.now() - frameStart;
  document.documentElement.dataset.frameWorkMs = frameDuration.toFixed(2);
  overloadedFrames = frameDuration > MAX_SAFE_FRAME_MS
    ? overloadedFrames + 1
    : Math.max(0, overloadedFrames - 1);
  if (overloadedFrames >= MAX_OVERLOADED_FRAMES) {
    running = false;
    freezeScopeTimeline();
    machineWorker.postMessage({ type: "pause" });
    setMessage("The TX-2 paused because the browser frame budget was exceeded.", true);
    updateReadouts();
    return;
  }
  frameRequest = requestAnimationFrame(frame);
}

function start() {
  if (running || !machineReady) {
    return;
  }
  running = true;
  resumeScopeTimeline();
  lastFrameAt = 0;
  lastPhosphorAt = 0;
  overloadedFrames = 0;
  setMessage("The TX-2 is executing the mounted paper tape.");
  updateReadouts();
  machineWorker.postMessage({ type: "run" });
  frameRequest = requestAnimationFrame(frame);
}

function pause() {
  running = false;
  cancelAnimationFrame(frameRequest);
  freezeScopeTimeline();
  machineWorker.postMessage({ type: "pause" });
  setMessage("The TX-2 clock is paused.");
  updateReadouts();
}

function loadMachine(tape) {
  pause();
  machineGeneration += 1;
  machineReady = false;
  activeTape = tape ? new Uint8Array(tape) : null;
  lightPen.active = false;
  publishLightPen();
  pointCount = 0;
  lastFrameAt = 0;
  overloadedFrames = 0;
  resetScopeTimeline();
  machineState = {
    simulatedTime: 0,
    detectionCount: 0n,
    lost: true,
    atBits: 0n,
  };
  resizeCanvas();
  context.fillStyle = "#010503";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const tapeCopy = activeTape ? activeTape.slice() : null;
  const message = {
    type: "initialize",
    generation: machineGeneration,
    tape: tapeCopy?.buffer ?? null,
    penBuffer,
    pen: { ...lightPen, sequence: penSequence },
    config: {
      knobs: {
        values: knobInputs.map((input) => Number(input.value)),
        meta: knobMeta.checked,
      },
      external: { quarters: [0, 0, 0, 0], meta: false },
      toggles: toggleRegisterState(),
    },
  };
  machineWorker.postMessage(message, tapeCopy ? [tapeCopy.buffer] : []);
  setMessage("The TX-2 worker is loading the mounted paper tape.");
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
  loadMachine(activeTape);
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
  } catch (error) {
    stopWithError(error);
  }
});

function cacheLightPenBounds() {
  lightPenBounds = lightPenSurface.getBoundingClientRect();
}

function publishLightPen() {
  penSequence += 1;
  const dispatchedAt = performance.now();
  if (penView) {
    writeSharedPen(
      penView,
      lightPen,
      penSequence,
      performance.timeOrigin + dispatchedAt,
    );
    machineWorker.postMessage({ type: "pen-update" });
  } else {
    const pen = { ...lightPen, sequence: penSequence };
    machineWorker.postMessage({ type: "pen", pen });
    lastPenDispatch = { sequence: penSequence, dispatchedAt };
  }
}

function updateLightPen(event) {
  const handlerStartedAt = performance.now();
  const box = lightPenBounds ?? lightPenSurface.getBoundingClientRect();
  lightPen.x = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width));
  lightPen.y = Math.max(0, Math.min(1, (event.clientY - box.top) / box.height));
  publishLightPen();
  latestInputHandlerMs = performance.now() - handlerStartedAt;
  const queueDelay = handlerStartedAt - event.timeStamp;
  if (queueDelay >= 0 && queueDelay < 60_000) {
    latestEventQueueMs = queueDelay;
  }
}

lightPenSurface.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }
  event.preventDefault();
  lightPen.active = true;
  updateLightPen(event);
});

if ("onpointerrawupdate" in window) {
  lightPenSurface.addEventListener("pointerrawupdate", (event) => {
    if (event.cancelable) event.preventDefault();
    updateLightPen(event);
  });
} else {
  lightPenSurface.addEventListener("pointermove", (event) => {
    if (event.cancelable) event.preventDefault();
    updateLightPen(event);
  });
}

lightPenSurface.addEventListener("pointerenter", cacheLightPenBounds);

for (const eventName of ["selectstart", "contextmenu", "dragstart"]) {
  lightPenSurface.addEventListener(eventName, (event) => event.preventDefault());
}

for (const input of [...knobInputs, knobMeta]) {
  input.addEventListener("input", applyKnobRegister);
}

penSensitivityInput.addEventListener("input", applyPenSensitivity);

for (const input of [
  drawCycleToggle,
  solveToggle,
  showBlocksToggle,
  showConstraintsToggle,
]) {
  input.addEventListener("input", applyToggleRegisters);
}

for (const button of externalButtons) {
  button.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    holdExternalButton(button, `pointer:${event.pointerId}`, true);
  });
  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(eventName, (event) => {
      holdExternalButton(button, `pointer:${event.pointerId}`, false);
    });
  }
  button.addEventListener("keydown", (event) => {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) {
      event.preventDefault();
      holdExternalButton(button, `control-key:${event.key}`, true);
    }
  });
  button.addEventListener("keyup", (event) => {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      holdExternalButton(button, `control-key:${event.key}`, false);
    }
  });
  button.addEventListener("blur", () => {
    holdExternalButton(button, "control-key: ", false);
    holdExternalButton(button, "control-key:Enter", false);
  });
}

document.addEventListener("keydown", (event) => {
  if (isCaptureShortcut(event)) {
    event.preventDefault();
    if (!captureButton.disabled) void toggleVisualCapture();
    return;
  }
  if (event.code === "Escape" && lightPen.active) {
    event.preventDefault();
    lightPen.active = false;
    publishLightPen();
    setMessage("The light-pen sensor is disengaged. Click the scope to engage it again.");
    updateReadouts();
    return;
  }
  const button = keyboardButtons.get(event.code);
  if (!button || event.repeat || heldShortcutCodes.has(event.code)) {
    return;
  }
  event.preventDefault();
  heldShortcutCodes.add(event.code);
  if (event.code === "KeyD") {
    applyDrawKey(true);
  } else {
    holdExternalButton(button, `shortcut:${event.code}`, true);
  }
});

document.addEventListener("keyup", (event) => {
  const button = keyboardButtons.get(event.code);
  if (!button || !heldShortcutCodes.has(event.code)) {
    return;
  }
  event.preventDefault();
  heldShortcutCodes.delete(event.code);
  if (event.code === "KeyD") {
    applyDrawKey(false);
  } else {
    holdExternalButton(button, `shortcut:${event.code}`, false);
  }
});

window.addEventListener("blur", () => {
  releaseAllExternalButtons();
  lightPen.active = false;
  publishLightPen();
});

function handleWorkerMessage({ data }) {
  if (data.generation !== undefined && data.generation !== machineGeneration) return;
  switch (data.type) {
    case "ready":
      machineReady = true;
      runButton.disabled = false;
      resetButton.disabled = false;
      setMessage("Sketchpad is ready. Move over the scope. Click once to engage the light pen. Press Escape to disengage it.");
      start();
      break;
    case "scope": {
      const receivedAt = performance.now() / 1000;
      for (const event of data.events) queueScopePoint(event, receivedAt);
      document.documentElement.dataset.scopeEvents = String(data.events.length);
      break;
    }
    case "status":
      machineState = {
        simulatedTime: data.simulatedTime,
        detectionCount: data.detectionCount,
        lost: data.lost,
        atBits: data.atBits,
      };
      updateReadouts();
      break;
    case "pen-applied":
      if (lastPenDispatch && data.sequence === lastPenDispatch.sequence) {
        const latency = performance.now() - lastPenDispatch.dispatchedAt;
        workerLatencyNode.textContent = `${latency.toFixed(3)} ms`;
        document.documentElement.dataset.penWorkerRoundTripMs = latency.toFixed(3);
      }
      break;
    case "error":
      stopWithError(data.message);
      break;
    default:
      stopWithError(`Unknown machine-worker message: ${data.type}`);
  }
}

machineWorker.addEventListener("message", handleWorkerMessage);
machineWorker.addEventListener("error", (event) => stopWithError(event.message));

function resizeInterface() {
  resizeCanvas();
  cacheLightPenBounds();
}

window.addEventListener("resize", resizeInterface);
new ResizeObserver(cacheLightPenBounds).observe(lightPenSurface);

applyPenSensitivity();
loadMachine(null);
