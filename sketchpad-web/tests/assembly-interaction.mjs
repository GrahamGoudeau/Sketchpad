import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import init, {
  SketchpadMachine,
  sketchpad_tape,
} from "../web/pkg/sketchpad_web.js";

const wasmUrl = new URL("../web/pkg/sketchpad_web_bg.wasm", import.meta.url);
await init({ module_or_path: await readFile(fileURLToPath(wasmUrl)) });

const machine = new SketchpadMachine();
// Physical console switches used by the original program during interactive work.
// DRAWASFIX returns to the display cycle after READIT. SHOWBLKS keeps selectable
// non-drawing display records visible to the light pen.
machine.set_toggle_register(0o20, 0o400, 0, 0, 0, false);
machine.set_toggle_register(0o25, 0o400, 0, 0, 0, false);
machine.mount_tape(sketchpad_tape(), 0);
machine.set_light_pen(575 / 1022, 1 - 575 / 1022, 26 / 1022, true);
machine.codabo(0);

let scopePoints = 0;
let reachedReadit = false;
let observedXMin = Infinity;
let observedXMax = -Infinity;
let observedYMin = Infinity;
let observedYMax = -Infinity;
let phase = "boot";
const phaseScope = new Map();
const verificationScope = [];
const pseudoTrace = [];

function capturePseudoTrace(state) {
  if (
    state.sequence === 0o76
    && state.instruction_address >= 0o001607
    && state.instruction_address <= 0o001622
    && pseudoTrace.length < 500
  ) {
    pseudoTrace.push({
      state,
      a: octal(machine.memory_word(0o377604, machine.simulated_time).value),
      b: octal(machine.memory_word(0o377605, machine.simulated_time).value),
      d: octal(machine.memory_word(0o377607, machine.simulated_time).value),
      trout: octal(machine.memory_word(0o001366, machine.simulated_time).value),
      psts: octal(machine.memory_word(0o003574, machine.simulated_time).value),
      penloc: [0o001711, 0o001712].map((address) =>
        octal(machine.memory_word(address, machine.simulated_time).value)),
    });
  }
}

function physicalCoordinate(value, movedOrigin) {
  return movedOrigin ? value * 2 : value + 511;
}

function phaseStats(name) {
  if (!phaseScope.has(name)) {
    phaseScope.set(name, {
      points: 0,
      x: [Infinity, -Infinity],
      y: [Infinity, -Infinity],
      origins: {},
      closestToInitialPen: { distanceSquared: Infinity, x: null, y: null },
    });
  }
  return phaseScope.get(name);
}

function stepBatch(ticks = 20_000) {
  const events = machine.step_batch(machine.simulated_time, ticks);
  for (const event of events) {
    if (event?.kind === "scope_point" && event.unit === 0o60) {
      scopePoints += 1;
      observedXMin = Math.min(observedXMin, event.x);
      observedXMax = Math.max(observedXMax, event.x);
      observedYMin = Math.min(observedYMin, event.y);
      observedYMax = Math.max(observedYMax, event.y);
      const stats = phaseStats(phase);
      const leftOrigin = event.origin === "left_center" || event.origin === "lower_left";
      const bottomOrigin = event.origin === "bottom_center" || event.origin === "lower_left";
      const physicalX = physicalCoordinate(event.x, leftOrigin);
      const physicalY = physicalCoordinate(event.y, bottomOrigin);
      if (phase === "verify-line" && verificationScope.length < 100_000) {
        verificationScope.push({
          x: physicalX,
          y: physicalY,
          origin: event.origin,
          intensity: event.intensity,
        });
      }
      stats.points += 1;
      stats.x[0] = Math.min(stats.x[0], physicalX);
      stats.x[1] = Math.max(stats.x[1], physicalX);
      stats.y[0] = Math.min(stats.y[0], physicalY);
      stats.y[1] = Math.max(stats.y[1], physicalY);
      stats.origins[event.origin] = (stats.origins[event.origin] ?? 0) + 1;
      const distanceSquared = (physicalX - 575) ** 2 + (physicalY - 575) ** 2;
      if (distanceSquared < stats.closestToInitialPen.distanceSquared) {
        stats.closestToInitialPen = { distanceSquared, x: physicalX, y: physicalY };
      }
    }
  }
  reachedReadit ||= machine.control_state().program_counter === 0o200066;
  return events;
}

function trackerWords() {
  const words = {};
  for (const address of [
    0o001224,
    0o200054,
    0o377724,
    0o003425,
    ...Array.from({ length: 0o44 }, (_, offset) => 0o003554 + offset),
  ]) {
    words[octal(address, 6)] = octal(machine.memory_word(address, machine.simulated_time).value);
  }
  return words;
}

function linePointCoordinates() {
  return {
    first: [
      octal(machine.memory_word(0o024655, machine.simulated_time).value),
      octal(machine.memory_word(0o024656, machine.simulated_time).value),
    ],
    second: [
      octal(machine.memory_word(0o024677, machine.simulated_time).value),
      octal(machine.memory_word(0o024700, machine.simulated_time).value),
    ],
  };
}

function raisedFlags() {
  const flags = [];
  for (let sequence = 0; sequence < 64; sequence += 1) {
    if (machine.sequence_flag(sequence)) {
      flags.push(octal(sequence, 2));
    }
  }
  return flags;
}

