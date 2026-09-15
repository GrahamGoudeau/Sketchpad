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

let machine;
let activeTape;
let running = false;
let pointCount = 0;
let startedAt = performance.now();
let frameRequest;
const lightPen = { active: false, x: 0, y: 0 };

function setMessage(message, error = false) {
  messageNode.textContent = message;
  messageNode.classList.toggle("error", error);
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
    const events = machine.step_batch(realElapsed, 2000);
    for (const event of events) {
      if (event?.kind === "scope_point") {
        drawScopePoint(event, realElapsed);
      }
    }
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
  pointCount = 0;
  startedAt = performance.now();
  resizeCanvas();
  context.fillStyle = "#010503";
  context.fillRect(0, 0, canvas.width, canvas.height);
  machine.mount_tape(activeTape, 0);
  machine.codabo(0);
  setMessage("The reconstructed Sketchpad tape is mounted. The TX-2 is ready.");
  updateReadouts();
}

runButton.addEventListener("click", () => {
  if (running) {
    pause();
  } else {
    start();
  }
});

resetButton.addEventListener("click", () => {
  loadMachine(activeTape ?? sketchpad_tape());
  start();
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
  const box = canvas.getBoundingClientRect();
  lightPen.x = (event.clientX - box.left) * canvas.width / box.width;
  lightPen.y = (event.clientY - box.top) * canvas.height / box.height;
}

canvas.addEventListener("pointerdown", (event) => {
  updateLightPen(event);
  lightPen.active = true;
  canvas.setPointerCapture(event.pointerId);
});

canvas.addEventListener("pointermove", (event) => {
  if (lightPen.active) {
    updateLightPen(event);
  }
});

for (const eventName of ["pointerup", "pointercancel"]) {
  canvas.addEventListener(eventName, () => {
    lightPen.active = false;
  });
}

window.addEventListener("resize", resizeCanvas);

try {
  await init();
  loadMachine(sketchpad_tape());
  runButton.disabled = false;
  resetButton.disabled = false;
} catch (error) {
  stopWithError(error);
}
