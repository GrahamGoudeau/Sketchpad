import init, { SketchpadMachine, sketchpad_tape } from "./pkg/sketchpad_web.js";

const canvas = document.querySelector("#scope");
const context = canvas.getContext("2d", { alpha: false });
const inkCanvas = document.querySelector("#bridge-ink");
const inkContext = inkCanvas.getContext("2d");
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
const mobileRunButton = document.querySelector("#mobile-run");
const mobileUndoButton = document.querySelector("#mobile-undo");
const mobileStateNode = document.querySelector("#mobile-state");
const mobileMessageNode = document.querySelector("#mobile-message");
const mobileControlsButton = document.querySelector("#mobile-controls");
const closeControlsButton = document.querySelector("#close-controls");
const advancedPanel = document.querySelector("#advanced-panel");
const mobileToolButtons = Array.from(document.querySelectorAll("[data-mobile-tool]"));

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
let selectedMobileTool = mobileToolButtons[0];
let mobileBridgeActive = false;
const bridgeShapes = [];
let activeBridgeShape = null;

let machine;
let activeTape;
let running = false;
let pointCount = 0;
let startedAt = performance.now();
let frameRequest;
const MACHINE_BUDGET_MS = 2.5;
const TICKS_PER_SLICE = 32;
const MAX_TICKS_PER_FRAME = 2048;
const MAX_RENDERED_POINTS_PER_FRAME = 768;
const lightPen = { active: false, pointerId: null, x: 0, y: 0 };

function setMessage(message, error = false) {
  messageNode.textContent = message;
  messageNode.classList.toggle("error", error);
  if (error) {
    mobileMessageNode.textContent = message;
    mobileMessageNode.classList.add("error");
  }
}

function resizeCanvas() {
  const box = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(box.width * scale));
  const height = Math.max(1, Math.round(box.height * scale));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    context.fillStyle = "#010503";
    context.fillRect(0, 0, width, height);
  }
  if (inkCanvas.width !== width || inkCanvas.height !== height) {
    inkCanvas.width = width;
    inkCanvas.height = height;
    renderBridgeInk();
  }
}

function bridgePoint(event) {
  const box = inkCanvas.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - box.left) / box.width)),
    y: Math.max(0, Math.min(1, (event.clientY - box.top) / box.height)),
  };
}

function drawBridgeShape(shape) {
  const point = ({ x, y }) => ({ x: x * inkCanvas.width, y: y * inkCanvas.height });
  const start = point(shape.start);
  const end = point(shape.end ?? shape.start);

  inkContext.beginPath();
  if (shape.type === "pen") {
    const [first, ...rest] = shape.points;
    const firstPoint = point(first);
    if (rest.length === 0) {
      inkContext.arc(firstPoint.x, firstPoint.y, inkContext.lineWidth / 2, 0, Math.PI * 2);
      inkContext.fill();
      return;
    }
    inkContext.moveTo(firstPoint.x, firstPoint.y);
    for (const current of rest) {
      const next = point(current);
      inkContext.lineTo(next.x, next.y);
    }
  } else if (shape.type === "line") {
    inkContext.moveTo(start.x, start.y);
    inkContext.lineTo(end.x, end.y);
  } else if (shape.type === "circle") {
    const radius = Math.hypot(end.x - start.x, end.y - start.y);
    inkContext.arc(start.x, start.y, radius, 0, Math.PI * 2);
  } else if (shape.type === "rectangle") {
    inkContext.rect(start.x, start.y, end.x - start.x, end.y - start.y);
  }
  inkContext.stroke();
}

function renderBridgeInk() {
  inkContext.clearRect(0, 0, inkCanvas.width, inkCanvas.height);
  inkContext.save();
  inkContext.strokeStyle = "#baffca";
  inkContext.fillStyle = "#baffca";
  inkContext.lineWidth = 2.4 * (window.devicePixelRatio || 1);
  inkContext.lineCap = "round";
  inkContext.lineJoin = "round";
  inkContext.shadowColor = "#62ff99";
  inkContext.shadowBlur = 5 * (window.devicePixelRatio || 1);
  for (const shape of bridgeShapes) {
    drawBridgeShape(shape);
  }
  inkContext.restore();
  document.documentElement.dataset.shapeCount = String(bridgeShapes.length);
  mobileUndoButton.disabled = bridgeShapes.length === 0;
}

function pointSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return Math.hypot(point.x - start.x, point.y - start.y);
  }
  const amount = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(point.x - (start.x + amount * dx), point.y - (start.y + amount * dy));
}