function sequenceRegisters() {
  const result = {};
  for (const sequence of [0o47, 0o54, 0o55, 0o60, 0o76]) {
    result[octal(sequence, 2)] = machine.index_register(sequence);
  }
  return result;
}

function snapshot(first = 0o024000, last = 0o026000) {
  const words = new Map();
  for (let address = first; address < last; address += 1) {
    words.set(address, machine.memory_word(address, machine.simulated_time).value);
  }
  return words;
}

function octal(value, width = 12) {
  return value.toString(8).padStart(width, "0");
}

function hasOctalBit(value, mask) {
  return (BigInt(value) & BigInt(mask)) !== 0n;
}

function rightHalf(value) {
  return value % 0o1000000;
}

function lineGeometry(linePointerWord) {
  const lineAddress = 0o024000 + rightHalf(linePointerWord);
  const pointAddress = (fieldOffset) => (
    0o024000 + rightHalf(machine.memory_word(lineAddress + fieldOffset, machine.simulated_time).value)
  );
  const firstAddress = pointAddress(0o10);
  const secondAddress = pointAddress(0o12);
  const readPoint = (address) => [
    machine.memory_word(address + 0o20, machine.simulated_time).value,
    machine.memory_word(address + 0o21, machine.simulated_time).value,
  ];
  return {
    lineAddress,
    firstAddress,
    secondAddress,
    first: readPoint(firstAddress),
    second: readPoint(secondAddress),
  };
}

function geometryForReport(geometry) {
  return {
    lineAddress: octal(geometry.lineAddress, 6),
    firstAddress: octal(geometry.firstAddress, 6),
    secondAddress: octal(geometry.secondAddress, 6),
    first: geometry.first.map((value) => octal(value)),
    second: geometry.second.map((value) => octal(value)),
  };
}

function changes(before, after) {
  const result = [];
  for (const [address, valueAfter] of after.entries()) {
    const valueBefore = before.get(address);
    if (valueBefore !== valueAfter) {
      result.push({
        address: octal(address, 6),
        before: octal(valueBefore),
        after: octal(valueAfter),
      });
    }
  }
  return result;
}

function runUntilTime(targetSeconds) {
  while (machine.simulated_time < targetSeconds) {
    stepBatch();
    assert.equal(machine.alarm_active, false, machine.last_alarm);
  }
}

function runUntil(predicate, timeoutSeconds, ticks = 2_000) {
  const deadline = machine.simulated_time + timeoutSeconds;
  while (!predicate() && machine.simulated_time < deadline) {
    stepBatch(ticks);
    assert.equal(machine.alarm_active, false, machine.last_alarm);
  }
  return predicate();
}

function traceTicks(count) {
  const states = new Map();
  const outputs = [];
  const trackerOutputs = [];
  const lightPenStateTransitions = [];
  let previousLost = machine.memory_word(0o200042, machine.simulated_time).meta;
  const pictureChangeTransitions = [];
  let previousPictureChange = machine.memory_word(0o200054, machine.simulated_time).meta;
  const badOverflowJumps = [];
  const pythagoreanSteps = [];
  for (let tick = 0; tick < count; tick += 1) {
    const before = machine.control_state();
    const key = `${before.sequence}:${before.program_counter.toString(8)}`;
    states.set(key, (states.get(key) ?? 0) + 1);
    const event = machine.step(machine.simulated_time);
    assert.equal(machine.alarm_active, false, machine.last_alarm);
    const after = machine.control_state();
    if (
      after.instruction_address >= 0o202340
      && after.instruction_address <= 0o202570
      && pythagoreanSteps.length < 1_000
    ) {
      pythagoreanSteps.push({
        sequence: after.sequence?.toString(8),
        address: octal(after.instruction_address, 6),
        instruction: after.instruction,
        a: octal(machine.memory_word(0o377604, machine.simulated_time).value),
        b: octal(machine.memory_word(0o377605, machine.simulated_time).value),
        d: octal(machine.memory_word(0o377607, machine.simulated_time).value),
        pyts: octal(machine.memory_word(0o203567, machine.simulated_time).value),
        pytt: octal(machine.memory_word(0o203570, machine.simulated_time).value),
        pytu: octal(machine.memory_word(0o203571, machine.simulated_time).value),
        mats: octal(machine.memory_word(0o200074, machine.simulated_time).value),
        matd: octal(machine.memory_word(0o200075, machine.simulated_time).value),
      });
    }
    if (
      after.program_counter === 0o200100
      && after.instruction.includes("JOV")
      && badOverflowJumps.length < 100
    ) {
      badOverflowJumps.push({
        sequence: after.sequence?.toString(8),
        fetchedAt: before.program_counter.toString(8),
        instruction: after.instruction,
        a: octal(machine.memory_word(0o377604, machine.simulated_time).value),
        b: octal(machine.memory_word(0o377605, machine.simulated_time).value),
        matm: octal(machine.memory_word(0o200071, machine.simulated_time).value),
        matd: octal(machine.memory_word(0o200075, machine.simulated_time).value),
        rotx: octal(machine.memory_word(0o207451, machine.simulated_time).value),
        roty: octal(machine.memory_word(0o207452, machine.simulated_time).value),
      });
    }
    const lost = machine.memory_word(0o200042, machine.simulated_time).meta;
    if (lost !== previousLost && lightPenStateTransitions.length < 100) {
      lightPenStateTransitions.push({
        sequence: before.sequence?.toString(8),
        pc: before.program_counter.toString(8),
        instruction: before.instruction,
        fromLost: previousLost,
        toLost: lost,
        prediction: octal(machine.memory_word(0o003574, machine.simulated_time).value),
      });
      previousLost = lost;
    }
    const pictureChange = machine.memory_word(0o200054, machine.simulated_time).meta;
    if (pictureChange !== previousPictureChange && pictureChangeTransitions.length < 100) {
      pictureChangeTransitions.push({
        sequence: before.sequence?.toString(8),
        pc: before.program_counter.toString(8),
        instruction: before.instruction,
        from: previousPictureChange,
        to: pictureChange,
        a: trackerWords()["003554"],
      });
      previousPictureChange = pictureChange;
    }
    if (event?.kind === "scope_point" && outputs.length < 100) {
      outputs.push({
        sequence: before.sequence?.toString(8),
        pc: before.program_counter.toString(8),
        x: event.x,
        y: event.y,
        origin: event.origin,
      });
    }
    if (
      event?.kind === "scope_point"
      && before.program_counter >= 0o001140
      && before.program_counter <= 0o001223
      && trackerOutputs.length < 100
    ) {
      trackerOutputs.push({
        sequence: before.sequence?.toString(8),
        pc: before.program_counter.toString(8),
        word: trackerWords()[octal(before.program_counter === 0o001163 ? 0o003613 : 0o003614, 6)],
        x: event.x,
        y: event.y,
        origin: event.origin,
      });
    }
  }
  return {
    states: [...states.entries()]
      .filter(([key]) => ["39", "45", "47", "48", "62"].some((sequence) => key.startsWith(`${sequence}:`)))
      .sort((left, right) => right[1] - left[1])
      .slice(0, 100),
    trackerStates: [...states.entries()]
      .filter(([key]) => {
        const [sequence, pc] = key.split(":");
        const address = Number.parseInt(pc, 8);
        return ["47", "48"].includes(sequence) && address >= 0o001112 && address <= 0o001277;
      })
      .sort((left, right) => Number.parseInt(left[0].split(":")[1], 8) - Number.parseInt(right[0].split(":")[1], 8)),
    outputs,
    trackerOutputs,
    lightPenStateTransitions,
    pictureChangeTransitions,
    badOverflowJumps,
    pythagoreanSteps,
  };
}

