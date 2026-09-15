import init, { SketchpadMachine, sketchpad_tape } from "./pkg/sketchpad_web.js";

const canvas = document.querySelector("#scope");
const context = canvas.getContext("2d", { alpha: false });
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
const mobileResetButton = document.querySelector("#mobile-reset");
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

let machine;
let activeTape;
let running = false;
let pointCount = 0;
let startedAt = performance.now();
let frameRequest;
let ticksPerFrame = 1000;
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
}

function axisPosition(value, movedOrigin, extent) {
  const normalized = movedOrigin ? value / 511 : (value + 511) / 1022;
  return Math.max(0, Math.min(extent, normalized * extent));
}

function drawScopePoint(event, realElapsed) {
  const leftOrigin = event.origin === "left_center" || event.origin === "lower_left";
  const bottomOrigin = event.origin === "bottom_center" || event.origin === "lower_left";
  const x = axisPosition(event.x, leftOrigin, canvas.width);
  const y = canvas.height - axisPosition(event.y, bottomOrigin, canvas.height);
  const strength = [0.42, 0.58, 0.76, 0.96][event.intensity] ?? 0.42;
  const radius = (1.2 + event.intensity * 0.45) * (window.devicePixelRatio || 1);

  context.save();
  context.globalCompositeOperation = "lighter";
  context.fillStyle = `rgb(105 255 151 / ${strength})`;
  context.shadowColor = "#62ff99";
  context.shadowBlur = radius * 4;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
  context.restore();
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
  resizeCanvas();
  fadePhosphor();
  const frameStart = performance.now();
  const realElapsed = (frameStart - startedAt) / 1000;

  try {
    const events = machine.step_batch(realElapsed, ticksPerFrame);
    for (const event of events) {
      if (event?.kind === "scope_point") {
        drawScopePoint(event, realElapsed);
      }
    }
    const workTime = Math.max(0.25, performance.now() - frameStart);
    const scale = Math.max(0.6, Math.min(1.5, 10 / workTime));
    ticksPerFrame = Math.round(Math.max(250, Math.min(8000, ticksPerFrame * scale)));
  } catch (error) {
    stopWithError(error);
    return;
  }

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
  pointCount = 0;
  ticksPerFrame = 1000;
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
mobileRunButton.addEventListener("click", toggleRunning);

function resetMachine() {
  loadMachine(activeTape ?? sketchpad_tape());
  start();
}

resetButton.addEventListener("click", resetMachine);
mobileResetButton.addEventListener("click", resetMachine);

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
  const box = canvas.getBoundingClientRect();
  lightPen.x = (event.clientX - box.left) * canvas.width / box.width;
  lightPen.y = (event.clientY - box.top) * canvas.height / box.height;
}

canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) {
    return;
  }
  event.preventDefault();
  updateLightPen(event);
  lightPen.active = true;
  lightPen.pointerId = event.pointerId;
  mobileBridgeActive = true;
  applyExternalInputRegister();
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  event.preventDefault();
  if (lightPen.active && event.pointerId === lightPen.pointerId) {
    updateLightPen(event);
  }
});

for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
  canvas.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (lightPen.pointerId !== null && event.pointerId !== lightPen.pointerId) {
      return;
    }
    lightPen.active = false;
    lightPen.pointerId = null;
    mobileBridgeActive = false;
    applyExternalInputRegister();
  });
}

for (const eventName of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
  canvas.addEventListener(eventName, (event) => event.preventDefault(), { passive: false });
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
    mobileMessageNode.textContent = `${toolName} is ready. Touch visible ink.`;
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
  mobileResetButton.disabled = false;
  start();
} catch (error) {
  stopWithError(error);
}