function bridgeShapeDistance(shape, point) {
  if (shape.type === "pen") {
    let distance = Math.hypot(point.x - shape.points[0].x, point.y - shape.points[0].y);
    for (let index = 1; index < shape.points.length; index += 1) {
      distance = Math.min(
        distance,
        pointSegmentDistance(point, shape.points[index - 1], shape.points[index]),
      );
    }
    return distance;
  }
  if (shape.type === "line") {
    return pointSegmentDistance(point, shape.start, shape.end);
  }
  if (shape.type === "circle") {
    const radius = Math.hypot(shape.end.x - shape.start.x, shape.end.y - shape.start.y);
    return Math.abs(Math.hypot(point.x - shape.start.x, point.y - shape.start.y) - radius);
  }
  const left = Math.min(shape.start.x, shape.end.x);
  const right = Math.max(shape.start.x, shape.end.x);
  const top = Math.min(shape.start.y, shape.end.y);
  const bottom = Math.max(shape.start.y, shape.end.y);
  if (point.x >= left && point.x <= right && point.y >= top && point.y <= bottom) {
    return 0;
  }
  return Math.hypot(
    Math.max(left - point.x, 0, point.x - right),
    Math.max(top - point.y, 0, point.y - bottom),
  );
}

function eraseBridgeShape(point) {
  let bestIndex = -1;
  let bestDistance = 0.055;
  for (let index = bridgeShapes.length - 1; index >= 0; index -= 1) {
    const distance = bridgeShapeDistance(bridgeShapes[index], point);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  if (bestIndex >= 0) {
    bridgeShapes.splice(bestIndex, 1);
    renderBridgeInk();
  }
}

function axisPosition(value, movedOrigin, extent) {
  const normalized = movedOrigin ? value / 511 : (value + 511) / 1022;
  return Math.max(0, Math.min(extent, normalized * extent));
}

function processScopePoint(event, realElapsed, draw) {
  const leftOrigin = event.origin === "left_center" || event.origin === "lower_left";
  const bottomOrigin = event.origin === "bottom_center" || event.origin === "lower_left";
  const x = axisPosition(event.x, leftOrigin, canvas.width);
  const y = canvas.height - axisPosition(event.y, bottomOrigin, canvas.height);
  if (draw) {
    const strength = [0.42, 0.58, 0.76, 0.96][event.intensity] ?? 0.42;
    const radius = (0.8 + event.intensity * 0.32) * (window.devicePixelRatio || 1);
    context.fillStyle = `rgb(105 255 151 / ${strength})`;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  pointCount += 1;

  const detectionRadius = 18 * (window.devicePixelRatio || 1);
  const dx = x - lightPen.x;
  const dy = y - lightPen.y;
  if (lightPen.active && dx * dx + dy * dy <= detectionRadius * detectionRadius) {
    machine.light_pen_detected(realElapsed);
  }
}

function fadePhosphor() {
  context.save();
  context.fillStyle = "rgb(1 5 3 / 0.026)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

function updateReadouts() {
  stateNode.textContent = running ? "RUNNING" : "STOPPED";
  const simulatedTime = machine?.simulated_time ?? 0;
  timeNode.textContent = `${simulatedTime.toFixed(6)} s`;
  countNode.textContent = pointCount.toLocaleString();
  runButton.textContent = running ? "PAUSE" : "RUN";
  mobileRunButton.textContent = running ? "PAUSE" : "RUN";
  mobileStateNode.textContent = running ? "RUNNING" : "STOPPED";
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
  if (mobileBridgeActive && selectedMobileTool?.dataset.switchQuarter) {
    const quarter = Number(selectedMobileTool.dataset.switchQuarter);
    const bit = Number(selectedMobileTool.dataset.switchBit);
    quarters[4 - quarter] |= 1 << (bit - 1);
  }
  machine?.set_external_input_register(
    ...quarters,
    heldExternalButtons.has(externalMeta),
  );
  document.documentElement.dataset.bridgeActive = String(mobileBridgeActive);
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
  const message = typeof error === "string" ? error : String(error);
  setMessage(`The TX-2 stopped: ${message}`, true);
  updateReadouts();
}

function frame() {
  if (!running) {
    return;
  }
  if (document.visibilityState === "hidden") {
    frameRequest = requestAnimationFrame(frame);
    return;
  }
  resizeCanvas();
  fadePhosphor();
  const frameStart = performance.now();
  const realElapsed = (frameStart - startedAt) / 1000;
  const scopeEvents = [];
  let executedTicks = 0;

  try {
    do {
      const tickCount = Math.min(TICKS_PER_SLICE, MAX_TICKS_PER_FRAME - executedTicks);
      const events = machine.step_batch(realElapsed, tickCount);
      executedTicks += tickCount;
      for (const event of events) {
        if (event?.kind === "scope_point") {
          scopeEvents.push(event);
        }
      }
    } while (
      executedTicks < MAX_TICKS_PER_FRAME
      && performance.now() - frameStart < MACHINE_BUDGET_MS
    );
  } catch (error) {
    stopWithError(error);
    return;
  }

  const renderStride = Math.max(
    1,
    Math.ceil(scopeEvents.length / MAX_RENDERED_POINTS_PER_FRAME),
  );
  context.globalCompositeOperation = "lighter";
  for (let index = 0; index < scopeEvents.length; index += 1) {
    processScopePoint(scopeEvents[index], realElapsed, index % renderStride === 0);
  }
  context.globalCompositeOperation = "source-over";
  document.documentElement.dataset.machineTicks = String(executedTicks);
  document.documentElement.dataset.scopeEvents = String(scopeEvents.length);

  updateReadouts();
  frameRequest = requestAnimationFrame(frame);
}

function start() {
  if (running) {
    return;
  }
  running = true;
  startedAt = performance.now() - machine.simulated_time * 1000;
  setMessage("The TX-2 is executing the mounted paper tape.");
  updateReadouts();
  frameRequest = requestAnimationFrame(frame);
}

function pause() {
  running = false;
  cancelAnimationFrame(frameRequest);
  setMessage("The TX-2 clock is paused.");
  updateReadouts();
}

function loadMachine(tape) {
  pause();
  machine = new SketchpadMachine();
  activeTape = tape;
  lightPen.active = false;
  lightPen.pointerId = null;
  mobileBridgeActive = false;
  activeBridgeShape = null;
  bridgeShapes.length = 0;
  pointCount = 0;
  startedAt = performance.now();
  resizeCanvas();
  context.fillStyle = "#010503";
  context.fillRect(0, 0, canvas.width, canvas.height);
  renderBridgeInk();
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
mobileRunButton.addEventListener("click", toggleRunning);

function resetMachine() {
  loadMachine(activeTape ?? sketchpad_tape());
  start();
}

resetButton.addEventListener("click", resetMachine);
mobileUndoButton.addEventListener("click", () => {
  bridgeShapes.pop();
  renderBridgeInk();
});

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
  const box = inkCanvas.getBoundingClientRect();
  lightPen.x = (event.clientX - box.left) * canvas.width / box.width;
  lightPen.y = (event.clientY - box.top) * canvas.height / box.height;
}

inkCanvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }
  event.preventDefault();
  const point = bridgePoint(event);
  const tool = selectedMobileTool.dataset.tool;
  if (tool === "erase") {
    eraseBridgeShape(point);
    activeBridgeShape = null;
  } else {
    activeBridgeShape = tool === "pen"
      ? { type: "pen", start: point, end: point, points: [point] }
      : { type: tool, start: point, end: point };
    bridgeShapes.push(activeBridgeShape);
    renderBridgeInk();
  }
  updateLightPen(event);
  lightPen.active = true;
  lightPen.pointerId = event.pointerId;
  mobileBridgeActive = true;
  applyExternalInputRegister();
  inkCanvas.setPointerCapture(event.pointerId);
});