function traceNextDisplayBuild(timeoutSeconds = 10) {
  const deadline = machine.simulated_time + timeoutSeconds;
  const trace = [];
  let entered = false;
  let completed = false;
  while (!completed && machine.simulated_time < deadline) {
    const state = machine.control_state();
    if (state.sequence === 0o76 && state.instruction_address === 0o205643) {
      entered = true;
    }
    if (
      state.sequence === 0o76
      && (
        (state.program_counter >= 0o205220 && state.program_counter <= 0o205767)
        || (state.instruction_address >= 0o200020 && state.instruction_address <= 0o200030)
      )
      && trace.length < 4_000
    ) {
      trace.push({
        state,
        indexes: Object.fromEntries([1, 2, 3, 7].map((index) => [
          octal(index, 2),
          machine.index_register(index),
        ])),
        a: octal(machine.memory_word(0o377604, machine.simulated_time).value),
        b: octal(machine.memory_word(0o377605, machine.simulated_time).value),
        ndisp: octal(machine.memory_word(0o200031, machine.simulated_time).value),
      });
    }
    if (entered && state.sequence === 0o76 && state.instruction_address === 0o205662) {
      completed = true;
    }
    machine.step(machine.simulated_time);
    assert.equal(machine.alarm_active, false, machine.last_alarm);
  }
  return { entered, completed, trace };
}

runUntilTime(200);
assert.ok(
  runUntil(() => !machine.memory_word(0o200042, machine.simulated_time).meta, 200),
  "the original tracker must acquire the initial stationary pen",
);
const displayWordsBeforeDraw = Array.from({ length: 0o100 }, (_, offset) => ({
  address: octal(0o100000 + offset, 6),
  word: octal(machine.memory_word(0o100000 + offset, machine.simulated_time).value),
}));
const queueBefore = machine.memory_word(0o004127, machine.simulated_time).value;
const listBefore = machine.memory_word(0o024000, machine.simulated_time).value;
const memoryBefore = snapshot();
const detectionsAfterBoot = Number(machine.light_pen_detection_count);
const penAfterBoot = [
  machine.memory_word(0o200042, machine.simulated_time).value,
  machine.memory_word(0o200043, machine.simulated_time).value,
];
const trackerAfterBoot = trackerWords();
const flagsAfterBoot = raisedFlags();
const controlAfterBoot = machine.control_state();
const sequencesAfterBoot = sequenceRegisters();

phase = "draw";
const commandStart = machine.simulated_time;
machine.set_external_input_register(0, 0, 0, 0o200, false);
const drawTrace = [];
const drawDeadline = machine.simulated_time + 20;
while (
  machine.memory_word(0o024000, machine.simulated_time).value <= listBefore
  && machine.simulated_time < drawDeadline
) {
  const state = machine.control_state();
  if (state.instruction_address >= 0o005455 && state.instruction_address <= 0o006020) {
    drawTrace.push({
      state,
      alpha: machine.index_register(0o01),
      gamma: machine.index_register(0o03),
      movingHead: octal(machine.memory_word(0o024114, machine.simulated_time).value),
    });
  }
  stepBatch(1);
  assert.equal(machine.alarm_active, false, machine.last_alarm);
}
const drawAllocated = machine.memory_word(0o024000, machine.simulated_time).value > listBefore;
if (!drawAllocated) {
  console.error(JSON.stringify({
    failure: "DRAW did not allocate picture records",
    simulatedTime: machine.simulated_time,
    externalInput: octal(machine.memory_word(0o377621, machine.simulated_time).value),
    list: octal(machine.memory_word(0o024000, machine.simulated_time).value),
    control: machine.control_state(),
    flags: raisedFlags(),
    sequences: sequenceRegisters(),
    pen: machine.unit_status(0o55, machine.simulated_time),
    prediction: octal(machine.memory_word(0o003574, machine.simulated_time).value),
    trackerRadiusWord: octal(machine.memory_word(0o003423, machine.simulated_time).value),
    trackerIncrement: octal(machine.memory_word(0o003612, machine.simulated_time).value),
    trackerIndexes: {
      x24: machine.index_register(0o24),
      x25: machine.index_register(0o25),
    },
    pspl: [
      octal(machine.memory_word(0o200042, machine.simulated_time).value),
      octal(machine.memory_word(0o200043, machine.simulated_time).value),
    ],
  }, null, 2));
}
assert.ok(
  drawAllocated,
  "the DRAW command must allocate picture records",
);
const drawCompletionTrace = [];
const drawCompletionStates = new Map();
const drawCompletionDeadline = machine.simulated_time + 20;
while (
  machine.control_state().instruction_address !== 0o005553
  && machine.simulated_time < drawCompletionDeadline
) {
  const state = machine.control_state();
  const key = `${state.sequence?.toString(8)}:${octal(state.instruction_address, 6)}`;
  drawCompletionStates.set(key, (drawCompletionStates.get(key) ?? 0) + 1);
  if (
    state.instruction_address >= 0o005455
    && state.instruction_address <= 0o006020
    && drawCompletionTrace.length < 2_000
  ) {
    drawCompletionTrace.push({
      state,
      alpha: machine.index_register(0o01),
      gamma: machine.index_register(0o03),
      s: machine.index_register(0o07),
      movingHead: octal(machine.memory_word(0o024114, machine.simulated_time).value),
      listEnd: octal(machine.memory_word(0o024000, machine.simulated_time).value, 6),
    });
  }
  stepBatch(1);
  assert.equal(machine.alarm_active, false, machine.last_alarm);
}
const drawRoutineCompleted = machine.control_state().instruction_address === 0o005553;
assert.ok(drawRoutineCompleted, "the original STARTDRAW routine must return");
stepBatch(1);
const queueAfter = machine.memory_word(0o004127, machine.simulated_time).value;
const listAfter = machine.memory_word(0o024000, machine.simulated_time).value;
const detectionsAfterDraw = Number(machine.light_pen_detection_count);
const memoryAfterDraw = snapshot();
const trackerAfterDraw = trackerWords();
const penLostAfterDraw = machine.memory_word(0o200042, machine.simulated_time).meta;
const movingHeadAfterDraw = octal(machine.memory_word(0o024114, machine.simulated_time).value);
const buttonsAfterDraw = Object.fromEntries([
  0o004127,
  0o011406,
  0o011407,
  0o011427,
  0o011430,
  0o377621,
].map((address) => [octal(address, 6), machine.memory_word(address, machine.simulated_time)]));
machine.set_external_input_register(0, 0, 0, 0, false);
const flagsAfterDraw = raisedFlags();
const controlAfterDraw = machine.control_state();
const sequencesAfterDraw = sequenceRegisters();
const commandCompleted = drawRoutineCompleted;
const commandSeconds = machine.simulated_time - commandStart;
const penUnitAfterCommand = machine.unit_status(0o55, machine.simulated_time);
const firstX = 575 / 1022;
const firstY = 1 - 575 / 1022;
machine.set_light_pen(firstX, firstY, 8 / 1022, true);
const detectionsBeforeReacquire = Number(machine.light_pen_detection_count);
const predictionBeforeReacquire = machine.memory_word(0o003574, machine.simulated_time).value;
const postDrawRing = [];
const postDrawBeginning = [];
const movingHeadTransitions = [];
const stopMovingEntries = [];
const reacquireDeadline = machine.simulated_time + 200;
const isReacquired = () => (
  Number(machine.light_pen_detection_count) > detectionsBeforeReacquire
  && machine.memory_word(0o003574, machine.simulated_time).value !== predictionBeforeReacquire
  && !machine.memory_word(0o200042, machine.simulated_time).meta
);
let reacquired = !penLostAfterDraw;
while (!reacquired && machine.simulated_time < reacquireDeadline) {
  const state = machine.control_state();
  const headBefore = machine.memory_word(0o024114, machine.simulated_time).value;
  if (state.sequence === 0o76) {
    if (postDrawBeginning.length < 240) {
      postDrawBeginning.push({ state, head: octal(headBefore) });
    }
    postDrawRing.push({ state, head: octal(headBefore) });
    if (postDrawRing.length > 120) postDrawRing.shift();
    if (state.instruction_address === 0o006040 && stopMovingEntries.length < 10) {
      stopMovingEntries.push([...postDrawRing]);
    }
  }
  stepBatch(1);
  const headAfter = machine.memory_word(0o024114, machine.simulated_time).value;
  if (headAfter !== headBefore) {
    movingHeadTransitions.push({
      state,
      afterState: machine.control_state(),
      before: octal(headBefore),
      after: octal(headAfter),
      ring: [...postDrawRing],
    });
  }
  reacquired = isReacquired();
}
const penUnitAfterReacquire = machine.unit_status(0o55, machine.simulated_time);
const executionTraceAfterReacquire = traceTicks(0);
const movementSteps = 160;
const finalX = firstX + movementSteps / 1022;
const finalY = firstY - movementSteps / 1022;
const movement = [];
const trackerDebug = [];
for (let step = 1; step <= movementSteps; step += 1) {
  phase = `move-${step}`;
  const fraction = step / movementSteps;
  const detectionsBeforeStep = Number(machine.light_pen_detection_count);
  machine.set_light_pen(
    firstX + (finalX - firstX) * fraction,
    firstY + (finalY - firstY) * fraction,
    26 / 1022,
    true,
  );
  let detected;
  {
    const instructionRing = [];
    const stateCounts = new Map();
    const detections = [];
    const wordsBeforeStep = trackerWords();
    const indexesBeforeStep = {
      alpha: machine.index_register(0o01),
      s: machine.index_register(0o07),
    };
    const sq60seeTrace = [];
    const indexTransitions = [];
    const deadline = machine.simulated_time + 2;
    try {
      while (
        Number(machine.light_pen_detection_count) <= detectionsBeforeStep
        && machine.simulated_time < deadline
      ) {
        const state = machine.control_state();
        capturePseudoTrace(state);
        instructionRing.push(state);
        if (instructionRing.length > 80) instructionRing.shift();
        const key = `${state.sequence?.toString(8)}:${octal(state.instruction_address, 6)}`;
        stateCounts.set(key, (stateCounts.get(key) ?? 0) + 1);
        if (
          state.instruction_address >= 0o001014
          && state.instruction_address <= 0o001020
          && sq60seeTrace.length < 100
        ) {
          sq60seeTrace.push({
            state,
            alpha: machine.index_register(0o01),
            s: machine.index_register(0o07),
            lpseen: octal(machine.memory_word(0o003555, machine.simulated_time).value),
          });
        }
        const countBefore = Number(machine.light_pen_detection_count);
        const alphaBefore = machine.index_register(0o01);
        const sBefore = machine.index_register(0o07);
        const event = machine.step(machine.simulated_time);
        const alphaAfter = machine.index_register(0o01);
        const sAfter = machine.index_register(0o07);
        if (
          (alphaBefore !== alphaAfter || sBefore !== sAfter)
          && indexTransitions.length < 100
        ) {
          indexTransitions.push({
            beforeState: state,
            afterState: machine.control_state(),
            alphaBefore,
            alphaAfter,
            sBefore,
            sAfter,
          });
        }
        if (Number(machine.light_pen_detection_count) > countBefore && detections.length < 20) {
          detections.push({
            state,
            event,
            prediction: octal(machine.memory_word(0o003574, machine.simulated_time).value),
            center: octal(machine.memory_word(0o003611, machine.simulated_time).value),
            points: [0o001170, 0o001171, 0o001172, 0o001173].map((address) =>
              octal(machine.memory_word(address, machine.simulated_time).value)),
          });
        }
      }
      detected = Number(machine.light_pen_detection_count) > detectionsBeforeStep;
      const settleDeadline = machine.simulated_time + 0.02;
      while (machine.simulated_time < settleDeadline) {
        const state = machine.control_state();
        capturePseudoTrace(state);
        instructionRing.push(state);
        if (instructionRing.length > 80) instructionRing.shift();
        const key = `${state.sequence?.toString(8)}:${octal(state.instruction_address, 6)}`;
        stateCounts.set(key, (stateCounts.get(key) ?? 0) + 1);
        if (
          state.instruction_address >= 0o001014
          && state.instruction_address <= 0o001020
          && sq60seeTrace.length < 100
        ) {
          sq60seeTrace.push({
            state,
            alpha: machine.index_register(0o01),
            s: machine.index_register(0o07),
            lpseen: octal(machine.memory_word(0o003555, machine.simulated_time).value),
          });
        }
        const alphaBefore = machine.index_register(0o01);
        const sBefore = machine.index_register(0o07);
        machine.step(machine.simulated_time);
        const alphaAfter = machine.index_register(0o01);
        const sAfter = machine.index_register(0o07);
        if (
          (alphaBefore !== alphaAfter || sBefore !== sAfter)
          && indexTransitions.length < 100
        ) {
          indexTransitions.push({
            beforeState: state,
            afterState: machine.control_state(),
            alphaBefore,
            alphaAfter,
            sBefore,
            sAfter,
          });
        }
      }
      if (step <= 6) {
        const wordsAfterStep = trackerWords();
        trackerDebug.push({
          step,
          indexesBeforeStep,
          indexesAfterStep: {
            alpha: machine.index_register(0o01),
            s: machine.index_register(0o07),
          },
          sq60seeTrace,
          indexTransitions,
          stateCounts: [...stateCounts.entries()].sort((left, right) => right[1] - left[1]),
          detections,
          changes: Object.fromEntries(Object.entries(wordsAfterStep).filter(
            ([address, value]) => wordsBeforeStep[address] !== value,
          ).map(([address, value]) => [address, { before: wordsBeforeStep[address], after: value }])),
          control: machine.control_state(),
        });
      }
    } catch (error) {
      console.error(JSON.stringify({
        phase,
        error: String(error),
        control: machine.control_state(),
        instructionRing,
      }, null, 2));
      throw error;
    }
  }
  movement.push({
    step,
    detected,
    detections: Number(machine.light_pen_detection_count),
    pspl: [
      octal(machine.memory_word(0o200042, machine.simulated_time).value),
      octal(machine.memory_word(0o200043, machine.simulated_time).value),
    ],
    points: linePointCoordinates(),
    penLost: machine.memory_word(0o200042, machine.simulated_time).meta,
    movingHead: octal(machine.memory_word(0o024114, machine.simulated_time).value),
    ndisp: octal(machine.memory_word(0o200031, machine.simulated_time).value),
    sndisp: octal(machine.memory_word(0o200032, machine.simulated_time).value),
    basicFile: octal(machine.memory_word(0o200033, machine.simulated_time).value),
    scope: phaseScope.get(phase) ?? null,
  });
}