inkCanvas.addEventListener("pointermove", (event) => {
  event.preventDefault();
  if (lightPen.active && event.pointerId === lightPen.pointerId) {
    updateLightPen(event);
    if (activeBridgeShape) {
      const point = bridgePoint(event);
      activeBridgeShape.end = point;
      if (activeBridgeShape.type === "pen") {
        const previous = activeBridgeShape.points[activeBridgeShape.points.length - 1];
        if (Math.hypot(point.x - previous.x, point.y - previous.y) > 0.002) {
          activeBridgeShape.points.push(point);
        }
      }
      renderBridgeInk();
    } else if (selectedMobileTool.dataset.tool === "erase") {
      eraseBridgeShape(bridgePoint(event));
    }
  }
});

for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
  inkCanvas.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (lightPen.pointerId !== null && event.pointerId !== lightPen.pointerId) {
      return;
    }
    lightPen.active = false;
    lightPen.pointerId = null;
    activeBridgeShape = null;
    mobileBridgeActive = false;
    applyExternalInputRegister();
    renderBridgeInk();
  });
}

for (const eventName of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
  inkCanvas.addEventListener(eventName, (event) => event.preventDefault(), { passive: false });
}

for (const eventName of ["selectstart", "contextmenu", "dragstart"]) {
  document.addEventListener(eventName, (event) => event.preventDefault());
}

for (const button of mobileToolButtons) {
  button.addEventListener("click", () => {
    selectedMobileTool = button;
    for (const candidate of mobileToolButtons) {
      const active = candidate === selectedMobileTool;
      candidate.classList.toggle("active", active);
      candidate.setAttribute("aria-pressed", String(active));
    }
    const toolName = button.querySelector("span:last-child").textContent;
    mobileMessageNode.textContent = `${toolName} is ready. Drag anywhere.`;
    mobileMessageNode.classList.remove("error");
  });
}

function setAdvancedPanel(open) {
  advancedPanel.classList.toggle("open", open);
  mobileControlsButton.setAttribute("aria-expanded", String(open));
  if (open) {
    closeControlsButton.focus();
  } else {
    mobileControlsButton.focus();
  }
}

mobileControlsButton.addEventListener("click", () => setAdvancedPanel(true));
closeControlsButton.addEventListener("click", () => setAdvancedPanel(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && advancedPanel.classList.contains("open")) {
    setAdvancedPanel(false);
  }
});

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
  mobileRunButton.disabled = false;
  start();
} catch (error) {
  stopWithError(error);
}