const pointsBeforeStop = linePointCoordinates();
machine.set_light_pen(finalX, finalY, 26 / 1022, false);
const stopTrace = [];
const normalizationTrace = [];
const stopDeadline = machine.simulated_time + 200;
while (
  octal(machine.memory_word(0o024114, machine.simulated_time).value) !== "000114000114"
  && machine.simulated_time < stopDeadline
) {
  const state = machine.control_state();
  if (
    state.sequence === 0o76
    && state.program_counter >= 0o201767
    && state.program_counter <= 0o202017
    && normalizationTrace.length < 500
  ) {
    normalizationTrace.push({
      state,
      a: octal(machine.memory_word(0o377604, machine.simulated_time).value),
      b: octal(machine.memory_word(0o377605, machine.simulated_time).value),
      c: octal(machine.memory_word(0o377606, machine.simulated_time).value),
      d: octal(machine.memory_word(0o377607, machine.simulated_time).value),
      scsz: octal(machine.memory_word(0o200402, machine.simulated_time).value),
      transformedLine: [0o200022, 0o200023, 0o200024, 0o200025].map((address) =>
        octal(machine.memory_word(address, machine.simulated_time).value)),
      normalized: [0o203557, 0o203560].map((address) =>
        octal(machine.memory_word(address, machine.simulated_time).value)),
    });
  }
  if (
    (
      state.program_counter >= 0o006030
      && state.program_counter <= 0o006170
    )
    || (
      state.sequence === 0o76
      && state.program_counter >= 0o205220
      && state.program_counter <= 0o205770
    )
    || (
      state.sequence === 0o76
      && state.program_counter >= 0o201470
      && state.program_counter <= 0o202337
    )
  ) {
    stopTrace.push({
      state,
      movingHead: octal(machine.memory_word(0o024114, machine.simulated_time).value),
      movingDone: machine.memory_word(0o200061, machine.simulated_time),
      moved: machine.memory_word(0o200034, machine.simulated_time),
      ndisp: octal(machine.memory_word(0o200031, machine.simulated_time).value),
      sndisp: octal(machine.memory_word(0o200032, machine.simulated_time).value),
      basicFile: octal(machine.memory_word(0o200033, machine.simulated_time).value),
      indexes: Object.fromEntries([1, 2, 3, 7].map((index) => [
        octal(index, 2),
        machine.index_register(index),
      ])),
      lineMath: Object.fromEntries(Array.from({ length: 0o16 }, (_, offset) => {
        const address = 0o203547 + offset;
        return [octal(address, 6), octal(machine.memory_word(address, machine.simulated_time).value)];
      })),
      transformedLine: [0o200022, 0o200023, 0o200024, 0o200025].map((address) =>
        octal(machine.memory_word(address, machine.simulated_time).value)),
      arithmetic: Object.fromEntries([0o377604, 0o377605, 0o377606, 0o377607, 0o377610].map(
        (address) => [octal(address, 6), octal(machine.memory_word(address, machine.simulated_time).value)],
      )),
    });
  }
  machine.step(machine.simulated_time);
  assert.equal(machine.alarm_active, false, machine.last_alarm);
}
const stopCompleted = octal(machine.memory_word(0o024114, machine.simulated_time).value) === "000114000114";
const displayBuildTrace = traceNextDisplayBuild();
phase = "verify-line";
runUntilTime(machine.simulated_time + 1);

if (process.env.TRACK_ONLY === "1") {
  console.log(JSON.stringify({
    commandCompleted,
    commandSeconds,
    penLostAfterDraw,
    movingHeadAfterDraw,
    buttonsAfterDraw,
    movingHeadTransitions,
    postDrawBeginning,
    stopMovingEntries,
    reacquired,
    penUnitAfterCommand,
    penUnitAfterReacquire,
    predictionBeforeReacquire: octal(predictionBeforeReacquire),
    currentPrediction: octal(machine.memory_word(0o003574, machine.simulated_time).value),
    pointsBeforeStop,
    stopCompleted,
    points: linePointCoordinates(),
    stopTrace,
    normalizationTrace,
    displayBuildTrace,
    pictureLists: Object.fromEntries([
      0o024117,
      0o024155,
      0o024160,
      0o024201,
      0o024225,
      0o024275,
      0o024635,
      0o024657,
      0o024701,
    ].map((address) => [octal(address, 6), Array.from({ length: 0o22 }, (_, offset) =>
      octal(machine.memory_word(address + offset, machine.simulated_time).value))])),
    displayWordsBeforeDraw,
    displayState: {
      ndisp: machine.memory_word(0o200031, machine.simulated_time),
      sndisp: machine.memory_word(0o200032, machine.simulated_time),
      basicFile: machine.memory_word(0o200033, machine.simulated_time),
      moved: machine.memory_word(0o200034, machine.simulated_time),
      pictureChange: machine.memory_word(0o200054, machine.simulated_time),
      scopeIndex: machine.index_register(0o34),
      displayWords: Array.from({ length: 0o100 }, (_, offset) => ({
        address: octal(0o100000 + offset, 6),
        word: octal(machine.memory_word(0o100000 + offset, machine.simulated_time).value),
      })),
    },
    verificationScope,
    movingState: {
      movingDone: machine.memory_word(0o200061, machine.simulated_time),
      header: Array.from({ length: 0o10 }, (_, offset) => ({
        address: octal(0o024111 + offset, 6),
        word: machine.memory_word(0o024111 + offset, machine.simulated_time),
      })),
      listChanges: changes(memoryAfterDraw, snapshot()),
    },
    drawTrace,
    drawCompletionTrace,
    drawCompletionStates: [...drawCompletionStates.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 100),
    movement,
    trackerDebug,
    pseudoTrace,
    control: machine.control_state(),
  }, null, 2));
  process.exit(0);
}

const penAtEnd = [
  machine.memory_word(0o200042, machine.simulated_time).value,
  machine.memory_word(0o200043, machine.simulated_time).value,
];
const memoryAfterStop = snapshot();
const trackerAfterStop = trackerWords();

if (process.env.CONSTRAINT_ONLY !== "1") console.log(JSON.stringify({
  simulatedSeconds: machine.simulated_time,
  scopePoints,
  lightPenDetections: Number(machine.light_pen_detection_count),
  reachedReadit,
  queueBefore,
  queueAfter,
  listBefore,
  listAfter,
  detectionsAfterBoot,
  detectionsAfterDraw,
  penAfterBoot: penAfterBoot.map((value) => octal(value)),
  penAtEnd,
  trackerAfterBoot,
  trackerAfterDraw,
  trackerAfterStop,
  flagsAfterBoot,
  flagsAfterDraw,
  controlAfterBoot,
  controlAfterDraw,
  sequencesAfterBoot,
  sequencesAfterDraw,
  commandCompleted,
  commandSeconds,
  reacquired,
  penUnitAfterCommand,
  penUnitAfterReacquire,
  executionTraceAfterReacquire,
  changesAfterDraw: changes(memoryBefore, memoryAfterDraw),
  changesAfterStop: changes(memoryBefore, memoryAfterStop),
  movement,
  verificationScope,
  phaseScope: Object.fromEntries(phaseScope),
  beamBounds: {
    x: [observedXMin, observedXMax],
    y: [observedYMin, observedYMax],
  },
  control: machine.control_state(),
}, null, 2));

assert.ok(scopePoints > 0, "the assembly must emit scope points on unit 60");
assert.ok(machine.light_pen_detection_count > 0n, "the emulated light pen must detect the beam");
assert.equal(queueBefore, 0, "the input queue must start empty");
assert.ok(reachedReadit || queueAfter === 0, "sequence 76 must consume the DRAW command through READIT");

if (process.env.CONSTRAINT_ONLY === "1") {
  phase = "select-line";
  const lineStats = phaseScope.get("verify-line");
  const centerX = (lineStats.x[0] + lineStats.x[1]) / 2;
  const centerY = (lineStats.y[0] + lineStats.y[1]) / 2;
  const selectionPoint = verificationScope.reduce((closest, point) => {
    const distanceSquared = (point.x - centerX) ** 2 + (point.y - centerY) ** 2;
    return distanceSquared < closest.distanceSquared ? { ...point, distanceSquared } : closest;
  }, { x: null, y: null, distanceSquared: Infinity });
  const midpointX = selectionPoint.x;
  const midpointY = selectionPoint.y;
  machine.set_light_pen(midpointX / 1022, 1 - midpointY / 1022, 2 / 1022, true);
  const beforeAtBits = octal(machine.memory_word(0o200044, machine.simulated_time).value);
  const beforeConstraintList = machine.memory_word(0o024000, machine.simulated_time).value;
  const selectionDeadline = machine.simulated_time + 5;
  let trueupPressed = false;
  while (machine.simulated_time < selectionDeadline) {
    const state = machine.control_state();
    const atBitsAtInstruction = machine.memory_word(0o200044, machine.simulated_time).value;
    if (
      state.sequence === 0o76
      && state.instruction_address === 0o002320
      && hasOctalBit(atBitsAtInstruction, 0o4000000)
    ) {
      machine.set_external_input_register(0, 0, 0o400, 0, false);
      trueupPressed = true;
      break;
    }
    stepBatch(1);
    assert.equal(machine.alarm_active, false, machine.last_alarm);
  }
  const selectedAtBits = octal(machine.memory_word(0o200044, machine.simulated_time).value);
  const selectedObject = octal(machine.memory_word(0o200045, machine.simulated_time).value);
  assert.ok(
    hasOctalBit(machine.memory_word(0o200044, machine.simulated_time).value, 0o4000000),
    "the original selection code must identify a line before TRUEUP",
  );
  assert.equal(trueupPressed, true, "the TRUEUP button must be pressed while the line remains selected");
  const trueupStart = machine.simulated_time;
  let enteredTrueup = false;
  while (machine.simulated_time < trueupStart + 200 && !enteredTrueup) {
    const state = machine.control_state();
    enteredTrueup ||= state.sequence === 0o76 && state.instruction_address === 0o005421;
    stepBatch(1);
    assert.equal(machine.alarm_active, false, machine.last_alarm);
  }
  machine.set_external_input_register(0, 0, 0, 0, false);
  machine.set_light_pen(midpointX / 1022, 1 - midpointY / 1022, 2 / 1022, false);
  assert.equal(enteredTrueup, true, "the TRUEUP button must enter the original routine");
  const constraintAddress = 0o024000 + Number(beforeConstraintList);
  const constraintDeadline = machine.simulated_time + 20;
  let returnedFromTrueup = false;
  while (!returnedFromTrueup && machine.simulated_time < constraintDeadline) {
    const state = machine.control_state();
    returnedFromTrueup = state.sequence === 0o76 && state.instruction_address === 0o005454;
    if (returnedFromTrueup) break;
    stepBatch(1);
    assert.equal(machine.alarm_active, false, machine.last_alarm);
  }
  const selectedLineWord = machine.memory_word(0o200045, machine.simulated_time).value;
  const geometryBeforeRelax = lineGeometry(selectedLineWord);
  machine.set_toggle_register(0o20, 0o400, 0, 0, 0, true);
  const relaxDeadline = machine.simulated_time + 200;
  let enteredRelax = false;
  let geometryAfterRelax = lineGeometry(selectedLineWord);
  while (machine.simulated_time < relaxDeadline) {
    const state = machine.control_state();
    if (state.instruction_address === 0o200060) {
      enteredRelax = true;
    }
    stepBatch(1);
    assert.equal(machine.alarm_active, false, machine.last_alarm);
    geometryAfterRelax = lineGeometry(selectedLineWord);
    if (
      geometryAfterRelax.first.some((value, index) => value !== geometryBeforeRelax.first[index])
      || geometryAfterRelax.second.some((value, index) => value !== geometryBeforeRelax.second[index])
    ) {
      break;
    }
  }
  machine.set_toggle_register(0o20, 0o400, 0, 0, 0, false);
  const geometryChanged = (
    geometryAfterRelax.first.some((value, index) => value !== geometryBeforeRelax.first[index])
    || geometryAfterRelax.second.some((value, index) => value !== geometryBeforeRelax.second[index])
  );
  const afterConstraintList = machine.memory_word(0o024000, machine.simulated_time).value;
  const constraintObject = Array.from({ length: 0o24 }, (_, offset) =>
    machine.memory_word(constraintAddress + offset, machine.simulated_time).value);
  const residualBefore = geometryBeforeRelax.first.map((value, index) =>
    Math.abs(value - geometryBeforeRelax.second[index]));
  const residualAfter = geometryAfterRelax.first.map((value, index) =>
    Math.abs(value - geometryAfterRelax.second[index]));
  console.log(JSON.stringify({
    beforeAtBits,
    selectedAtBits,
    selectedObject,
    beforeConstraintList: octal(beforeConstraintList),
    afterConstraintList: octal(afterConstraintList),
    constraintAddress: octal(constraintAddress, 6),
    constraintMaster: octal(rightHalf(constraintObject[0]), 6),
    enteredTrueup,
    returnedFromTrueup,
    enteredRelax,
    geometryChanged,
    geometryBeforeRelax: geometryForReport(geometryBeforeRelax),
    geometryAfterRelax: geometryForReport(geometryAfterRelax),
    residualBefore: residualBefore.map((value) => octal(value)),
    residualAfter: residualAfter.map((value) => octal(value)),
    controlAfterConstraint: machine.control_state(),
    alarm: machine.last_alarm,
  }, null, 2));
  assert.equal(afterConstraintList, Number(beforeConstraintList) + 0o16,
    "TRUEUP must allocate one HOV constraint block");
  assert.equal(returnedFromTrueup, true, "the original TRUEUP routine must return");
  assert.equal(rightHalf(constraintObject[0]), 0o561,
    "the new constraint must use the HOV master");
  assert.equal(enteredRelax, true, "the enabled FIX toggle must call the original RELAX routine");
  assert.equal(geometryChanged, true, "the original RELAX routine must change the constrained line");
  assert.ok(
    residualAfter.some((value, index) => value < residualBefore[index]),
    "the original RELAX routine must reduce one HOV coordinate residual",
  );
}
