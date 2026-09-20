import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import init, {
  SketchpadMachine,
  sketchpad_tape,
} from "../web/pkg/sketchpad_web.js";

const wasmUrl = new URL("../web/pkg/sketchpad_web_bg.wasm", import.meta.url);
await init({ module_or_path: await readFile(fileURLToPath(wasmUrl)) });

const machine = new SketchpadMachine();
const activatePenAfterBoot = process.env.PEN_AFTER_BOOT === "1";
const selectedCommand = process.env.SELECT_COMMAND ?? "2.9";
const constraintCode = Number.parseInt(process.env.CONSTRAINT_CODE ?? "0", 8);
assert.ok(Number.isInteger(constraintCode) && constraintCode >= 0 && constraintCode <= 0o777,
  "CONSTRAINT_CODE must be a nine-bit octal value");
const perpendicularFlangeMode = process.env.PERPENDICULAR_FLANGE === "1";
const perpendicularMode = process.env.PERPENDICULAR_ONLY === "1" || perpendicularFlangeMode;
const polylineMode = process.env.POLYLINE_ONLY === "1" || perpendicularMode;
const perpendicularStagingPoint = { x: 455, y: 455 };
const constraintEditingQuarter4 = 0o510;
const pointMappingQuarter4 = 0o100;
const selectedCommandParts = selectedCommand.split(".").map(Number);
assert.equal(selectedCommandParts.length, 2, "SELECT_COMMAND must use quarter.bit form");
const [selectedCommandQuarter, selectedCommandBit] = selectedCommandParts;
assert.ok(selectedCommandQuarter >= 1 && selectedCommandQuarter <= 4,
  "SELECT_COMMAND quarter must be 1 through 4");
assert.ok(selectedCommandBit >= 1 && selectedCommandBit <= 9,
  "SELECT_COMMAND bit must be 1 through 9");

function setCommand(quarter, bit, held) {
  const quarters = [0, 0, 0, 0];
  if (held) quarters[4 - quarter] = 1 << (bit - 1);
  machine.set_external_input_register(...quarters, false);
}

function setSelectedCommand(held) {
  setCommand(selectedCommandQuarter, selectedCommandBit, held);
}
// Physical console switches used by the original program during interactive work.
// DRAWASFIX returns to the display cycle after READIT. SHOWBLKS keeps selectable
// non-drawing display records visible to the light pen.
machine.set_toggle_register(0o20, 0o400, 0, 0, 0, process.env.FIX_FROM_BOOT === "1");
machine.set_toggle_register(
  0o25,
  perpendicularMode ? 0o700 : 0o400 | (polylineMode ? 0o100 : 0),
  perpendicularMode ? 0o400 : 0,
  0,
  constraintCode,
  false,
);
const sketchpadTapeBytes = sketchpad_tape();
const sketchpadTapeSha256 = createHash("sha256").update(sketchpadTapeBytes).digest("hex");
machine.mount_tape(sketchpadTapeBytes, 0);
machine.set_light_pen(
  575 / 1022,
  1 - 575 / 1022,
  26 / 1022,
  !activatePenAfterBoot,
);
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
const circleVerificationScope = [];
const pseudoTrace = [];
const recentControlStates = [];
let fineAssemblyTrace = false;
let watchedRingValue = null;
const ringOperationTrace = [];
const sequence47Trace = [];
const atBitsWriteTrace = [];
let tracedAtBitsObject = null;
let stopMovingCallCount = 0;

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

function solveThreeByThree(matrix, vector) {
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < 3; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < 3; row += 1) {
      if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) {
        pivot = row;
      }
    }
    assert.ok(Math.abs(rows[pivot][column]) > 1e-9,
      "the emitted arc must contain enough curvature for a circle fit");
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let entry = column; entry < 4; entry += 1) {
      rows[column][entry] /= divisor;
    }
    for (let row = 0; row < 3; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let entry = column; entry < 4; entry += 1) {
        rows[row][entry] -= factor * rows[column][entry];
      }
    }
  }
  return rows.map((row) => row[3]);
}

function fitCircularLocus(points) {
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  const sums = points.reduce((result, point) => {
    const x = point.x - meanX;
    const y = point.y - meanY;
    const square = x * x + y * y;
    result.xx += x * x;
    result.xy += x * y;
    result.yy += y * y;
    result.x += x;
    result.y += y;
    result.xz -= x * square;
    result.yz -= y * square;
    result.z -= square;
    return result;
  }, { xx: 0, xy: 0, yy: 0, x: 0, y: 0, xz: 0, yz: 0, z: 0 });
  const [a, b, c] = solveThreeByThree([
    [sums.xx, sums.xy, sums.x],
    [sums.xy, sums.yy, sums.y],
    [sums.x, sums.y, points.length],
  ], [sums.xz, sums.yz, sums.z]);
  const center = { x: meanX - a / 2, y: meanY - b / 2 };
  const radius = Math.sqrt((a * a + b * b) / 4 - c);
  const errors = points.map(({ x, y }) => Math.abs(Math.hypot(
    x - center.x,
    y - center.y,
  ) - radius));
  return {
    center,
    radius,
    maximumError: Math.max(...errors),
    rootMeanSquareError: Math.sqrt(
      errors.reduce((sum, error) => sum + error * error, 0) / errors.length,
    ),
  };
}

function stepBatch(ticks = 20_000) {
  const tracingConstraintInput = process.env.TRACE_47 === "1"
    && ["expose-perpendicular-handles", "attach-perpendicular-handle"].includes(phase);
  if ((fineAssemblyTrace
      || tracingConstraintInput)
    && ticks > 1) {
    const events = [];
    for (let tick = 0; tick < ticks; tick += 1) events.push(...stepBatch(1));
    return events;
  }
  const tracedControl = machine.control_state();
  if (tracingConstraintInput) {
    const currentAtBitsObject = machine.memory_word(
      0o200045,
      machine.simulated_time,
    ).value;
    if (tracedAtBitsObject !== currentAtBitsObject) {
      atBitsWriteTrace.push({
        time: machine.simulated_time,
        before: tracedAtBitsObject === null ? null : octal(tracedAtBitsObject),
        after: octal(currentAtBitsObject),
        control: tracedControl,
        trackerWords: Array.from({ length: 0o50 }, (_, offset) => ({
          address: octal(0o003540 + offset, 6),
          value: octal(machine.memory_word(
            0o003540 + offset,
            machine.simulated_time,
          ).value),
        })),
      });
      if (atBitsWriteTrace.length > 20) atBitsWriteTrace.shift();
      tracedAtBitsObject = currentAtBitsObject;
    }
  }
  if (process.env.TRACE_47 === "1"
    && tracedControl.sequence === 0o47
    && tracedControl.instruction_address >= 0o004020
    && tracedControl.instruction_address <= 0o004126) {
    sequence47Trace.push({
      time: machine.simulated_time,
      address: octal(tracedControl.instruction_address, 6),
      instruction: tracedControl.instruction,
      indexes: Array.from({ length: 16 }, (_, index) =>
        octal(machine.index_register(index) & 0o777777, 6)),
      atBits: [0o200044, 0o200045, 0o200046, 0o200047].map((address) =>
        octal(machine.memory_word(address, machine.simulated_time).value)),
      page1: octal(machine.memory_word(0o011423, machine.simulated_time).value),
      switch: [0o003610, 0o003611, 0o003612, 0o003613].map((address) =>
        octal(machine.memory_word(address, machine.simulated_time).value)),
      input: [0o377621, 0o011425, 0o011426, 0o011404, 0o011405, 0o004127]
        .map((address) => octal(machine.memory_word(address, machine.simulated_time).value)),
    });
    if (sequence47Trace.length > 400) sequence47Trace.shift();
  }
  if (fineAssemblyTrace
    && tracedControl.sequence === 0o76
    && tracedControl.instruction_address >= 0o006435
    && tracedControl.instruction_address <= 0o006460) {
    ringOperationTrace.push({
      address: octal(tracedControl.instruction_address, 6),
      instruction: tracedControl.instruction,
      indexes: Array.from({ length: 16 }, (_, index) =>
        octal(machine.index_register(index) & 0o777777, 6)),
      links: [
        0o024114, 0o025170, 0o025176, 0o025222, 0o025340, 0o025434, 0o025435,
        0o025436,
      ]
        .map((address) => [octal(address, 6), octal(
          machine.memory_word(address, machine.simulated_time).value,
        )]),
      atBits: [0o200044, 0o200045, 0o200046].map((address) =>
        octal(machine.memory_word(address, machine.simulated_time).value)),
    });
    if (ringOperationTrace.length > 160) ringOperationTrace.shift();
  }
  if (!fineAssemblyTrace || (
    tracedControl.sequence === 0o76
      && tracedControl.instruction_address >= 0o205700
      && tracedControl.instruction_address <= 0o205735
  )) {
    recentControlStates.push(fineAssemblyTrace ? {
      address: octal(tracedControl.instruction_address, 6),
      instruction: tracedControl.instruction,
      xr1: octal(machine.index_register(0o1) & 0o777777, 6),
      xr3: octal(machine.index_register(0o3) & 0o777777, 6),
      xr7: octal(machine.index_register(0o7) & 0o777777, 6),
      xr10: octal(machine.index_register(0o10) & 0o777777, 6),
    } : {
      phase,
      time: machine.simulated_time,
      control: tracedControl,
      indexes: Array.from({ length: 16 }, (_, index) => machine.index_register(index)),
    });
    if (recentControlStates.length > 160) recentControlStates.shift();
  }
  let events;
  try {
    events = machine.step_batch(machine.simulated_time, ticks);
  } catch (error) {
    console.error(JSON.stringify({
      failure: "step batch",
      phase,
      ticks,
      control: machine.control_state(),
      indexes: Object.fromEntries(Array.from({ length: 16 }, (_, index) => [
        octal(index, 2),
        machine.index_register(index),
      ])),
      picture: perpendicularMode && process.env.TRACE_47 !== "1"
        ? perpendicularPictureState()
        : undefined,
      recentControlStates: perpendicularMode && process.env.TRACE_47 !== "1"
        ? recentControlStates
        : undefined,
      sequence47Trace: process.env.TRACE_47 === "1" ? sequence47Trace : undefined,
      atBitsWriteTrace: process.env.TRACE_47 === "1" ? atBitsWriteTrace : undefined,
      pseudoSelectionState: process.env.TRACE_47 === "1" ? {
        lpsee: Array.from({ length: 10 }, (_, offset) => ({
          address: octal(0o001101 + offset, 6),
          value: octal(machine.memory_word(
            0o001101 + offset,
            machine.simulated_time,
          ).value),
        })),
        psnps: Array.from({ length: 16 }, (_, offset) => ({
          address: octal(0o000740 + offset, 6),
          value: octal(machine.memory_word(
            0o000740 + offset,
            machine.simulated_time,
          ).value),
        })),
      } : undefined,
      matchingDisplayWords: process.env.TRACE_47 === "1"
        ? Array.from({ length: rightHalf(
          machine.memory_word(0o200032, machine.simulated_time).value,
        ) }, (_, offset) => ({
          address: octal(0o100000 + offset, 6),
          value: machine.memory_word(0o100000 + offset, machine.simulated_time).value,
        })).filter(({ value }) => value === machine.memory_word(
          0o200045,
          machine.simulated_time,
        ).value).map(({ address, value }) => ({ address, value: octal(value) }))
        : undefined,
      matchingDisplayTags: process.env.TRACE_47 === "1"
        ? Array.from({ length: rightHalf(
          machine.memory_word(0o200032, machine.simulated_time).value,
        ) }, (_, offset) => ({
          address: octal(0o100000 + offset, 6),
          value: BigInt(machine.memory_word(
            0o100000 + offset,
            machine.simulated_time,
          ).value),
        })).filter(({ value }) => {
          const tag = BigInt(machine.index_register(0o10) & 0o377);
          return (value & 0o377n) === tag || ((value >> 18n) & 0o377n) === tag;
        }).map(({ address, value }) => ({ address, value: octal(value) }))
        : undefined,
    }, null, 2));
    throw error;
  }
  if (fineAssemblyTrace) {
    const currentRingValue = machine.memory_word(0o025434, machine.simulated_time).value;
    if (watchedRingValue !== null
      && currentRingValue !== watchedRingValue
      && rightHalf(currentRingValue) === 0) {
      console.error("stage: ring mutation", JSON.stringify({
        before: octal(watchedRingValue),
        after: octal(currentRingValue),
        controlBefore: tracedControl,
        controlAfter: machine.control_state(),
        indexes: Array.from({ length: 16 }, (_, index) =>
          octal(machine.index_register(index) & 0o777777, 6)),
        operationTrace: ringOperationTrace,
      }, null, 2));
    }
    watchedRingValue = currentRingValue;
  }
  for (const event of events) {
    if (event?.kind === "scope_point" && event.unit === 0o60) {
      scopePoints += 1;
      observedXMin = Math.min(observedXMin, event.x);
      observedXMax = Math.max(observedXMax, event.x);
      observedYMin = Math.min(observedYMin, event.y);
      observedYMax = Math.max(observedYMax, event.y);
      const stats = phaseStats(phase);
      const physicalX = event.physical_x;
      const physicalY = event.physical_y;
      if (phase === "verify-line" && verificationScope.length < 100_000) {
        verificationScope.push({
          x: physicalX,
          y: physicalY,
          origin: event.origin,
          intensity: event.intensity,
        });
      }
      if (phase === "verify-circle" && circleVerificationScope.length < 100_000) {
        circleVerificationScope.push({
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

function leftHalf(value) {
  return Math.floor(value / 0o1000000);
}

function displayPointsForListIndex(index) {
  const displayCount = rightHalf(machine.memory_word(0o200032, machine.simulated_time).value);
  const displayName = index & 0o377;
  const displayPage = (index >> 8) & 0o377;
  const physicalCoordinate = (raw) => (raw & 0o1000 ? raw - 0o1000 : raw + 0o777);
  const points = [];
  for (let offset = 0; offset < displayCount; offset += 1) {
    const value = BigInt(machine.memory_word(0o100000 + offset, machine.simulated_time).value);
    if (Number(value & 0o377n) !== displayName
      || Number((value >> 18n) & 0o377n) !== displayPage) continue;
    points.push({
      x: physicalCoordinate(Number((value >> 26n) & 0o1777n)),
      y: physicalCoordinate(Number((value >> 8n) & 0o1777n)),
    });
  }
  return points;
}

function displayPointCandidatesForListIndex(index) {
  const points = displayPointsForListIndex(index);
  if (points.length === 0) return [];
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  const center = {
    x: Math.round((Math.min(...xs) + Math.max(...xs)) / 2),
    y: Math.round((Math.min(...ys) + Math.max(...ys)) / 2),
  };
  const byDistance = [...points].sort((first, second) =>
    Math.hypot(first.x - center.x, first.y - center.y)
      - Math.hypot(second.x - center.x, second.y - center.y));
  return [center, ...byDistance].filter((point, position, candidates) =>
    candidates.findIndex((candidate) => candidate.x === point.x && candidate.y === point.y)
      === position);
}

function perpendicularPictureState() {
  const word = (address) => machine.memory_word(address, machine.simulated_time).value;
  const listTop = rightHalf(word(0o024000));
  const findType = (type) => {
    const matches = [];
    for (let index = 1; index < listTop; index += 1) {
      if (rightHalf(word(0o024000 + index)) === type) matches.push(index);
    }
    return matches;
  };
  const constraintIndexes = findType(0o1141);
  const pictureIndexes = new Set();
  for (const constraintIndex of constraintIndexes) {
    pictureIndexes.add(rightHalf(word(0o024000 + constraintIndex + 0o4)));
  }
  const block = (index, length) => Array.from({ length }, (_, offset) => ({
    address: octal(0o024000 + index + offset, 6),
    offset: octal(offset, 2),
    value: octal(word(0o024000 + index + offset)),
  }));
  const failureIndex = machine.index_register(0o10);
  const inboundLinks = [];
  for (let index = 1; index < listTop; index += 1) {
    const value = word(0o024000 + index);
    if (leftHalf(value) === failureIndex || rightHalf(value) === failureIndex) {
      inboundLinks.push({
        address: octal(0o024000 + index, 6),
        index: octal(index, 6),
        value: octal(value),
      });
    }
  }
  return {
    listTop: octal(listTop, 6),
    listHeaders: block(0o110, 0o24),
    constraintBlocks: constraintIndexes.map((index) => ({
      index: octal(index, 6),
      words: block(index, 0o10),
    })),
    pictureBlocks: [...pictureIndexes].map((index) => ({
      index: octal(index, 6),
      words: block(index, 0o12),
    })),
    nearbyFailureWords: block(0o1220, 0o40),
    failureIndex: octal(failureIndex, 6),
    inboundLinks,
  };
}

function lineGeometryAt(lineAddress) {
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

function lineGeometry(linePointerWord) {
  return lineGeometryAt(0o024000 + rightHalf(linePointerWord));
}

function allocatedLineAddress(firstOffset, lastOffset) {
  for (let offset = firstOffset; offset < lastOffset; offset += 1) {
    const address = 0o024000 + offset;
    if (rightHalf(machine.memory_word(address, machine.simulated_time).value) !== 0o201) {
      continue;
    }
    const pointOffsets = [0o10, 0o12].map((fieldOffset) => rightHalf(
      machine.memory_word(address + fieldOffset, machine.simulated_time).value,
    ));
    if (pointOffsets.some(
      (pointOffset) => pointOffset < firstOffset || pointOffset >= lastOffset,
    )) {
      continue;
    }
    const pointTypes = pointOffsets.map((pointOffset) => rightHalf(
      machine.memory_word(0o024000 + pointOffset, machine.simulated_time).value,
    ));
    if (pointTypes.every((pointType) => pointType === 0o275)) return address;
  }
  throw new Error("the draw command did not allocate a line record");
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

function inCommandDispatcher() {
  const state = machine.control_state();
  return state.sequence === 0o76
    && state.instruction_address >= 0o004135
    && state.instruction_address < 0o004700;
}

function afterStopMovingCommand() {
  const state = machine.control_state();
  return state.sequence === 0o76
    && state.instruction_address >= 0o004161
    && state.instruction_address <= 0o004300;
}

function afterStartDrawCommand() {
  const state = machine.control_state();
  return state.sequence === 0o76 && state.instruction_address === 0o004163;
}

function afterMovePointCommand() {
  const state = machine.control_state();
  return state.sequence === 0o76
    && state.instruction_address >= 0o004171
    && state.instruction_address <= 0o004300;
}

function inStopMovingEntry() {
  const state = machine.control_state();
  return state.sequence === 0o76
    && state.instruction_address >= 0o006040
    && state.instruction_address <= 0o006130;
}

function stopMovingAndWaitForReturn(message, timeoutSeconds = 300) {
  stopMovingCallCount += 1;
  const trace = [];
  setCommand(1, 6, false);
  assert.ok(runUntil(
    () => machine.memory_word(0o011426, machine.simulated_time).value === 0,
    40,
    1,
  ), `${message}: sequence 47 must record the prior Q1.6 release`);
  setCommand(1, 6, true);
  const enteredStopMoving = runUntil(inStopMovingEntry, 40, 1);
  if (!enteredStopMoving) {
    console.error(JSON.stringify({
      failure: "Q1.6 did not enter STOPMOVEP",
      message,
      stopMovingCallCount,
      control: machine.control_state(),
      externalInput: octal(machine.memory_word(0o377621, machine.simulated_time).value),
      switch1: octal(machine.memory_word(0o011425, machine.simulated_time).value),
      switch2: octal(machine.memory_word(0o011426, machine.simulated_time).value),
      queue: Array.from({ length: 0o22 }, (_, offset) =>
        octal(machine.memory_word(0o004127 + offset, machine.simulated_time).value)),
      atBits: octal(machine.memory_word(0o200044, machine.simulated_time).value),
      selections: Array.from({ length: 8 }, (_, offset) =>
        octal(machine.memory_word(0o200045 + offset, machine.simulated_time).value)),
    }, null, 2));
  }
  assert.ok(enteredStopMoving, `${message}: Q1.6 must enter STOPMOVEP`);
  setCommand(1, 6, false);
  const returnDeadline = machine.simulated_time + timeoutSeconds;
  while (!afterStopMovingCommand() && machine.simulated_time < returnDeadline) {
    const state = machine.control_state();
    if (message === "coincident flange corner"
      && state.instruction_address >= 0o006040
      && state.instruction_address <= 0o006130) {
      trace.push({
        state,
        atBits: octal(machine.memory_word(0o200044, machine.simulated_time).value),
        selections: Array.from({ length: 4 }, (_, offset) =>
          octal(machine.memory_word(0o200045 + offset, machine.simulated_time).value)),
        indexes: [0o1, 0o2, 0o3, 0o7, 0o10].map((index) =>
          octal(machine.index_register(index) & 0o777777, 6)),
      });
    }
    stepBatch(1);
  }
  assert.ok(afterStopMovingCommand(),
    `${message}: STOPMOVEP must return to the command dispatcher`);
  runUntil(
    () => octal(machine.memory_word(0o024114, machine.simulated_time).value)
      === "000114000114",
    20,
    1,
  );
  if (octal(machine.memory_word(0o024114, machine.simulated_time).value)
    !== "000114000114") {
    console.error(JSON.stringify({
      failure: "moving list did not clear",
      message,
      movingHead: octal(machine.memory_word(0o024114, machine.simulated_time).value),
      atBits: octal(machine.memory_word(0o200044, machine.simulated_time).value),
      selections: Array.from({ length: 8 }, (_, offset) =>
        octal(machine.memory_word(0o200045 + offset, machine.simulated_time).value)),
      movingWords: Array.from({ length: 0o30 }, (_, offset) => ({
        address: octal(0o025440 + offset, 6),
        value: octal(machine.memory_word(0o025440 + offset, machine.simulated_time).value),
      })),
    }, null, 2));
  }
  assert.ok(runUntil(
    () => machine.memory_word(0o011426, machine.simulated_time).value === 0,
    40,
    1,
  ), `${message}: sequence 47 must observe the Q1.6 release`);
  return trace;
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
    if (state.sequence === 0o76
      && state.instruction_address >= 0o205643
      && state.instruction_address <= 0o205662) {
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
    if (entered
      && state.sequence === 0o76
      && state.instruction_address >= 0o205277
      && state.instruction_address < 0o205643) {
      completed = true;
    }
    machine.step(machine.simulated_time);
    assert.equal(machine.alarm_active, false, machine.last_alarm);
  }
  return { entered, completed, trace };
}

runUntilTime(200);
if (activatePenAfterBoot) {
  const detectionsBeforeActivation = Number(machine.light_pen_detection_count);
  machine.set_light_pen(575 / 1022, 1 - 575 / 1022, 26 / 1022, true);
  assert.ok(
    runUntil(
      () => Number(machine.light_pen_detection_count) > detectionsBeforeActivation
        && (
          machine.memory_word(0o200042, machine.simulated_time).value !== 0
          || machine.memory_word(0o200043, machine.simulated_time).value !== 0
        )
        && !machine.memory_word(0o200042, machine.simulated_time).meta,
      200,
    ),
    "the first live pen activation must produce a real optical detection",
  );
}
assert.ok(
  runUntil(() => !machine.memory_word(0o200042, machine.simulated_time).meta, 200),
  "the original tracker must acquire the initial stationary pen",
);
let precreatedPerpendicularConstraint = null;
function createPerpendicularConstraint(startPoint = { x: 575, y: 575 }, recenter = true) {
  phase = "stage-perpendicular-constraint";
  assert.equal(constraintCode, 0o37,
    "PERPENDICULAR_ONLY requires CONSTRAINT_CODE=37");
  for (let step = 1; step <= 120; step += 1) {
    const x = startPoint.x
      + (perpendicularStagingPoint.x - startPoint.x) * step / 120;
    const y = startPoint.y
      + (perpendicularStagingPoint.y - startPoint.y) * step / 120;
    const detectionsBeforeStep = Number(machine.light_pen_detection_count);
    machine.set_light_pen(x / 1022, 1 - y / 1022, 26 / 1022, true);
    assert.ok(
      runUntil(() => Number(machine.light_pen_detection_count) > detectionsBeforeStep, 2, 1),
      "the tracker must reach the clear constraint staging point",
    );
    runUntilTime(machine.simulated_time + 0.02);
  }
  assert.ok(
    runUntil(
      () => !machine.memory_word(0o200042, machine.simulated_time).meta
        && machine.memory_word(0o200044, machine.simulated_time).value === 0,
      100,
      1,
    ),
    "the constraint staging point must be tracked with no selected drawing object",
  );
  const constraintListBefore = rightHalf(
    machine.memory_word(0o024000, machine.simulated_time).value,
  );
  setCommand(2, 8, true);
  phase = "create-perpendicular-constraint";
  let enteredMakeConstraint = false;
  const constraintDeadline = machine.simulated_time + 40;
  while (
    rightHalf(machine.memory_word(0o024000, machine.simulated_time).value)
      < constraintListBefore + 0o112
    && machine.simulated_time < constraintDeadline
  ) {
    const state = machine.control_state();
    if (state.instruction_address === 0o004745) {
      enteredMakeConstraint = true;
    }
    stepBatch(1);
  }
  assert.equal(enteredMakeConstraint, true, "Q2.8 must enter the original MAKECONS routine");
  assert.ok(
    rightHalf(machine.memory_word(0o024000, machine.simulated_time).value)
      >= constraintListBefore + 0o112,
    "Q2.8 must allocate one P constraint and four typical variables",
  );
  setCommand(2, 8, false);
  runUntilTime(machine.simulated_time + 5);

  const constraintAddress = 0o024000 + Number(constraintListBefore);
  const dummyAddresses = [0o10, 0o12, 0o14, 0o16].map((offset) =>
    0o024000 + rightHalf(machine.memory_word(
      constraintAddress + offset,
      machine.simulated_time,
    ).value));
  assert.equal(rightHalf(machine.memory_word(constraintAddress, machine.simulated_time).value), 0o1141,
    "Q2.8 must select the original CN10 P-constraint master");
  machine.set_toggle_register(0o25, 0o500, 0o400, 0, constraintCode, false);
  const movingDisplayTrace = {
    typicalEntered: 0,
    typicalDrawn: 0,
    constraintEntered: 0,
    constraintDrawn: 0,
    maximumDisplayCount: 0,
  };
  const movingDisplayDeadline = machine.simulated_time + 5;
  while (machine.simulated_time < movingDisplayDeadline) {
    const address = machine.control_state().instruction_address;
    if (address === 0o206056) movingDisplayTrace.typicalEntered += 1;
    if (address === 0o206061) movingDisplayTrace.typicalDrawn += 1;
    if (address === 0o206125) movingDisplayTrace.constraintEntered += 1;
    if (address === 0o206130) movingDisplayTrace.constraintDrawn += 1;
    movingDisplayTrace.maximumDisplayCount = Math.max(
      movingDisplayTrace.maximumDisplayCount,
      rightHalf(machine.memory_word(0o200031, machine.simulated_time).value),
    );
    stepBatch(1);
  }
  if (!recenter) {
    for (let step = 1; step <= 56; step += 1) {
      const coordinate = perpendicularStagingPoint.x + step;
      const detectionsBeforeStep = Number(machine.light_pen_detection_count);
      machine.set_light_pen(
        coordinate / 1022,
        1 - coordinate / 1022,
        26 / 1022,
        true,
      );
      assert.ok(runUntil(
        () => Number(machine.light_pen_detection_count) > detectionsBeforeStep,
        2,
        1,
      ), "the tracker must move the new P constraint to the screen center");
    }
  }
  phase = "stop-perpendicular-constraint";
  stopMovingAndWaitForReturn("new P constraint");
  if (process.env.SKIP_CONSTRAINT_RECENTER !== "1") {
    const displayCountBeforeRebuild = machine.memory_word(
      0o200032,
      machine.simulated_time,
    ).value;
    setCommand(1, 1, true);
    assert.ok(
      runUntil(() => machine.control_state().instruction_address === 0o005056, 20, 1),
      "Q1.1 must enter the original MOVEPIC routine",
    );
    setCommand(1, 1, false);
    assert.ok(runUntil(
      () => machine.memory_word(0o200032, machine.simulated_time).value
        !== displayCountBeforeRebuild,
      100,
      1,
    ), "Q1.1 must publish a rebuilt display file");
    assert.ok(runUntil(
      () => machine.memory_word(0o200032, machine.simulated_time).value
        === machine.memory_word(0o200031, machine.simulated_time).value,
      100,
      1,
    ), "Q1.1 must finish the original display-file swap");
  }
  phase = "expose-perpendicular-handles";
  const dummyIndexes = dummyAddresses.map((address) => address - 0o024000);
  if (process.env.DEBUG_STAGES === "1") {
    const dummyDisplayNames = new Set(dummyIndexes.map((index) => index & 0o377));
    const displayCount = rightHalf(machine.memory_word(0o200032, machine.simulated_time).value);
    const physicalCoordinate = (raw) => (raw & 0o1000 ? raw - 0o1000 : raw + 0o777);
    const dummyDisplayEntries = [];
    for (let offset = 0; offset < displayCount; offset += 1) {
      const value = BigInt(machine.memory_word(0o100000 + offset, machine.simulated_time).value);
      const firstName = Number((value >> 18n) & 0o377n);
      const secondName = Number(value & 0o377n);
      if (dummyDisplayNames.has(firstName) || dummyDisplayNames.has(secondName)) {
        const rawX = Number((value >> 26n) & 0o1777n);
        const rawY = Number((value >> 8n) & 0o1777n);
        dummyDisplayEntries.push({
          address: octal(0o100000 + offset, 6),
          value: octal(value),
          x: physicalCoordinate(rawX),
          y: physicalCoordinate(rawY),
          firstName: octal(firstName, 3),
          secondName: octal(secondName, 3),
        });
      }
    }
    console.error("stage: P-variable display entries", dummyDisplayEntries.slice(0, 80));
  }
  const penStatusBeforeScan = machine.unit_status(0o55, machine.simulated_time);
  let typicalVariableHit = null;
  const scanHits = [];
  for (const dummyIndex of dummyIndexes) {
    for (const { x, y } of displayPointCandidatesForListIndex(dummyIndex)) {
      const detectionsBeforeScanPoint = Number(machine.light_pen_detection_count);
      machine.set_light_pen(x / 1022, 1 - y / 1022, 8 / 1022, true);
      runUntilTime(machine.simulated_time + 0.15);
      const selectedWords = Array.from({ length: 8 }, (_, offset) =>
        machine.memory_word(0o200045 + offset, machine.simulated_time).value);
      if (Number(machine.light_pen_detection_count) > detectionsBeforeScanPoint) {
        scanHits.push({
          x,
          y,
          selections: selectedWords.map((word) => octal(word)),
        });
      }
      const selectedWord = machine.memory_word(0o200044, machine.simulated_time).value === 0
        ? undefined
        : selectedWords.find((word) =>
          leftHalf(word) === 0o321 && dummyIndexes.includes(rightHalf(word)));
      if (selectedWord !== undefined) {
        typicalVariableHit = {
          x,
          y,
          index: rightHalf(selectedWord),
          switch: "Q3.9",
        };
        break;
      }
    }
    if (typicalVariableHit !== null) break;
  }
  const typicalVariableSelected = typicalVariableHit !== null;
  if (!typicalVariableSelected) {
    const dummyDisplayNames = new Set(dummyIndexes.map((index) => index & 0o377));
    const displayCount = rightHalf(machine.memory_word(0o200032, machine.simulated_time).value);
    const dummyDisplayEntries = [];
    const nearbyDisplayEntries = [];
    const sampleDisplayEntries = [];
    const physicalCoordinate = (raw) => (raw & 0o1000 ? raw - 0o1000 : raw + 0o777);
    for (let offset = 0; offset < displayCount; offset += 1) {
      const value = BigInt(machine.memory_word(0o100000 + offset, machine.simulated_time).value);
      const firstName = Number((value >> 18n) & 0o377n);
      const secondName = Number(value & 0o377n);
      const rawX = Number((value >> 26n) & 0o1777n);
      const rawY = Number((value >> 8n) & 0o1777n);
      const x = physicalCoordinate(rawX);
      const y = physicalCoordinate(rawY);
      if (sampleDisplayEntries.length < 40 && value !== 0n) {
        sampleDisplayEntries.push({
          address: octal(0o100000 + offset, 6),
          value: octal(value),
          x,
          y,
          firstName: octal(firstName, 3),
          secondName: octal(secondName, 3),
        });
      }
      if ((Math.abs(x - 464) <= 24 && Math.abs(y - 464) <= 24)
        || (Math.abs(x - 575) <= 24 && Math.abs(y - 575) <= 24)) {
        nearbyDisplayEntries.push({
          address: octal(0o100000 + offset, 6),
          value: octal(value),
          x,
          y,
          firstName: octal(firstName, 3),
          secondName: octal(secondName, 3),
        });
      }
      if (firstName === 0o321 || secondName === 0o321
        || dummyDisplayNames.has(firstName) || dummyDisplayNames.has(secondName)) {
        dummyDisplayEntries.push({
          address: octal(0o100000 + offset, 6),
          value: octal(value),
          firstName: octal(firstName, 3),
          secondName: octal(secondName, 3),
          rawX: octal(Number((value >> 26n) & 0o1777n), 4),
          rawY: octal(Number((value >> 8n) & 0o1777n), 4),
        });
      }
    }
    console.error(JSON.stringify({
      failure: "typical variable selection",
      pen: [0o200042, 0o200043].map((address) =>
        octal(machine.memory_word(address, machine.simulated_time).value)),
      dummyCoordinates: dummyAddresses.map((address) => ({
        address: octal(address, 6),
        xy: [0o14, 0o15].map((offset) =>
          octal(machine.memory_word(address + offset, machine.simulated_time).value)),
      })),
      atBits: octal(machine.memory_word(0o200044, machine.simulated_time).value),
      selections: Array.from({ length: 8 }, (_, offset) =>
        octal(machine.memory_word(0o200045 + offset, machine.simulated_time).value)),
      penStatusBeforeScan,
      raisedFlags: raisedFlags(),
      displayCount: octal(displayCount),
      dummyDisplayEntries: dummyDisplayEntries.slice(0, 80),
      nearbyDisplayEntries: nearbyDisplayEntries.slice(0, 120),
      sampleDisplayEntries,
      scanHits: scanHits.slice(0, 30),
      typicalDisplayWords: Object.fromEntries([
        0o207430, 0o207431, 0o200022, 0o200023, 0o200024, 0o200025,
        0o200030, 0o200031, 0o200033, 0o200034,
      ].map((address) => [
        octal(address, 6),
        octal(machine.memory_word(address, machine.simulated_time).value),
      ])),
    }, null, 2));
  }
  assert.ok(typicalVariableSelected,
    "the moving constraint must expose a selectable typical variable");
  const publishedTypicalVariable = runUntil(() => {
    const selectedWord = machine.memory_word(0o200045, machine.simulated_time).value;
    return machine.memory_word(0o200044, machine.simulated_time).value !== 0
      && leftHalf(selectedWord) === 0o321
      && dummyIndexes.includes(rightHalf(selectedWord));
  }, 100, 1);
  if (!publishedTypicalVariable) {
    console.error(JSON.stringify({
      failure: "PSEUDO typical-variable publication",
      hit: typicalVariableHit,
      atBits: octal(machine.memory_word(0o200044, machine.simulated_time).value),
      penloc: [0o001712, 0o001713].map((address) =>
        octal(machine.memory_word(address, machine.simulated_time).value)),
      pspl: [0o200042, 0o200043].map((address) =>
        octal(machine.memory_word(address, machine.simulated_time).value)),
      dummyCoordinates: dummyAddresses.map((address) => [0o14, 0o15].map((offset) =>
        octal(machine.memory_word(address + offset, machine.simulated_time).value))),
      selections: Array.from({ length: 8 }, (_, offset) =>
        octal(machine.memory_word(0o200045 + offset, machine.simulated_time).value)),
      transform: [0o200034, 0o200035, 0o200036].map((address) =>
        octal(machine.memory_word(address, machine.simulated_time).value)),
    }, null, 2));
  }
  assert.ok(publishedTypicalVariable, "PSEUDO must publish the selected P variable to ATBITS");

  precreatedPerpendicularConstraint = {
    constraintAddress,
    dummyAddresses,
    typicalVariableHit,
    stagedCoordinates: dummyAddresses.map((address) => [
      machine.memory_word(address + 0o14, machine.simulated_time).value,
      machine.memory_word(address + 0o15, machine.simulated_time).value,
    ]),
    transform: [0o200034, 0o200035, 0o200036].map((address) =>
      machine.memory_word(address, machine.simulated_time).value),
  };
  if (process.env.DEBUG_STAGES === "1") {
    console.error("stage: constraint ring", {
      picture: octal(machine.memory_word(0o025170, machine.simulated_time).value),
      dummies: dummyAddresses.map((address) => ({
        address: octal(address + 0o5, 6),
        link: octal(machine.memory_word(address + 0o5, machine.simulated_time).value),
      })),
    });
  }
}
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
  try {
    stepBatch(1);
  } catch (error) {
    console.error(JSON.stringify({
      failure: "draw alarm",
      before: state,
      after: machine.control_state(),
      indexes: Object.fromEntries(Array.from({ length: 16 }, (_, index) => [
        octal(index, 2),
        machine.index_register(index),
      ])),
      atBits: octal(machine.memory_word(0o200044, machine.simulated_time).value),
      selections: Array.from({ length: 8 }, (_, offset) =>
        octal(machine.memory_word(0o200045 + offset, machine.simulated_time).value)),
      listEnd: octal(machine.memory_word(0o024000, machine.simulated_time).value),
    }, null, 2));
    throw error;
  }
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
const drawnLineAddress = allocatedLineAddress(listBefore, listAfter);
const detectionsAfterDraw = Number(machine.light_pen_detection_count);
const memoryAfterDraw = snapshot();
const trackerAfterDraw = trackerWords();
const penLostAfterDraw = machine.memory_word(0o200042, machine.simulated_time).meta;
const movingHeadAfterDraw = octal(machine.memory_word(0o024114, machine.simulated_time).value);
const buttonsAfterDraw = Object.fromEntries([
  0o004127,
  0o011405,
  0o011406,
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
const movementPath = process.env.MOVEMENT_PATH
  ?? (process.env.CROSS_SCOPE_AXES === "1" ? "axis-cross" : "diagonal");
const movementProfiles = {
  diagonal: { steps: 160, x: 735, y: 735 },
  horizontal: { steps: 160, x: 735, y: 575 },
  vertical: { steps: 160, x: 575, y: 735 },
  "vertical-down": { steps: 160, x: 575, y: 415 },
  "axis-cross": { steps: 270, x: 440, y: 440 },
  sweep: {
    steps: 520,
    position(step) {
      if (step <= 160) return { x: 575 + step, y: 575 };
      const angle = 2 * Math.PI * (step - 160) / 360;
      return {
        x: 575 + 160 * Math.cos(angle),
        y: 575 + 160 * Math.sin(angle),
      };
    },
  },
  jump: { steps: 1, x: 735, y: 575 },
};
const movementProfile = movementProfiles[movementPath];
assert.ok(movementProfile, `unknown MOVEMENT_PATH ${movementPath}`);
const movementSteps = movementProfile.steps;
const movementDurationMilliseconds = process.env.MOVEMENT_DURATION_MS === undefined
  ? null
  : Number(process.env.MOVEMENT_DURATION_MS);
assert.ok(movementDurationMilliseconds === null
  || Number.isFinite(movementDurationMilliseconds) && movementDurationMilliseconds > 0,
"MOVEMENT_DURATION_MS must be a positive number");
const positionAt = (step) => movementProfile.position?.(step) ?? {
  x: 575 + (movementProfile.x - 575) * step / movementSteps,
  y: 575 + (movementProfile.y - 575) * step / movementSteps,
};
const finalPosition = positionAt(movementSteps);
const finalPhysicalX = finalPosition.x;
const finalPhysicalY = finalPosition.y;
const finalX = finalPhysicalX / 1022;
const finalY = 1 - finalPhysicalY / 1022;
const movement = [];
const trackerDebug = [];
const movementStartedAt = machine.simulated_time;
for (let step = 1; step <= movementSteps; step += 1) {
  phase = `move-${step}`;
  const target = positionAt(step);
  const detectionsBeforeStep = Number(machine.light_pen_detection_count);
  const movementScope = {
    points: 0,
    x: [Infinity, -Infinity],
    y: [Infinity, -Infinity],
    origins: {},
  };
  const recordMovementScope = (event) => {
    if (event?.kind !== "scope_point" || event.unit !== 0o60) return;
    movementScope.points += 1;
    movementScope.x = [
      Math.min(movementScope.x[0], event.physical_x),
      Math.max(movementScope.x[1], event.physical_x),
    ];
    movementScope.y = [
      Math.min(movementScope.y[0], event.physical_y),
      Math.max(movementScope.y[1], event.physical_y),
    ];
    movementScope.origins[event.origin] = (movementScope.origins[event.origin] ?? 0) + 1;
  };
  machine.set_light_pen(
    target.x / 1022,
    1 - target.y / 1022,
    26 / 1022,
    true,
  );
  let detected;
  if (movementDurationMilliseconds !== null) {
    const deadline = movementStartedAt
      + movementDurationMilliseconds / 1000 * step / movementSteps;
    while (machine.simulated_time < deadline) {
      recordMovementScope(machine.step(machine.simulated_time));
      assert.equal(machine.alarm_active, false, machine.last_alarm);
    }
    detected = Number(machine.light_pen_detection_count) > detectionsBeforeStep;
  } else {
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
        recordMovementScope(event);
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
        recordMovementScope(machine.step(machine.simulated_time));
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
    target,
    detected,
    detections: Number(machine.light_pen_detection_count),
    pspl: [
      octal(machine.memory_word(0o200042, machine.simulated_time).value),
      octal(machine.memory_word(0o200043, machine.simulated_time).value),
    ],
    penLost: machine.memory_word(0o200042, machine.simulated_time).meta,
    movingHead: octal(machine.memory_word(0o024114, machine.simulated_time).value),
    movingGeometry: geometryForReport(lineGeometryAt(drawnLineAddress)),
    ndisp: octal(machine.memory_word(0o200031, machine.simulated_time).value),
    sndisp: octal(machine.memory_word(0o200032, machine.simulated_time).value),
    basicFile: octal(machine.memory_word(0o200033, machine.simulated_time).value),
    scope: movementScope.points > 0 ? movementScope : null,
  });
}
const penLostAfterMovement = machine.memory_word(0o200042, machine.simulated_time).meta;
if (movementPath === "diagonal" && movementDurationMilliseconds === null) {
  const lowerBound = Math.min(575, finalPhysicalX, finalPhysicalY) - 15;
  const settledScopes = movement.slice(39).map(({ scope }) => scope).filter(Boolean);
  assert.ok(settledScopes.length > 0, "the diagonal move must emit scope points");
  assert.equal(
    settledScopes.every(({ x, y }) => x[0] >= lowerBound && y[0] >= lowerBound),
    true,
    "the diagonal line must not emit a reflected horizontal or vertical segment",
  );
}
if (
  ["horizontal", "vertical", "vertical-down"].includes(movementPath)
  && movementDurationMilliseconds === null
  && !perpendicularMode
) {
  const finalScope = movement.at(-1)?.scope;
  const lowerX = Math.min(575, finalPhysicalX) - 40;
  const upperX = Math.max(575, finalPhysicalX) + 40;
  const lowerY = Math.min(575, finalPhysicalY) - 40;
  const upperY = Math.max(575, finalPhysicalY) + 40;
  assert.ok(finalScope, "the axis-aligned move must emit scope points");
  assert.ok(
    finalScope.x[0] >= lowerX
      && finalScope.x[1] <= upperX
      && finalScope.y[0] >= lowerY
      && finalScope.y[1] <= upperY,
    `the axis-aligned line must not emit a reflected segment: ${JSON.stringify(finalScope)}`,
  );
}
if (movementPath === "sweep" && movementDurationMilliseconds === null) {
  assert.equal(
    movement.slice(160).every(({ sndisp }) => sndisp !== "000000000000"),
    true,
    "the moving line display file must survive the lower-left sweep",
  );
}
if (process.env.EXPECT_TRACK_LOSS !== undefined) {
  assert.equal(
    penLostAfterMovement,
    process.env.EXPECT_TRACK_LOSS === "1",
    "the timed path must have the expected assembly LPLOST state",
  );
}

const lineBeforeStop = geometryForReport(lineGeometryAt(drawnLineAddress));
const stopWithButton = process.env.STOP_WITH_BUTTON === "1";
if (stopWithButton) {
  machine.set_external_input_register(0, 0, 0, 0o40, false);
} else {
  machine.set_light_pen(finalX, finalY, 26 / 1022, false);
}
const stopTrace = [];
const normalizationTrace = [];
let enteredStopMoving = false;
const stopDeadline = machine.simulated_time + 200;
while (
  octal(machine.memory_word(0o024114, machine.simulated_time).value) !== "000114000114"
  && machine.simulated_time < stopDeadline
) {
  const state = machine.control_state();
  enteredStopMoving ||= state.sequence === 0o76 && (
    state.instruction_address === 0o006040 || state.instruction_address === 0o006041
  );
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
if (stopWithButton) machine.set_external_input_register(0, 0, 0, 0, false);
const stopCompleted = octal(machine.memory_word(0o024114, machine.simulated_time).value) === "000114000114";
const penLostAfterStop = machine.memory_word(0o200042, machine.simulated_time).meta;
const displayBuildTrace = traceNextDisplayBuild();
phase = "verify-line";
runUntilTime(machine.simulated_time + 1);

const verificationX = verificationScope.map(({ x }) => x);
const verificationY = verificationScope.map(({ y }) => y);
const verificationWidth = Math.max(...verificationX) - Math.min(...verificationX);
const verificationHeight = Math.max(...verificationY) - Math.min(...verificationY);

if (movementPath === "horizontal" && movementDurationMilliseconds === null) {
  assert.ok(verificationWidth >= 120, "the horizontal line must retain its length");
  if (!perpendicularMode) {
    assert.ok(verificationHeight <= 40,
      "the horizontal line and tracker must remain in their narrow vertical band");
  }
}
if (movementPath.startsWith("vertical") && movementDurationMilliseconds === null) {
  assert.ok(verificationHeight >= 120, "the vertical line must retain its length");
  assert.ok(verificationWidth <= 40,
    "the vertical line and tracker must remain in their narrow horizontal band");
}
if (movementPath === "jump") {
  assert.equal(movement.some(({ detected }) => !detected), true,
    "a jump beyond the tracker search pattern must miss the optical pen");
  assert.equal(penLostAfterStop, true,
    "the original assembly must record LPLOST after a missed jump");
}

if (movementPath !== "jump" && movementDurationMilliseconds === null) {
  assert.equal(
    movement.every(({ detected }) => detected),
    true,
    `the original tracker must keep detecting the pen on the ${movementPath} path`,
  );
  assert.equal(stopCompleted, true, `STOPMOVEP must finish the ${movementPath} line`);
}
if (stopWithButton) {
  if (!enteredStopMoving) {
    console.error(JSON.stringify({
      stopCompleted,
      penLostAfterStop,
      control: machine.control_state(),
    }, null, 2));
  }
  assert.equal(penLostAfterStop, false,
    "the Q1.6 regression must not complete through the lost-pen fallback");
  assert.equal(enteredStopMoving, true,
    "Q1.6 must enter the original STOPMOVEP routine while the light pen remains active");
  assert.equal(stopCompleted, true,
    "the original STOPMOVEP routine must complete the line after the D-release input");
}

if (process.env.TRACK_ONLY === "1") {
  if (process.env.SUMMARY_ONLY === "1") {
    const verificationByOrigin = {};
    for (const point of verificationScope) {
      const stats = verificationByOrigin[point.origin] ??= {
        points: 0,
        x: [Infinity, -Infinity],
        y: [Infinity, -Infinity],
      };
      stats.points += 1;
      stats.x = [Math.min(stats.x[0], point.x), Math.max(stats.x[1], point.x)];
      stats.y = [Math.min(stats.y[0], point.y), Math.max(stats.y[1], point.y)];
    }
    console.log(JSON.stringify({
      movementPath,
      movementDurationMilliseconds,
      penLostAfterDraw,
      penLostAfterMovement,
      reacquired,
      predictionBeforeReacquire: octal(predictionBeforeReacquire),
      currentPrediction: octal(machine.memory_word(0o003574, machine.simulated_time).value),
      drawScope: phaseScope.get("draw") ?? null,
      movement: {
        steps: movement.length,
        allDetected: movement.every(({ detected }) => detected),
        firstMissedStep: movement.find(({ detected }) => !detected)?.step ?? null,
        lostSteps: movement.filter(({ penLost }) => penLost).map(({ step }) => step),
        firstScope: movement[0]?.scope ?? null,
        lastScope: movement.at(-1)?.scope ?? null,
      },
      lineBeforeStop,
      stopCompleted,
      enteredStopMoving,
      penLostAfterStop,
      line: geometryForReport(lineGeometryAt(drawnLineAddress)),
      verificationByOrigin,
    }));
    process.exit(0);
  }
  console.log(JSON.stringify({
    movementPath,
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
    lineBeforeStop,
    stopCompleted,
    enteredStopMoving,
    penLostAfterStop,
    line: geometryForReport(lineGeometryAt(drawnLineAddress)),
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

if (polylineMode) {
  assert.equal(movementPath, "horizontal", "POLYLINE_ONLY starts with the horizontal line profile");
  assert.equal(stopCompleted, true,
    "the first line must stop before the next polyline action");

  const flangePoints = perpendicularFlangeMode
    ? [
      { x: 575, y: 575 },
      { x: 735, y: 575 },
      { x: 742, y: 680 },
      { x: 650, y: 668 },
      { x: 662, y: 782 },
      { x: 570, y: 785 },
      { x: 575, y: 575 },
    ]
    : [
      { x: 575, y: 575 },
      { x: 735, y: 575 },
      { x: 735, y: 675 },
      { x: 655, y: 675 },
      { x: 655, y: 775 },
      { x: 575, y: 775 },
      { x: 575, y: 575 },
    ];
  const shapePoints = perpendicularFlangeMode
    ? flangePoints
    : (perpendicularMode ? flangePoints.slice(0, 3) : flangePoints);
  const lineAddresses = [drawnLineAddress];
  const segmentReports = [];

  function newlyAllocatedLineAddress(firstOffset, lastOffset) {
    for (let offset = firstOffset; offset < lastOffset; offset += 1) {
      const address = 0o024000 + offset;
      if (rightHalf(machine.memory_word(address, machine.simulated_time).value) === 0o201) {
        return address;
      }
    }
    throw new Error("the connected draw command did not allocate a line record");
  }

  function drawConnectedSegment(start, end, mergeTargetAddress = null) {
    if (process.env.DEBUG_STAGES === "1") console.error("stage: draw segment", start, end);
    const sharedStartAddress = lineGeometryAt(lineAddresses.at(-1)).secondAddress;
    const sharedStartIndex = sharedStartAddress - 0o024000;
    const primarySelectionIsSharedStart = () =>
      machine.memory_word(0o200044, machine.simulated_time).value !== 0
      && rightHalf(machine.memory_word(0o200045, machine.simulated_time).value)
        === sharedStartIndex;
    const pointOffsets = [0, 9, -9, 18, -18, 27, -27, 36, -36, 45, -45];
    const pointPickupRadius = 26;
    const movementPickupRadius = 26;
    let movementStart = null;
    const startCandidates = pointOffsets.flatMap((yOffset) => pointOffsets.map((xOffset) => ({
        x: start.x + xOffset,
        y: start.y + yOffset,
      })));
    for (const candidate of startCandidates) {
        machine.set_light_pen(
          candidate.x / 1022,
          1 - candidate.y / 1022,
          pointPickupRadius / 1022,
          true,
        );
        if (runUntil(primarySelectionIsSharedStart, 1, 1)) {
          movementStart = candidate;
          break;
        }
    }
    assert.ok(movementStart,
      "the original selector must acquire the preceding endpoint before STARTDRAW");
    let movementEnd = end;
    if (mergeTargetAddress !== null) {
      const mergeTargetIndex = mergeTargetAddress - 0o024000;
      const primarySelectionIsTarget = () =>
        machine.memory_word(0o200044, machine.simulated_time).value !== 0
        && rightHalf(machine.memory_word(0o200045, machine.simulated_time).value)
          === mergeTargetIndex;
      let mappedTarget = null;
      for (const yOffset of pointOffsets) {
        for (const xOffset of pointOffsets) {
          const candidate = { x: end.x + xOffset, y: end.y + yOffset };
          machine.set_light_pen(
            candidate.x / 1022,
            1 - candidate.y / 1022,
            pointPickupRadius / 1022,
            true,
          );
          if (runUntil(primarySelectionIsTarget, 1, 1)) {
            mappedTarget = candidate;
            break;
          }
        }
        if (mappedTarget !== null) break;
      }
      assert.ok(mappedTarget,
        "the original selector must map the closing point before the last line moves");
      movementEnd = mappedTarget;
    }
    machine.set_light_pen(
      movementStart.x / 1022,
      1 - movementStart.y / 1022,
      pointPickupRadius / 1022,
      true,
    );
    const selectedSharedPoint = runUntil(
      () => !machine.memory_word(0o200042, machine.simulated_time).meta
        && machine.memory_word(0o200044, machine.simulated_time).value !== 0
        && machine.memory_word(0o200045, machine.simulated_time).value
          === 0o275000000 + sharedStartIndex,
      100,
      2_000,
    );
    if (!selectedSharedPoint) {
      console.error(JSON.stringify({
        failure: "shared point selection",
        start,
        atBits: octal(machine.memory_word(0o200044, machine.simulated_time).value),
        atObject: octal(machine.memory_word(0o200045, machine.simulated_time).value),
        pspl: [0o200042, 0o200043].map((address) =>
          octal(machine.memory_word(address, machine.simulated_time).value)),
        penLost: machine.memory_word(0o200042, machine.simulated_time).meta,
        lines: lineAddresses.map((address) => geometryForReport(lineGeometryAt(address))),
        control: machine.control_state(),
      }, null, 2));
    }
    assert.ok(selectedSharedPoint,
      `the original selector must identify the shared point at ${start.x},${start.y}`);
    assert.equal(
      machine.memory_word(0o200045, machine.simulated_time).value,
      0o275000000 + sharedStartIndex,
      "STARTDRAW must receive the preceding point as its primary selection",
    );
    const segmentListBefore = machine.memory_word(0o024000, machine.simulated_time).value;
    machine.set_external_input_register(0, 0, 0, 0o200, false);
    const startDrawTrace = [];
    const startDrawDeadline = machine.simulated_time + 20;
    while (
      machine.memory_word(0o024000, machine.simulated_time).value <= segmentListBefore
      && machine.simulated_time < startDrawDeadline
    ) {
      const state = machine.control_state();
      if (process.env.TRACE_STARTDRAW === "1"
        && ((state.instruction_address >= 0o005575 && state.instruction_address <= 0o005610)
          || (state.instruction_address >= 0o006040 && state.instruction_address <= 0o006130))) {
        startDrawTrace.push({
          state,
          atBits: octal(machine.memory_word(0o200044, machine.simulated_time).value),
          selections: Array.from({ length: 4 }, (_, offset) =>
            octal(machine.memory_word(0o200045 + offset, machine.simulated_time).value)),
          indexes: Array.from({ length: 11 }, (_, index) =>
            octal(machine.index_register(index) & 0o777777, 6)),
        });
      }
      stepBatch(1);
      assert.equal(machine.alarm_active, false, machine.last_alarm);
    }
    assert.ok(
      machine.memory_word(0o024000, machine.simulated_time).value > segmentListBefore,
      "STARTDRAW must allocate the next connected segment",
    );
    assert.ok(
      runUntil(
        () => machine.control_state().sequence === 0o76
          && machine.control_state().instruction_address === 0o005553,
        20,
        1,
      ),
      "STARTDRAW must return after it creates the next connected segment",
    );
    machine.set_external_input_register(0, 0, 0, 0, false);
    stepBatch(1);
    const segmentListAfterDraw = machine.memory_word(0o024000, machine.simulated_time).value;
    const lineAddress = newlyAllocatedLineAddress(segmentListBefore, segmentListAfterDraw);

    const distance = Math.hypot(
      movementEnd.x - movementStart.x,
      movementEnd.y - movementStart.y,
    );
    const steps = Math.max(40, Math.ceil(distance));
    for (let step = 1; step <= steps; step += 1) {
      const x = movementStart.x + (movementEnd.x - movementStart.x) * step / steps;
      const y = movementStart.y + (movementEnd.y - movementStart.y) * step / steps;
      const detectionsBeforeStep = Number(machine.light_pen_detection_count);
      machine.set_light_pen(x / 1022, 1 - y / 1022, movementPickupRadius / 1022, true);
      assert.ok(
        runUntil(
          () => Number(machine.light_pen_detection_count) > detectionsBeforeStep,
          2,
          1,
        ),
        `the original tracker must follow connected segment ${start.x},${start.y} to ${end.x},${end.y}`,
      );
      runUntilTime(machine.simulated_time + 0.02);
    }

    let mergeTargetSelected = null;
    if (mergeTargetAddress !== null) {
      const mergeTargetIndex = mergeTargetAddress - 0o024000;
      const primarySelectionIsTarget = () =>
        machine.memory_word(0o200044, machine.simulated_time).value !== 0
        && rightHalf(machine.memory_word(0o200045, machine.simulated_time).value)
          === mergeTargetIndex;
      mergeTargetSelected = runUntil(primarySelectionIsTarget, 20, 1);
    }

    machine.set_external_input_register(0, 0, 0, 0o40, false);
    const stopMergeTrace = [];
    assert.ok(
      runUntil(
        inStopMovingEntry,
        300,
        1,
      ),
      "Q1.6 must enter STOPMOVEP for the connected segment",
    );
    machine.set_external_input_register(0, 0, 0, 0, false);
    const stopDeadline = machine.simulated_time + 200;
    while (
      octal(machine.memory_word(0o024114, machine.simulated_time).value) !== "000114000114"
      && machine.simulated_time < stopDeadline
    ) {
      const state = machine.control_state();
      if (
        state.sequence === 0o76
        && state.instruction_address >= 0o006000
        && state.instruction_address <= 0o006050
        && stopMergeTrace.length < 80
      ) {
        stopMergeTrace.push({
          state,
          alpha: machine.index_register(0o01),
          beta: machine.index_register(0o02),
          atBits: octal(machine.memory_word(0o200044, machine.simulated_time).value),
          selections: Array.from({ length: 4 }, (_, offset) =>
            octal(machine.memory_word(0o200045 + offset, machine.simulated_time).value)),
        });
      }
      stepBatch(1);
      assert.equal(machine.alarm_active, false, machine.last_alarm);
    }
    assert.equal(
      octal(machine.memory_word(0o024114, machine.simulated_time).value),
      "000114000114",
      "Q1.6 must complete the connected segment",
    );
    const stopCompletionDeadline = machine.simulated_time + 300;
    let stopReturned = false;
    while (!stopReturned && machine.simulated_time < stopCompletionDeadline) {
      const state = machine.control_state();
      stopReturned = afterStopMovingCommand();
      if (stopReturned) break;
      if (
        state.sequence === 0o76
        && state.instruction_address >= 0o006000
        && state.instruction_address <= 0o006400
        && stopMergeTrace.length < 160
      ) {
        stopMergeTrace.push({
          state,
          alpha: machine.index_register(0o01),
          beta: machine.index_register(0o02),
          atBits: octal(machine.memory_word(0o200044, machine.simulated_time).value),
          selections: Array.from({ length: 4 }, (_, offset) =>
            octal(machine.memory_word(0o200045 + offset, machine.simulated_time).value)),
        });
      }
      stepBatch(1);
      assert.equal(machine.alarm_active, false, machine.last_alarm);
    }
    assert.equal(stopReturned, true,
      "STOPMOVEP must return before the next connected-segment action");
    lineAddresses.push(lineAddress);
    segmentReports.push({
      start,
      end,
      movementStart,
      mergeTarget: mergeTargetAddress === null ? null : octal(mergeTargetAddress, 6),
      mergeTargetSelected,
      mergeEntered: stopMergeTrace.some(({ state }) => state.instruction.includes("JPQ 6020")),
      geometry: geometryForReport(lineGeometryAt(lineAddress)),
      startDrawTrace,
    });
    if (process.env.DEBUG_STAGES === "1") console.error("stage: segment complete", start, end);
  }

  const closingPointAddress = lineGeometryAt(lineAddresses[0]).firstAddress;
  for (let index = 1; index < shapePoints.length - 1; index += 1) {
    const closesOutline = index === shapePoints.length - 2;
    drawConnectedSegment(
      shapePoints[index],
      shapePoints[index + 1],
      closesOutline && (!perpendicularMode || perpendicularFlangeMode)
        ? closingPointAddress
        : null,
    );
  }

  if (process.env.TRACE_STARTDRAW === "1") {
    console.error(JSON.stringify(segmentReports.map(({
      start, end, movementStart, geometry, startDrawTrace,
    }) => ({
      start,
      end,
      movementStart,
      geometry,
      startDrawTrace,
    })), null, 2));
  }

  function mergeCoincidentCorner(firstPointAddress, secondPointAddress) {
    const pointIndexes = [firstPointAddress, secondPointAddress]
      .map((address) => address - 0o024000);
    machine.set_light_pen(50 / 1022, 1 - 50 / 1022, 8 / 1022, true);
    runUntil(() => machine.memory_word(0o200044, machine.simulated_time).value === 0, 20, 1);
    let selectedPointIndex = null;
    const candidates = [
      ...displayPointCandidatesForListIndex(pointIndexes[1]),
      ...displayPointCandidatesForListIndex(pointIndexes[0]),
    ];
    for (const candidate of candidates) {
      machine.set_light_pen(
        candidate.x / 1022,
        1 - candidate.y / 1022,
        26 / 1022,
        true,
      );
      if (runUntil(() => {
        if (machine.memory_word(0o200044, machine.simulated_time).value === 0) return false;
        const selected = machine.memory_word(0o200045, machine.simulated_time).value;
        if (leftHalf(selected) !== 0o275 || !pointIndexes.includes(rightHalf(selected))) {
          return false;
        }
        selectedPointIndex = rightHalf(selected);
        return true;
      }, 5, 1)) break;
    }
    assert.notEqual(selectedPointIndex, null,
      "the original selector must acquire one coincident corner point");

    setCommand(2, 1, true);
    assert.ok(runUntil(
      () => octal(machine.memory_word(0o024114, machine.simulated_time).value)
        !== "000114000114",
      40,
      1,
    ), "Q2.1 must move one coincident corner point");
    setCommand(2, 1, false);
    const movingRecordIndex = rightHalf(
      machine.memory_word(0o024114, machine.simulated_time).value,
    );
    const movedPointIndex = pointIndexes.find((index) => index + 0o7 === movingRecordIndex);
    assert.notEqual(movedPointIndex, undefined,
      "the MOVINGS ring must identify the acquired corner point");
    selectedPointIndex = movedPointIndex;
    const targetPointIndex = pointIndexes.find((index) => index !== movedPointIndex);
    const targetRetained = runUntil(
      () => machine.memory_word(0o200044, machine.simulated_time).value !== 0
        && machine.memory_word(0o200045, machine.simulated_time).value
          === 0o275000000 + targetPointIndex,
      40,
      1,
    );
    if (!targetRetained) {
      const displayCount = rightHalf(
        machine.memory_word(0o200032, machine.simulated_time).value,
      );
      console.error(JSON.stringify({
        failure: "coincident merge target selection",
        selectedPointIndex: octal(selectedPointIndex, 6),
        targetPointIndex: octal(targetPointIndex, 6),
        atBits: octal(machine.memory_word(0o200044, machine.simulated_time).value),
        selections: Array.from({ length: 8 }, (_, offset) =>
          octal(machine.memory_word(0o200045 + offset, machine.simulated_time).value)),
        candidates,
        pointRecords: pointIndexes.map((index) => ({
          index: octal(index, 6),
          words: Array.from({ length: 0o22 }, (_, offset) =>
            octal(machine.memory_word(0o024000 + index + offset,
              machine.simulated_time).value)),
          displayCandidates: displayPointCandidatesForListIndex(index),
        })),
        matchingDisplayTags: Array.from({ length: displayCount }, (_, offset) => ({
          address: 0o100000 + offset,
          value: BigInt(machine.memory_word(0o100000 + offset,
            machine.simulated_time).value),
        })).filter(({ value }) => pointIndexes.some((index) =>
          Number(value & 0o377n) === (index & 0o377)))
          .map(({ address, value }) => ({ address: octal(address, 6), value: octal(value) })),
        lineGeometries: lineAddresses.map((address) =>
          geometryForReport(lineGeometryAt(address))),
        control: machine.control_state(),
      }, null, 2));
    }
    assert.ok(targetRetained,
      "the selector must retain the other coincident point as the merge target");
    assert.notEqual(
      octal(machine.memory_word(0o024114, machine.simulated_time).value),
      "000114000114",
      "the point must still move when the merge target is selected",
    );
    if (process.env.FINE_TRACE === "1") fineAssemblyTrace = true;
    const stopTrace = stopMovingAndWaitForReturn("coincident flange corner");
    fineAssemblyTrace = false;
    return {
      selectedPointIndex,
      targetPointIndex,
      stopTrace,
    };
  }

  const mergeCornerCount = perpendicularMode && !perpendicularFlangeMode
    ? lineAddresses.length - 1
    : lineAddresses.length;
  for (let index = 0; process.env.SKIP_CORNER_MERGE !== "1"
    && index < mergeCornerCount; index += 1) {
    const firstLine = lineGeometryAt(lineAddresses[index]);
    const secondLine = lineGeometryAt(lineAddresses[(index + 1) % lineAddresses.length]);
    if (firstLine.secondAddress !== secondLine.firstAddress) {
      const mergeAttempt = mergeCoincidentCorner(
        firstLine.secondAddress,
        secondLine.firstAddress,
      );
      const mergedFirstLine = lineGeometryAt(lineAddresses[index]);
      const mergedSecondLine = lineGeometryAt(lineAddresses[(index + 1) % lineAddresses.length]);
      if (mergedFirstLine.secondAddress !== mergedSecondLine.firstAddress) {
        console.error(JSON.stringify({
          failure: "coincident point merge",
          mergeAttempt: {
            selectedPointIndex: octal(mergeAttempt.selectedPointIndex, 6),
            targetPointIndex: octal(mergeAttempt.targetPointIndex, 6),
            stopTrace: mergeAttempt.stopTrace,
          },
          firstBefore: geometryForReport(firstLine),
          secondBefore: geometryForReport(secondLine),
          firstAfter: geometryForReport(mergedFirstLine),
          secondAfter: geometryForReport(mergedSecondLine),
          ringOperationTrace,
        }, null, 2));
      }
      assert.equal(mergedFirstLine.secondAddress, mergedSecondLine.firstAddress,
        "the original merger must leave one shared point at each flange corner");
    }
  }

  const endpointAddresses = lineAddresses.flatMap((address) => {
    const geometry = lineGeometryAt(address);
    return [geometry.firstAddress, geometry.secondAddress];
  });
  const uniqueEndpointAddresses = [...new Set(endpointAddresses)];
  const endpointCoordinateKeys = endpointAddresses.map((address) =>
    [0o20, 0o21].map((offset) =>
      octal(machine.memory_word(address + offset, machine.simulated_time).value)).join(","));
  const uniqueEndpointCoordinateKeys = [...new Set(endpointCoordinateKeys)];
  const closingMerged = lineGeometryAt(lineAddresses.at(-1)).secondAddress
    === closingPointAddress;
  const polylineReport = {
    shapePoints,
    lineAddresses: lineAddresses.map((address) => octal(address, 6)),
    uniqueEndpointAddresses: uniqueEndpointAddresses.map((address) => octal(address, 6)),
    uniqueEndpointCoordinateKeys,
    closedByCoordinates: uniqueEndpointCoordinateKeys.length === 6,
    closingMerged,
    firstSegment: geometryForReport(lineGeometryAt(lineAddresses[0])),
    addedSegments: segmentReports,
    listEnd: octal(machine.memory_word(0o024000, machine.simulated_time).value),
    alarm: machine.last_alarm,
  };
  if (process.env.DEBUG_STAGES === "1") console.error("stage: polyline", polylineReport);
  assert.equal(lineAddresses.length, perpendicularMode && !perpendicularFlangeMode ? 2 : 6,
    perpendicularMode && !perpendicularFlangeMode
      ? "the perpendicular proof must contain two original line objects"
      : "the flange outline must contain six original line objects");
  assert.equal(uniqueEndpointCoordinateKeys.length, perpendicularMode && !perpendicularFlangeMode ? 3 : 6,
    perpendicularMode && !perpendicularFlangeMode
      ? "the perpendicular proof must form one visible corner"
      : "the six line objects must form one visibly closed outline");
  if (!perpendicularMode || perpendicularFlangeMode) {
    if (process.env.DEBUG_STAGES === "1") {
      console.error("stage: closing segment", segmentReports.at(-1));
    }
    assert.equal(closingMerged, true,
      "the closing endpoint must share the first point record after the original merger path");
  }
  if (!perpendicularMode) {
    if (process.env.WAIT_AFTER_POLYLINE === "1") {
      runUntilTime(machine.simulated_time + 100);
    }
    console.log(JSON.stringify(polylineReport, null, 2));
    process.exit(0);
  }

  function mapPointToDisplay(target, targetPointAddress) {
    const targetIndex = targetPointAddress - 0o024000;
    const targetSelectionPublished = () =>
      machine.memory_word(0o200044, machine.simulated_time).value !== 0
      && Array.from({ length: 8 }, (_, offset) =>
        rightHalf(machine.memory_word(0o200045 + offset, machine.simulated_time).value))
        .includes(targetIndex);
    phase = "map-perpendicular-target";
    const displayCandidates = displayPointCandidatesForListIndex(targetIndex);
    const attempts = [];
    machine.set_light_pen(50 / 1022, 1 - 50 / 1022, 8 / 1022, true);
    runUntil(() => machine.memory_word(0o200044, machine.simulated_time).value === 0, 20, 1);
    for (const candidate of displayCandidates) {
      machine.set_light_pen(
        candidate.x / 1022,
        1 - candidate.y / 1022,
        26 / 1022,
        true,
      );
      runUntilTime(machine.simulated_time + 0.15);
      if (targetSelectionPublished() || runUntil(targetSelectionPublished, 1, 20)) {
        return candidate;
      }
      if (attempts.length < 20) {
        attempts.push({
          candidate,
          atBits: octal(machine.memory_word(0o200044, machine.simulated_time).value),
          selections: Array.from({ length: 8 }, (_, offset) =>
            octal(machine.memory_word(0o200045 + offset, machine.simulated_time).value)),
        });
      }
    }
    console.error(JSON.stringify({
      failure: "point display mapping",
      target,
      targetIndex: octal(targetIndex, 6),
      candidateCount: displayCandidates.length,
      attempts,
    }, null, 2));
    assert.fail(`the original selector must map point ${octal(targetIndex, 6)} near ${target.x},${target.y}`);
  }
  const lineGeometries = lineAddresses.map((address) => lineGeometryAt(address));
  const constraintPairIndexes = perpendicularFlangeMode
    ? lineAddresses.map((_, index) => [index, (index + 1) % lineAddresses.length])
    : [[0, 1]];
  const constraintTargetGroups = constraintPairIndexes.map(([firstIndex, secondIndex]) => {
    const firstLine = lineGeometries[firstIndex];
    const secondLine = lineGeometries[secondIndex];
    const targets = [
      [shapePoints[firstIndex], firstLine.firstAddress],
      [shapePoints[firstIndex + 1], firstLine.secondAddress],
      [shapePoints[secondIndex], secondLine.firstAddress],
      [shapePoints[secondIndex + 1], secondLine.secondAddress],
    ];
    return [0, 1, 2, 3].map((index) => {
      const [target, targetPointAddress] = targets[index];
      return { target, targetPointAddress };
    });
  });
  let stagedPoint = null;
  let penPosition = null;
  let attachedDummyIndexes = new Set();
  const dummyPenRadius = 12;

  function primaryUnattachedDummy() {
    if (machine.memory_word(0o200044, machine.simulated_time).value === 0
      || !precreatedPerpendicularConstraint) return undefined;
    const dummyIndexes = precreatedPerpendicularConstraint.dummyAddresses
      .map((address) => address - 0o024000);
    const primary = machine.memory_word(0o200045, machine.simulated_time).value;
    return leftHalf(primary) === 0o321
        && dummyIndexes.includes(rightHalf(primary))
        && !attachedDummyIndexes.has(rightHalf(primary))
      ? primary
      : undefined;
  }

  function moveTrackedPen(target, message, radius = 26) {
    const distance = Math.hypot(target.x - penPosition.x, target.y - penPosition.y);
    const steps = Math.max(40, Math.ceil(distance));
    const start = penPosition;
    for (let step = 1; step <= steps; step += 1) {
      const x = start.x + (target.x - start.x) * step / steps;
      const y = start.y + (target.y - start.y) * step / steps;
      const detectionsBeforeStep = Number(machine.light_pen_detection_count);
      machine.set_light_pen(x / 1022, 1 - y / 1022, radius / 1022, true);
      assert.ok(
        runUntil(() => Number(machine.light_pen_detection_count) > detectionsBeforeStep, 2, 1),
        message,
      );
    }
    penPosition = target;
  }

  function selectUnattachedDummy() {
    machine.set_toggle_register(
      0o25, constraintEditingQuarter4, 0o400, 0, constraintCode, false,
    );
    const dummyIndexes = precreatedPerpendicularConstraint.dummyAddresses
      .map((address) => address - 0o024000);
    const selectedUnattachedDummy = primaryUnattachedDummy;
    const currentCandidates = dummyIndexes
      .filter((index) => !attachedDummyIndexes.has(index))
      .flatMap((index) => displayPointCandidatesForListIndex(index));
    for (const candidate of currentCandidates) {
      const detectionsBeforeCandidate = Number(machine.light_pen_detection_count);
      machine.set_light_pen(
        candidate.x / 1022,
        1 - candidate.y / 1022,
        dummyPenRadius / 1022,
        true,
      );
      runUntil(
        () => selectedUnattachedDummy() !== undefined
          || Number(machine.light_pen_detection_count) - detectionsBeforeCandidate >= 8,
        5,
        1,
      );
      machine.set_light_pen(
        candidate.x / 1022,
        1 - candidate.y / 1022,
        dummyPenRadius / 1022,
        false,
      );
      const selectedWord = selectedUnattachedDummy();
      if (selectedWord !== undefined) {
        const exactPoints = displayPointsForListIndex(rightHalf(selectedWord));
        stagedPoint = exactPoints.reduce((closest, point) =>
          Math.hypot(point.x - candidate.x, point.y - candidate.y)
              < Math.hypot(closest.x - candidate.x, closest.y - candidate.y)
            ? point
            : closest, exactPoints[0] ?? candidate);
        penPosition = stagedPoint;
        return rightHalf(selectedWord);
      }
      runUntil(
        () => machine.memory_word(0o004127, machine.simulated_time).value === 0,
        20,
        1,
      );
    }
    if (process.env.FINE_TRACE === "1") {
      watchedRingValue = machine.memory_word(0o025434, machine.simulated_time).value;
      fineAssemblyTrace = true;
    }
    machine.set_light_pen(
      stagedPoint.x / 1022,
      1 - stagedPoint.y / 1022,
      dummyPenRadius / 1022,
      true,
    );
    {
      const selectedTypical = () => Array.from({ length: 8 }, (_, offset) =>
        machine.memory_word(0o200045 + offset, machine.simulated_time).value)
        .some((word) => machine.memory_word(0o200044, machine.simulated_time).value !== 0
          && leftHalf(word) === 0o321 && dummyIndexes.includes(rightHalf(word)));
      let typicalReacquired = runUntil(selectedTypical, 20, 20);
      if (!typicalReacquired) {
        for (const candidate of currentCandidates) {
          machine.set_light_pen(
            candidate.x / 1022,
            1 - candidate.y / 1022,
            dummyPenRadius / 1022,
            true,
          );
          stepBatch(1_000);
          if (selectedTypical()) {
            stagedPoint = candidate;
            penPosition = candidate;
            typicalReacquired = true;
            break;
          }
        }
      }
      if (!typicalReacquired) {
        const scanOffsets = [0, ...Array.from({ length: 10 }, (_, index) => [
          -(index + 1) * 10,
          (index + 1) * 10,
        ]).flat()];
        for (const yOffset of scanOffsets) {
          for (const xOffset of scanOffsets) {
            const candidate = {
              x: precreatedPerpendicularConstraint.typicalVariableHit.x + xOffset,
              y: precreatedPerpendicularConstraint.typicalVariableHit.y + yOffset,
            };
            machine.set_light_pen(
              candidate.x / 1022,
              1 - candidate.y / 1022,
              dummyPenRadius / 1022,
              true,
            );
            stepBatch(1_000);
            if (selectedTypical()) {
              stagedPoint = candidate;
              penPosition = candidate;
              typicalReacquired = true;
              break;
            }
          }
          if (typicalReacquired) break;
        }
      }
      if (!typicalReacquired) {
        const dummyDisplayNames = new Set(dummyIndexes.map((index) => index & 0o377));
        const displayCount = rightHalf(
          machine.memory_word(0o200032, machine.simulated_time).value,
        );
        const dummyDisplayEntries = [];
        for (let offset = 0; offset < displayCount; offset += 1) {
          const value = BigInt(
            machine.memory_word(0o100000 + offset, machine.simulated_time).value,
          );
          const firstName = Number((value >> 18n) & 0o377n);
          const secondName = Number(value & 0o377n);
          if (firstName === 0o321 || secondName === 0o321
            || dummyDisplayNames.has(firstName) || dummyDisplayNames.has(secondName)) {
            dummyDisplayEntries.push({
              address: octal(0o100000 + offset, 6),
              value: octal(value),
              firstName: octal(firstName, 3),
              secondName: octal(secondName, 3),
              rawX: octal(Number((value >> 26n) & 0o1777n), 4),
              rawY: octal(Number((value >> 8n) & 0o1777n), 4),
            });
          }
        }
        console.error(JSON.stringify({
          failure: "staged P-variable reacquisition",
          stagedPoint,
          penPosition,
          atBits: octal(machine.memory_word(0o200044, machine.simulated_time).value),
          selections: Array.from({ length: 8 }, (_, offset) =>
            octal(machine.memory_word(0o200045 + offset, machine.simulated_time).value)),
          penloc: [0o001712, 0o001713].map((address) =>
            octal(machine.memory_word(address, machine.simulated_time).value)),
          pspl: [0o200042, 0o200043].map((address) =>
            octal(machine.memory_word(address, machine.simulated_time).value)),
          transform: [0o200034, 0o200035, 0o200036].map((address) =>
            octal(machine.memory_word(address, machine.simulated_time).value)),
          originalTransform: precreatedPerpendicularConstraint.transform.map((value) =>
            octal(value)),
          displayCount: octal(displayCount),
          dummyDisplayEntries: dummyDisplayEntries.slice(0, 80),
          dummyCoordinates: precreatedPerpendicularConstraint.dummyAddresses.map((address) => ({
            index: octal(address - 0o024000, 6),
            xy: [0o14, 0o15].map((offset) =>
              octal(machine.memory_word(address + offset, machine.simulated_time).value)),
          })),
        }, null, 2));
      }
      assert.ok(typicalReacquired, "the flange display must retain the original P variables");
    }
    let selectedIndex = null;
    const selected = runUntil(() => {
      const selectedWord = selectedUnattachedDummy();
      if (selectedWord === undefined) return false;
      selectedIndex = rightHalf(selectedWord);
      return true;
    }, 100, 1);
    if (!selected) {
      console.error(JSON.stringify({
        failure: "P variable selection",
        dummyIndexes: dummyIndexes.map((index) => octal(index, 6)),
        dummyTypes: precreatedPerpendicularConstraint.dummyAddresses.map((address) =>
          octal(machine.memory_word(address, machine.simulated_time).value)),
        stagedCoordinates: precreatedPerpendicularConstraint.stagedCoordinates
          .map((pair) => pair.map((value) => octal(value))),
        currentCoordinates: precreatedPerpendicularConstraint.dummyAddresses.map((address) =>
          [0o14, 0o15].map((offset) =>
            octal(machine.memory_word(address + offset, machine.simulated_time).value))),
        atBits: octal(machine.memory_word(0o200044, machine.simulated_time).value),
        selections: Array.from({ length: 8 }, (_, offset) =>
          octal(machine.memory_word(0o200045 + offset, machine.simulated_time).value)),
        pspl: [0o200042, 0o200043].map((address) =>
          octal(machine.memory_word(address, machine.simulated_time).value)),
        penLost: machine.memory_word(0o200042, machine.simulated_time).meta,
      }, null, 2));
    }
    assert.ok(selected, "the original selector must identify an unattached P variable");
    const exactPoints = displayPointsForListIndex(selectedIndex);
    if (exactPoints.length > 0) {
      stagedPoint = exactPoints.reduce((closest, point) =>
        Math.hypot(point.x - stagedPoint.x, point.y - stagedPoint.y)
            < Math.hypot(closest.x - stagedPoint.x, closest.y - stagedPoint.y)
          ? point
          : closest, exactPoints[0]);
      penPosition = stagedPoint;
    }
    return selectedIndex;
  }

  function attachNextDummy(attachmentByDummyIndex) {
    phase = "attach-perpendicular-handle";
    let targetDisplayPoint = null;
    let targetPointAddress = null;
    let targetIndex = null;
    const targetSelectionPublished = () =>
      machine.memory_word(0o200044, machine.simulated_time).value !== 0
      && machine.memory_word(0o200045, machine.simulated_time).value
        === 0o275000000 + targetIndex;
    let selectedDummyIndex = null;
    let enteredMovePoint = false;
    let movePointCommandRecorded = false;
    const movePointTrace = [];
    let dummyStartedMoving = false;
    let moveAttempts = 0;
    const maximumMoveAttempts = 3;
    while (!dummyStartedMoving && moveAttempts < maximumMoveAttempts) {
      moveAttempts += 1;
      movePointCommandRecorded = false;
      machine.set_light_pen(
        penPosition.x / 1022,
        1 - penPosition.y / 1022,
        dummyPenRadius / 1022,
        false,
      );
      setCommand(2, 1, false);
      assert.ok(runUntil(
        () => machine.control_state().sequence !== 0o55,
        40,
        1,
      ), "the prior light-pen interrupt must finish before HOLD");
      assert.ok(runUntil(
        () => machine.memory_word(0o011426, machine.simulated_time).value === 0,
        40,
        1,
      ), "sequence 47 must record the prior Q2.1 release");
      assert.ok(runUntil(
        () => machine.memory_word(0o004127, machine.simulated_time).value === 0,
        100,
        1,
      ), "READIT must drain prior events before HOLD");
      setCommand(4, 9, true);
      const holdRecorded = runUntil(
        () => hasOctalBit(
          machine.memory_word(0o011426, machine.simulated_time).value,
          0o400000000000,
        ),
        40,
        1,
      );
      if (!holdRecorded) {
        console.error(JSON.stringify({
          failure: "HOLD before P-variable selection",
          control: machine.control_state(),
          externalInput: octal(machine.memory_word(0o377621, machine.simulated_time).value),
          switch1: octal(machine.memory_word(0o011425, machine.simulated_time).value),
          switch2: octal(machine.memory_word(0o011426, machine.simulated_time).value),
          button47: octal(machine.memory_word(0o011404, machine.simulated_time).value),
          button76: octal(machine.memory_word(0o011405, machine.simulated_time).value),
          movingHead: octal(machine.memory_word(0o024114, machine.simulated_time).value),
          penLost: machine.memory_word(0o200042, machine.simulated_time).meta,
          atBits: octal(machine.memory_word(0o200044, machine.simulated_time).value),
          selections: Array.from({ length: 8 }, (_, offset) =>
            octal(machine.memory_word(0o200045 + offset, machine.simulated_time).value)),
          queue: Array.from({ length: 0o22 }, (_, offset) =>
            octal(machine.memory_word(0o004127 + offset, machine.simulated_time).value)),
        }, null, 2));
      }
      assert.ok(holdRecorded,
        "sequence 47 must record HOLD before P-variable selection");
      selectedDummyIndex = selectUnattachedDummy();
      machine.set_external_input_register(0o400, 0, 0o1, 0, false);
      const handMotion = [0, 2, 4, 2, 0, -2, -4, -2];
      let commandPenPoint = stagedPoint;
      for (let step = 0; step < 1_000 && !movePointCommandRecorded; step += 1) {
        const detectionsBeforeStep = Number(machine.light_pen_detection_count);
        const xOffset = handMotion[step % handMotion.length];
        const yOffset = handMotion[(step + 2) % handMotion.length];
        machine.set_light_pen(
          (stagedPoint.x + xOffset) / 1022,
          1 - (stagedPoint.y + yOffset) / 1022,
          dummyPenRadius / 1022,
          true,
        );
        commandPenPoint = {
          x: stagedPoint.x + xOffset,
          y: stagedPoint.y + yOffset,
        };
        runUntil(
          () => Number(machine.light_pen_detection_count) > detectionsBeforeStep,
          2,
          1,
        );
        movePointCommandRecorded = hasOctalBit(
          machine.memory_word(0o011404, machine.simulated_time).value,
          0o1000,
        );
      }
      assert.equal(movePointCommandRecorded, true,
        "sequence 47 must capture Q2.1");
      const moveDeadline = machine.simulated_time + 20;
      for (let step = 0;
        machine.simulated_time < moveDeadline && !dummyStartedMoving;
        step += 1) {
        const next = {
          x: stagedPoint.x + handMotion[step % handMotion.length],
          y: stagedPoint.y + handMotion[(step + 2) % handMotion.length],
        };
        machine.set_light_pen(
          next.x / 1022,
          1 - next.y / 1022,
          dummyPenRadius / 1022,
          true,
        );
        commandPenPoint = next;
        penPosition = next;
        const moveState = machine.control_state();
        if (moveState.sequence === 0o76
          && moveState.instruction_address >= 0o005400
          && moveState.instruction_address <= 0o005460
          && movePointTrace.length < 200) {
          movePointTrace.push({
            state: moveState,
            penLost: machine.memory_word(0o200042, machine.simulated_time).meta,
            atBits: octal(machine.memory_word(0o200044, machine.simulated_time).value),
            primary: octal(machine.memory_word(0o200045, machine.simulated_time).value),
          });
        }
        stepBatch(20);
        dummyStartedMoving = octal(
          machine.memory_word(0o024114, machine.simulated_time).value,
        ) !== "000114000114";
      }
      enteredMovePoint = dummyStartedMoving;
      if (dummyStartedMoving) setCommand(4, 9, true);
      machine.set_light_pen(
        commandPenPoint.x / 1022,
        1 - commandPenPoint.y / 1022,
        dummyPenRadius / 1022,
        false,
      );
      if (!dummyStartedMoving) {
        setCommand(2, 1, false);
        assert.ok(runUntil(
          () => machine.memory_word(0o011426, machine.simulated_time).value === 0,
          40,
          1,
        ), "sequence 47 must observe the Q2.1 release before a retry");
      }
    }
    if (!dummyStartedMoving) {
      console.error(JSON.stringify({
        failure: "MOVEPOINT P variable",
        constraintAddress: octal(
          precreatedPerpendicularConstraint.constraintAddress,
          6,
        ),
        selectedDummyIndex: octal(selectedDummyIndex, 6),
        moveAttempts,
        enteredMovePoint,
        movePointCommandRecorded,
        control: machine.control_state(),
        externalInput: octal(machine.memory_word(0o377621, machine.simulated_time).value),
        switch1: octal(machine.memory_word(0o011425, machine.simulated_time).value),
        switch2: octal(machine.memory_word(0o011426, machine.simulated_time).value),
        button47: octal(machine.memory_word(0o011404, machine.simulated_time).value),
        button76: octal(machine.memory_word(0o011405, machine.simulated_time).value),
        queue: Array.from({ length: 0o22 }, (_, offset) =>
          octal(machine.memory_word(0o004127 + offset, machine.simulated_time).value)),
        penLost: machine.memory_word(0o200042, machine.simulated_time).meta,
        atBits: octal(machine.memory_word(0o200044, machine.simulated_time).value),
        selections: Array.from({ length: 8 }, (_, offset) =>
          octal(machine.memory_word(0o200045 + offset, machine.simulated_time).value)),
        sequence47Trace,
        atBitsWriteTrace,
        movePointTrace,
      }, null, 2));
    }
    assert.ok(dummyStartedMoving,
      "Q2.1 must put the selected P variable in the original moving list");
    const movingRecordIndex = rightHalf(
      machine.memory_word(0o024114, machine.simulated_time).value,
    );
    const movedDummyAddress = precreatedPerpendicularConstraint.dummyAddresses.find(
      (address) => address - 0o024000 + 0o7 === movingRecordIndex,
    );
    assert.notEqual(movedDummyAddress, undefined,
      "the MOVINGS ring must identify the acquired P variable");
    selectedDummyIndex = movedDummyAddress - 0o024000;
    const targetRecord = attachmentByDummyIndex.get(selectedDummyIndex);
    assert.notEqual(targetRecord, undefined,
      "each acquired P variable must have one endpoint target");
    ({ displayPoint: targetDisplayPoint, targetPointAddress } = targetRecord);
    targetIndex = targetPointAddress - 0o024000;
    attachmentByDummyIndex.delete(selectedDummyIndex);
    if (process.env.DEBUG_STAGES === "1") {
      console.error("stage: mapped endpoint", octal(targetIndex, 6), targetDisplayPoint);
    }
    assert.ok(runUntil(afterMovePointCommand, 300, 1),
      "MOVEPOINT must return before the P variable is dragged");

    machine.set_toggle_register(
      0o25, constraintEditingQuarter4, 0o400, 0, constraintCode, false,
    );
    const remainingDistance = Math.hypot(
      targetDisplayPoint.x - penPosition.x,
      targetDisplayPoint.y - penPosition.y,
    );
    const remainingSteps = Math.max(40, Math.ceil(remainingDistance));
    const remainingStart = penPosition;
    for (let step = 1; step <= remainingSteps; step += 1) {
      const next = {
        x: remainingStart.x
          + (targetDisplayPoint.x - remainingStart.x) * step / remainingSteps,
        y: remainingStart.y
          + (targetDisplayPoint.y - remainingStart.y) * step / remainingSteps,
      };
      machine.set_light_pen(
        next.x / 1022,
        1 - next.y / 1022,
        dummyPenRadius / 1022,
        true,
      );
      stepBatch(1_000);
    }
    penPosition = targetDisplayPoint;
    const movingAtTarget = octal(
      machine.memory_word(0o024114, machine.simulated_time).value,
    ) !== "000114000114";
    if (!movingAtTarget) {
      console.error(JSON.stringify({
        failure: "P variable stopped before target",
        selectedDummyIndex: octal(selectedDummyIndex, 6),
        penLost: machine.memory_word(0o200042, machine.simulated_time).meta,
        atBits: octal(machine.memory_word(0o200044, machine.simulated_time).value),
        selections: Array.from({ length: 4 }, (_, offset) =>
          octal(machine.memory_word(0o200045 + offset, machine.simulated_time).value)),
        queue: Array.from({ length: 0o20 }, (_, offset) =>
          octal(machine.memory_word(0o004127 + offset, machine.simulated_time).value)),
      }, null, 2));
    }
    assert.equal(movingAtTarget, true,
      "the original tracker must keep the P variable moving to the target");
    let targetSelected = runUntil(
      targetSelectionPublished,
      40,
      1,
    );
    if (!targetSelected) {
      console.error(JSON.stringify({
        failure: "P attachment target selection",
        target: targetDisplayPoint,
        targetIndex: octal(targetIndex, 6),
        atBits: octal(machine.memory_word(0o200044, machine.simulated_time).value),
        selections: Array.from({ length: 8 }, (_, offset) =>
          octal(machine.memory_word(0o200045 + offset, machine.simulated_time).value)),
        penloc: [0o001712, 0o001713].map((address) =>
          octal(machine.memory_word(address, machine.simulated_time).value)),
        pspl: [0o200042, 0o200043].map((address) =>
          octal(machine.memory_word(address, machine.simulated_time).value)),
      }, null, 2));
    }
    assert.ok(targetSelected,
      "the original selector must identify the flange point before attachment");

    const constraintFieldsBeforeStop = [0o10, 0o12, 0o14, 0o16].map((offset) =>
      rightHalf(machine.memory_word(
        precreatedPerpendicularConstraint.constraintAddress + offset,
        machine.simulated_time,
      ).value));
    if (process.env.DEBUG_STAGES === "1") {
      console.error("stage: queue before Q1.6", Array.from({ length: 0o22 }, (_, offset) =>
        octal(machine.memory_word(0o004127 + offset, machine.simulated_time).value)));
    }
    assert.ok(runUntil(
      () => hasOctalBit(
        machine.memory_word(0o011426, machine.simulated_time).value,
        0o400000000000,
      ),
      40,
      1,
    ), "sequence 47 must retain HOLD through the drag");
    machine.set_external_input_register(0o400, 0, 0, 0o40, false);
    const stopHandMotion = [0, 2, 4, 2, 0, -2, -4, -2];
    let stopCaptured = false;
    for (let step = 0; step < stopHandMotion.length && !stopCaptured; step += 1) {
      const detectionsBeforePulse = Number(machine.light_pen_detection_count);
      const xOffset = stopHandMotion[step];
      const yOffset = stopHandMotion[(step + 2) % stopHandMotion.length];
      machine.set_light_pen(
        (targetDisplayPoint.x + xOffset) / 1022,
        1 - (targetDisplayPoint.y + yOffset) / 1022,
        dummyPenRadius / 1022,
        true,
      );
      const detected = runUntil(
        () => Number(machine.light_pen_detection_count) > detectionsBeforePulse,
        2,
        1,
      );
      machine.set_light_pen(
        targetDisplayPoint.x / 1022,
        1 - targetDisplayPoint.y / 1022,
        dummyPenRadius / 1022,
        false,
      );
      if (detected) {
        stopCaptured = runUntil(
          () => hasOctalBit(
            machine.memory_word(0o011426, machine.simulated_time).value,
            0o40,
          ),
          5,
          1,
        );
      }
    }
    assert.equal(stopCaptured, true, "sequence 47 must capture Q1.6 at the endpoint");
    machine.set_light_pen(
      targetDisplayPoint.x / 1022,
      1 - targetDisplayPoint.y / 1022,
      dummyPenRadius / 1022,
      true,
    );
    let enteredStopMoving = runUntil(
      () => inStopMovingEntry()
        || octal(machine.memory_word(0o024114, machine.simulated_time).value)
          === "000114000114",
      20,
      100,
    );
    if (!enteredStopMoving) {
      machine.set_light_pen(
        targetDisplayPoint.x / 1022,
        1 - targetDisplayPoint.y / 1022,
        dummyPenRadius / 1022,
        false,
      );
      enteredStopMoving = runUntil(
        () => inStopMovingEntry()
          || octal(machine.memory_word(0o024114, machine.simulated_time).value)
            === "000114000114",
        280,
        100,
      );
    }
    if (!enteredStopMoving) {
      console.error(JSON.stringify({
        failure: "Q1.6 STOPMOVEP entry",
        constraintAddress: octal(
          precreatedPerpendicularConstraint.constraintAddress,
          6,
        ),
        targetIndex: octal(targetIndex, 6),
        control: machine.control_state(),
        externalInput: octal(machine.memory_word(0o377621, machine.simulated_time).value),
        switch2: octal(machine.memory_word(0o011426, machine.simulated_time).value),
        button47: octal(machine.memory_word(0o011404, machine.simulated_time).value),
        button76: octal(machine.memory_word(0o011405, machine.simulated_time).value),
        atBits: octal(machine.memory_word(0o200044, machine.simulated_time).value),
        primary: octal(machine.memory_word(0o200045, machine.simulated_time).value),
        penLost: machine.memory_word(0o200042, machine.simulated_time).meta,
        movingHead: octal(machine.memory_word(0o024114, machine.simulated_time).value),
        sequenceRegisters: sequenceRegisters(),
        raisedFlags: raisedFlags(),
        display: Object.fromEntries([0o200031, 0o200032, 0o200033, 0o200034, 0o200035,
          0o200036, 0o377725].map((address) => [octal(address, 6),
          octal(machine.memory_word(address, machine.simulated_time).value)])),
        queue: Array.from({ length: 0o22 }, (_, offset) =>
          octal(machine.memory_word(0o004127 + offset, machine.simulated_time).value)),
      }, null, 2));
    }
    assert.equal(enteredStopMoving, true,
      "Q1.6 must enter STOPMOVEP while the endpoint remains selected");
    setCommand(1, 6, false);
    machine.set_light_pen(
      targetDisplayPoint.x / 1022,
      1 - targetDisplayPoint.y / 1022,
      dummyPenRadius / 1022,
      false,
    );
    let enteredAttachmentStop = false;
    const attachmentStopTrace = [];
    const attachmentStopDeadline = machine.simulated_time + 200;
    while (octal(machine.memory_word(0o024114, machine.simulated_time).value)
      !== "000114000114" && machine.simulated_time < attachmentStopDeadline) {
      const state = machine.control_state();
      enteredAttachmentStop ||= state.sequence === 0o76
        && state.instruction_address >= 0o006040
        && state.instruction_address <= 0o006500;
      if (enteredAttachmentStop) {
        machine.set_light_pen(
          targetDisplayPoint.x / 1022,
          1 - targetDisplayPoint.y / 1022,
          dummyPenRadius / 1022,
          false,
        );
      }
      if (state.sequence === 0o76
        && state.instruction_address >= 0o006000
        && state.instruction_address <= 0o006500
        && attachmentStopTrace.length < 500) {
        attachmentStopTrace.push({
          state,
          atBits: octal(machine.memory_word(0o200044, machine.simulated_time).value),
          selections: Array.from({ length: 3 }, (_, offset) =>
            octal(machine.memory_word(0o200045 + offset, machine.simulated_time).value)),
          indexes: [0o1, 0o2, 0o3, 0o7, 0o10].map((index) =>
            octal(machine.index_register(index) & 0o777777, 6)),
        });
      }
      stepBatch(1);
    }
    assert.equal(
      octal(machine.memory_word(0o024114, machine.simulated_time).value),
      "000114000114",
      "lifting the pen at the endpoint must clear the moving list",
    );
    assert.ok(runUntil(afterStopMovingCommand, 200, 1),
      "STOPMOVEP must finish MERGEIFP before the attachment is inspected");
    const constraintFieldsAfterStop = [0o10, 0o12, 0o14, 0o16].map((offset) =>
      rightHalf(machine.memory_word(
        precreatedPerpendicularConstraint.constraintAddress + offset,
        machine.simulated_time,
      ).value));
    const mergedDummyIndexes = constraintFieldsBeforeStop.filter((index) =>
      !constraintFieldsAfterStop.includes(index));
    const attachmentSucceeded = constraintFieldsAfterStop.includes(targetIndex)
      && mergedDummyIndexes.length === 1;
    if (!attachmentSucceeded) {
      console.error(JSON.stringify({
        failure: "P variable merge",
        selectedDummyIndex: octal(selectedDummyIndex, 6),
        targetIndex: octal(targetIndex, 6),
        constraintFieldsBeforeStop: constraintFieldsBeforeStop.map((index) => octal(index, 6)),
        constraintFieldsAfterStop: constraintFieldsAfterStop.map((index) => octal(index, 6)),
        lineGeometriesAfterStop: lineAddresses.map((address) =>
          geometryForReport(lineGeometryAt(address))),
        attachmentStopTrace,
      }, null, 2));
    }
    assert.equal(attachmentSucceeded, true,
      "MERGER must replace one P variable with the selected flange point");
    const mergedDummyIndex = mergedDummyIndexes[0];
    attachedDummyIndexes.add(mergedDummyIndex);
    assert.ok(runUntil(
      () => displayPointsForListIndex(mergedDummyIndex).length === 0,
      100,
      1_000,
    ), "the rebuilt display must remove the merged P variable");
    const detectionsBeforeEndpointReacquire = Number(machine.light_pen_detection_count);
    machine.set_light_pen(
      targetDisplayPoint.x / 1022,
      1 - targetDisplayPoint.y / 1022,
      dummyPenRadius / 1022,
      true,
    );
    assert.ok(runUntil(
      () => Number(machine.light_pen_detection_count) > detectionsBeforeEndpointReacquire
        && !machine.memory_word(0o200042, machine.simulated_time).meta,
      100,
      1,
    ), "the tracker must reacquire the endpoint after the P-variable merge");
    return {
      selectedDummyIndex: octal(selectedDummyIndex, 6),
      mergedDummyIndex: octal(mergedDummyIndex, 6),
      targetPoint: octal(targetPointAddress, 6),
    };
  }

  const constraintReports = [];
  let constraintStartPoint = constraintTargetGroups[0].at(-1).target;
  for (const attachmentTargetRecords of constraintTargetGroups) {
    machine.set_toggle_register(0o25, 0o500, 0, 0, constraintCode, false);
    createPerpendicularConstraint(constraintStartPoint, constraintReports.length === 0);
    assert.ok(precreatedPerpendicularConstraint,
      "the perpendicular workflow must retain its precreated P constraint");
    machine.set_toggle_register(0o25, pointMappingQuarter4, 0, 0, 0, false);
    runUntilTime(machine.simulated_time + 5);
    const attachmentTargets = attachmentTargetRecords.map(({ target, targetPointAddress }) => ({
      targetPointAddress,
      displayPoint: mapPointToDisplay(target, targetPointAddress),
    }));
    machine.set_toggle_register(
      0o25, constraintEditingQuarter4, 0o400, 0, constraintCode, false,
    );
    runUntilTime(machine.simulated_time + 5);
    stagedPoint = {
      x: precreatedPerpendicularConstraint.typicalVariableHit.x,
      y: precreatedPerpendicularConstraint.typicalVariableHit.y,
    };
    penPosition = { ...stagedPoint };
    attachedDummyIndexes = new Set();
    const attachmentByDummyIndex = new Map(
      precreatedPerpendicularConstraint.dummyAddresses.map((address, index) => [
        address - 0o024000,
        attachmentTargets[index],
      ]),
    );
    const attachmentReports = Array.from({ length: 4 }, () =>
      attachNextDummy(attachmentByDummyIndex));
    const constraintAddress = precreatedPerpendicularConstraint.constraintAddress;
    const attachedVariableIndexes = [0o10, 0o12, 0o14, 0o16].map((offset) =>
      rightHalf(machine.memory_word(constraintAddress + offset, machine.simulated_time).value));
    assert.equal(attachedDummyIndexes.size, 4,
      "the original MOVEPOINT and merger paths must attach all four P variables");
    assert.equal(attachmentByDummyIndex.size, 0,
      "each P variable must attach to its corresponding line endpoint");
    constraintReports.push({
      address: octal(constraintAddress, 6),
      master: octal(
        rightHalf(machine.memory_word(constraintAddress, machine.simulated_time).value),
        6,
      ),
      attachmentReports,
      attachedVariableIndexes: attachedVariableIndexes.map((index) => octal(index, 6)),
    });
    if (process.env.DEBUG_COUNTS === "1") {
      console.error("constraint display state", {
        constraintCount: constraintReports.length,
        constraintAddress: octal(constraintAddress, 6),
        ndisp: octal(machine.memory_word(0o200031, machine.simulated_time).value),
        sndisp: octal(machine.memory_word(0o200032, machine.simulated_time).value),
        basicFile: octal(machine.memory_word(0o200033, machine.simulated_time).value),
        showToggles: octal(machine.memory_word(0o377725, machine.simulated_time).value),
        sequenceRegisters: sequenceRegisters(),
      });
    }
    constraintStartPoint = penPosition;
  }
  const geometryBeforePerpendicularSolve = lineAddresses.map((address) => lineGeometryAt(address));
  const signedWord = (value) => value >= 2 ** 35 ? -(2 ** 36 - 1 - value) : value;
  const vector = (geometry) => ({
    x: signedWord(geometry.second[0]) - signedWord(geometry.first[0]),
    y: signedWord(geometry.second[1]) - signedWord(geometry.first[1]),
  });
  const perpendicularity = (geometry) => {
    const vectors = geometry.map(vector);
    return constraintPairIndexes.map(([firstIndex, secondIndex]) => {
      const firstVector = vectors[firstIndex];
      const secondVector = vectors[secondIndex];
      const dotProduct = firstVector.x * secondVector.x + firstVector.y * secondVector.y;
      const cosine = dotProduct / (
        Math.hypot(firstVector.x, firstVector.y) * Math.hypot(secondVector.x, secondVector.y)
      );
      return { firstIndex, secondIndex, firstVector, secondVector, dotProduct, cosine };
    });
  };
  machine.set_toggle_register(0o25, 0o500, 0, 0, constraintCode, false);
  machine.set_toggle_register(0o20, 0o400, 0, 0, 0, true);
  let enteredRelax = false;
  let enteredSolve = false;
  let completedRelaxPasses = 0;
  let previousInstructionAddress = -1;
  const relaxPassMeasurements = [];
  const captureRelaxMotion = process.env.RELAX_MOTION_TRACE === "1";
  const relaxMotionMeasurements = [];
  const relaxStartedAt = Number(machine.simulated_time);
  let previousRelaxPassAt = relaxStartedAt;
  let relaxTicks = 0;
  let relaxInstructionTransitions = 0;
  const relaxSequenceTicks = new Map();
  const relaxSequenceSeconds = new Map();
  let previousMotionGeometryKey = null;
  const captureRelaxMotionState = (state, event = "update") => {
    if (!captureRelaxMotion) return;
    const geometry = lineAddresses.map((address) => lineGeometryAt(address));
    const reportedGeometry = geometry.map(geometryForReport);
    const geometryKey = JSON.stringify(reportedGeometry);
    if (geometryKey === previousMotionGeometryKey) return;
    previousMotionGeometryKey = geometryKey;
    const cosines = perpendicularity(geometry).map(({ cosine }) => cosine);
    relaxMotionMeasurements.push({
      event,
      elapsedSeconds: Number(machine.simulated_time) - relaxStartedAt,
      completedPasses: completedRelaxPasses,
      instructionAddress: octal(state.instruction_address, 6),
      maximumAbsoluteCosine: Math.max(...cosines.map(Math.abs)),
      geometry: reportedGeometry,
    });
  };
  const requestedRelaxPasses = Number(process.env.RELAX_PASSES ?? "8");
  const relaxDeadline = machine.simulated_time + 300 * requestedRelaxPasses;
  captureRelaxMotionState(machine.control_state(), "before");
  while (completedRelaxPasses < requestedRelaxPasses
    && machine.simulated_time < relaxDeadline) {
    const beforeStep = machine.control_state();
    const beforeStepTime = Number(machine.simulated_time);
    stepBatch(1);
    relaxTicks += 1;
    const state = machine.control_state();
    relaxSequenceTicks.set(
      beforeStep.sequence,
      (relaxSequenceTicks.get(beforeStep.sequence) ?? 0) + 1,
    );
    relaxSequenceSeconds.set(
      beforeStep.sequence,
      (relaxSequenceSeconds.get(beforeStep.sequence) ?? 0)
        + Number(machine.simulated_time) - beforeStepTime,
    );
    if (state.sequence !== beforeStep.sequence
      || state.program_counter !== beforeStep.program_counter
      || state.instruction_address !== beforeStep.instruction_address) {
      relaxInstructionTransitions += 1;
    }
    enteredRelax ||= state.instruction_address === 0o200060;
    enteredSolve ||= state.instruction_address === 0o013726;
    if (state.instruction_address === 0o205567
      && previousInstructionAddress !== 0o205567) {
      completedRelaxPasses += 1;
      const geometry = lineAddresses.map((address) => lineGeometryAt(address));
      const cosines = perpendicularity(geometry).map(({ cosine }) => cosine);
      const completedAt = Number(machine.simulated_time);
      relaxPassMeasurements.push({
        pass: completedRelaxPasses,
        elapsedSeconds: completedAt - relaxStartedAt,
        passSeconds: completedAt - previousRelaxPassAt,
        cosines,
        maximumAbsoluteCosine: Math.max(...cosines.map(Math.abs)),
        geometry: geometry.map(geometryForReport),
      });
      previousRelaxPassAt = completedAt;
    }
    if (state.instruction_address >= 0o012163
      && state.instruction_address <= 0o012165) {
      captureRelaxMotionState(state);
    }
    if (state.instruction_address === 0o205567) {
      captureRelaxMotionState(state, "pass-boundary");
    }
    previousInstructionAddress = state.instruction_address;
  }
  machine.set_toggle_register(0o20, 0o400, 0, 0, 0, false);
  assert.equal(enteredRelax, true,
    "the enabled FIX toggle must call the original RELAX routine for the P constraint");
  assert.equal(enteredSolve, true,
    "the P-constraint RELAX path must enter the original SOLVEM expansion");
  assert.equal(completedRelaxPasses, requestedRelaxPasses,
    "the held FIX switch must complete each requested original RELAX pass");
  const geometryAfterPerpendicularSolve = lineAddresses.map((address) => lineGeometryAt(address));
  const perpendicularResults = perpendicularity(geometryAfterPerpendicularSolve);
  console.log(JSON.stringify({
    polyline: polylineReport,
    constraints: constraintReports,
    solve: {
      enteredRelax,
      enteredSolve,
      completedRelaxPasses,
      elapsedSeconds: Number(machine.simulated_time) - relaxStartedAt,
      ticks: relaxTicks,
      instructionTransitions: relaxInstructionTransitions,
      sequenceTicks: Object.fromEntries([...relaxSequenceTicks.entries()].map(
        ([sequence, ticks]) => [octal(sequence, 2), ticks],
      )),
      sequenceSeconds: Object.fromEntries([...relaxSequenceSeconds.entries()].map(
        ([sequence, seconds]) => [octal(sequence, 2), seconds],
      )),
      passes: relaxPassMeasurements,
      motion: relaxMotionMeasurements,
      geometryBefore: geometryBeforePerpendicularSolve.map(geometryForReport),
      geometryAfter: geometryAfterPerpendicularSolve.map(geometryForReport),
      perpendicularResults,
    },
    alarm: machine.last_alarm,
  }, null, 2));
  assert.ok(perpendicularResults.every(({ cosine }) => Math.abs(cosine) < 0.001),
    "the original P constraints and RELAX solver must make adjacent lines perpendicular");
  process.exit(0);
}

if (process.env.CONSTRAINT_ONLY !== "1" && process.env.CIRCLE_ONLY !== "1") console.log(JSON.stringify({
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

if (process.env.CIRCLE_ONLY === "1") {
  phase = "designate-center";
  const designationStateBefore = {
    dests: octal(machine.memory_word(0o011411, machine.simulated_time).value),
    printedDestsAddress: machine.memory_word(0o011444, machine.simulated_time),
    ccent: octal(machine.memory_word(0o011407, machine.simulated_time).value),
    page1: machine.memory_word(0o011423, machine.simulated_time),
    e: octal(machine.memory_word(0o377610, machine.simulated_time).value),
  };
  const deadHeaderBefore = Array.from({ length: 0o10 }, (_, offset) => ({
    address: octal(0o024067 + offset, 6),
    word: octal(machine.memory_word(0o024067 + offset, machine.simulated_time).value),
  }));
  const initialPoint = phaseStats("verify-line").closestToInitialPen;
  const centerX = initialPoint.x;
  const centerY = initialPoint.y;
  machine.set_light_pen(centerX / 1022, 1 - centerY / 1022, 26 / 1022, true);
  const trace = [];
  let commandPressed = false;
  let commandReleased = false;
  let commandCaptured = false;
  let pointSelected = false;
  let enteredDesignate = false;
  let returnedFromDesignate = false;
  const commandAddresses = new Set();
  const buttonTrace = [];
  const postDesignateStates = new Map();
  const deleteTrace = [];
  const deadline = machine.simulated_time + 20;
  while (machine.simulated_time < deadline && !returnedFromDesignate) {
    const state = machine.control_state();
    if (commandPressed && state.sequence === 0o76) {
      if (state.instruction_address >= 0o004100 && state.instruction_address <= 0o006200) {
        commandAddresses.add(octal(state.instruction_address, 6));
      }
    }
    if (enteredDesignate && state.sequence === 0o76) {
      const key = `${octal(state.instruction_address, 6)} ${state.instruction}`;
      postDesignateStates.set(key, (postDesignateStates.get(key) ?? 0) + 1);
      if (
        state.instruction_address >= 0o007622
        && state.instruction_address <= 0o007710
        && deleteTrace.length < 200
      ) {
        deleteTrace.push({
          state,
          indexes: Object.fromEntries([1, 2, 3, 7, 0o10].map((index) => [
            octal(index, 2),
            machine.index_register(index),
          ])),
          e: octal(machine.memory_word(0o377610, machine.simulated_time).value),
          deadLink: octal(machine.memory_word(0o024072, machine.simulated_time).value),
        });
      }
    }
    if (commandPressed && !commandReleased && state.sequence === 0o47 && buttonTrace.length < 500) {
      buttonTrace.push({
        state,
        externalInput: octal(machine.memory_word(0o377621, machine.simulated_time).value),
        button: octal(machine.memory_word(0o011405, machine.simulated_time).value),
        previous: octal(machine.memory_word(0o011406, machine.simulated_time).value),
        queueIndex: machine.index_register(0o47),
      });
    }
    const atBits = machine.memory_word(0o200044, machine.simulated_time).value;
    if (
      !pointSelected
      && state.sequence === 0o76
      && state.instruction_address === 0o002320
      && hasOctalBit(atBits, 0o2000000)
    ) {
      pointSelected = true;
    }
    if (
      !commandPressed
      && state.sequence === 0o47
    ) {
      machine.set_external_input_register(0, 0, 0, 0o100, false);
      commandPressed = true;
    }
    if (
      commandPressed
      && !commandCaptured
      && hasOctalBit(machine.memory_word(0o011405, machine.simulated_time).value, 0o100)
    ) {
      commandCaptured = true;
    }
    if (
      commandCaptured
      && !commandReleased
    ) {
      machine.set_external_input_register(0, 0, 0, 0, false);
      commandReleased = true;
    }
    if (
      commandPressed
      && !enteredDesignate
      && state.sequence === 0o76
      && state.instruction_address === 0o005555
    ) {
      enteredDesignate = true;
    }
    if (
      enteredDesignate
      && state.sequence === 0o76
      && state.instruction_address === 0o005574
    ) {
      returnedFromDesignate = true;
      break;
    }
    if (
      state.sequence === 0o76
      && state.instruction_address >= 0o005555
      && state.instruction_address <= 0o005574
      && trace.length < 100
    ) {
      trace.push({
        state,
        atBits: octal(atBits),
        selected: octal(machine.memory_word(0o200045, machine.simulated_time).value),
        ccent: octal(machine.memory_word(0o011407, machine.simulated_time).value),
        page1: machine.memory_word(0o011423, machine.simulated_time),
        lpLost: machine.memory_word(0o200042, machine.simulated_time).meta,
        alpha: machine.index_register(0o01),
        dests: octal(machine.memory_word(0o011411, machine.simulated_time).value),
        e: octal(machine.memory_word(0o377610, machine.simulated_time).value),
      });
    }
    stepBatch(1);
    assert.equal(machine.alarm_active, false, machine.last_alarm);
  }
  machine.set_external_input_register(0, 0, 0, 0, false);
  machine.set_light_pen(centerX / 1022, 1 - centerY / 1022, 4 / 1022, false);

  if (
    !enteredDesignate
    || !returnedFromDesignate
    || !machine.memory_word(0o011423, machine.simulated_time).meta
  ) {
    console.error(JSON.stringify({
      failure: "Q1.7 did not complete DESIGNATE",
      commandPressed,
      commandCaptured,
      commandReleased,
      pointSelected,
      enteredDesignate,
      returnedFromDesignate,
      commandAddresses: [...commandAddresses],
      center: { x: centerX, y: centerY },
      buttonTrace,
      trace,
      control: machine.control_state(),
      button: octal(machine.memory_word(0o011405, machine.simulated_time).value),
      previous: octal(machine.memory_word(0o011406, machine.simulated_time).value),
    }, null, 2));
  }

  assert.equal(designationStateBefore.dests, "000000000001",
    "the reconstruction must supply the no-old-center sentinel");
  assert.equal(enteredDesignate, true, "Q1.7 must enter the original DESIGNATE routine");
  assert.equal(returnedFromDesignate, true, "the original DESIGNATE routine must return");
  assert.equal(machine.memory_word(0o011423, machine.simulated_time).meta, true,
    "DESIGNATE must set the original DESIGNATED metabit");
  assert.notEqual(machine.memory_word(0o011407, machine.simulated_time).value, 0,
    "DESIGNATE must store the assembly-created center point in CCENT");
  assert.deepEqual(
    Array.from({ length: 0o10 }, (_, offset) =>
      octal(machine.memory_word(0o024067 + offset, machine.simulated_time).value)),
    deadHeaderBefore.map(({ word }) => word),
    "first designation must not damage the DEADS ring",
  );

  phase = "circle-radius";
  machine.set_light_pen(centerX / 1022, 1 - centerY / 1022, 26 / 1022, true);
  assert.ok(
    runUntil(() => !machine.memory_word(0o200042, machine.simulated_time).meta, 100),
    "the original tracker must reacquire the designated center",
  );
  const radius = 120;
  for (let offset = 2; offset <= radius; offset += 2) {
    const detectionsBeforeStep = Number(machine.light_pen_detection_count);
    machine.set_light_pen((centerX + offset) / 1022, 1 - centerY / 1022, 26 / 1022, true);
    assert.ok(
      runUntil(() => Number(machine.light_pen_detection_count) > detectionsBeforeStep, 3),
      `the original tracker must follow circle-radius step ${offset / 2}`,
    );
  }

  const listBeforeCircle = machine.memory_word(0o024000, machine.simulated_time).value;
  const memoryBeforeCircle = snapshot();
  const displayBeforeCircle = snapshot(0o100000, 0o101000);
  const ndispBeforeCircle = machine.memory_word(0o200031, machine.simulated_time).value;
  let drawPressed = false;
  let drawCaptured = false;
  let drawReleased = false;
  let enteredStartDraw = false;
  let enteredStartC = false;
  let returnedFromStartDraw = false;
  const circleCommandAddresses = new Set();
  const circleDeadline = machine.simulated_time + 40;
  while (machine.simulated_time < circleDeadline && !returnedFromStartDraw) {
    const state = machine.control_state();
    if (!drawPressed && state.sequence === 0o47) {
      machine.set_external_input_register(0, 0, 0, 0o200, false);
      drawPressed = true;
    }
    if (
      drawPressed
      && !drawCaptured
      && hasOctalBit(machine.memory_word(0o011405, machine.simulated_time).value, 0o200)
    ) {
      drawCaptured = true;
    }
    if (state.sequence === 0o76) {
      circleCommandAddresses.add(octal(state.instruction_address, 6));
      enteredStartDraw ||= (
        state.instruction_address === 0o005455
        || state.instruction_address === 0o005456
      );
      enteredStartC ||= state.instruction_address === 0o005477;
      returnedFromStartDraw ||= enteredStartDraw && state.instruction_address === 0o005553;
    }
    if (enteredStartDraw && !drawReleased) {
      machine.set_external_input_register(0, 0, 0, 0, false);
      drawReleased = true;
    }
    stepBatch(1);
    assert.equal(machine.alarm_active, false, machine.last_alarm);
  }
  machine.set_external_input_register(0, 0, 0, 0, false);

  const listAfterCircle = machine.memory_word(0o024000, machine.simulated_time).value;
  if (!enteredStartDraw) {
    console.error(JSON.stringify({
      failure: "Q1.8 did not enter STARTDRAW",
      drawPressed,
      drawCaptured,
      drawReleased,
      circleCommandAddresses: [...circleCommandAddresses],
      externalInput: octal(machine.memory_word(0o377621, machine.simulated_time).value),
      button: octal(machine.memory_word(0o011405, machine.simulated_time).value),
      previous: octal(machine.memory_word(0o011406, machine.simulated_time).value),
      queue: octal(machine.memory_word(0o004127, machine.simulated_time).value),
      flags: raisedFlags(),
      control: machine.control_state(),
    }, null, 2));
  }
  assert.equal(drawCaptured, true, "the original sequence-47 reader must capture Q1.8");
  assert.equal(enteredStartDraw, true, "Q1.8 must enter the original STARTDRAW routine");
  assert.equal(enteredStartC, true, "DESIGNATED must route STARTDRAW through original STARTC");
  assert.equal(returnedFromStartDraw, true, "the original circle creation routine must return");
  assert.ok(listAfterCircle > listBeforeCircle,
    "original circle creation must allocate Sketchpad records");

  phase = "move-circle-endpoint";
  const circleStartX = centerX + radius;
  const circleStartY = centerY;
  machine.set_light_pen(circleStartX / 1022, 1 - circleStartY / 1022, 26 / 1022, true);
  assert.ok(
    runUntil(() => !machine.memory_word(0o200042, machine.simulated_time).meta, 100),
    "the original tracker must reacquire the moving circle endpoint",
  );
  const arcSteps = 180;
  const arcRadians = Math.PI * 1.5;
  for (let step = 1; step <= arcSteps; step += 1) {
    const angle = arcRadians * step / arcSteps;
    const targetX = centerX + radius * Math.cos(angle);
    const targetY = centerY + radius * Math.sin(angle);
    const detectionsBeforeStep = Number(machine.light_pen_detection_count);
    machine.set_light_pen(targetX / 1022, 1 - targetY / 1022, 26 / 1022, true);
    assert.ok(
      runUntil(() => Number(machine.light_pen_detection_count) > detectionsBeforeStep, 3),
      `the original tracker must follow circle-arc step ${step}`,
    );
  }
  runUntilTime(machine.simulated_time + 0.5);
  machine.set_light_pen(centerX / 1022, 1 - (centerY - radius) / 1022, 26 / 1022, false);
  assert.ok(
    runUntil(() => (
      octal(machine.memory_word(0o024114, machine.simulated_time).value) === "000114000114"
    ), 200),
    "the original STOPMOVEP path must finish the circle endpoint movement",
  );
  assert.ok(
    runUntil(() => (
      machine.control_state().sequence === 0o76
      && machine.control_state().instruction_address === 0o205304
    ), 20, 1),
    "the original display builder must publish its file after circle movement",
  );

  phase = "verify-circle";
  runUntilTime(machine.simulated_time + 2);
  const circleScope = phaseStats("verify-circle");
  assert.ok(circleScope.points > 0, "the executing assembly must emit scope points after circle creation");
  const uniqueCirclePoints = [...new Map(circleVerificationScope.map((point) => [
    `${point.x},${point.y}`,
    point,
  ])).values()];
  const linePointKeys = new Set(verificationScope.map(({ x, y }) => `${x},${y}`));
  const newCirclePoints = uniqueCirclePoints.filter(({ x, y }) =>
    !linePointKeys.has(`${x},${y}`));
  const newCircleBounds = newCirclePoints.reduce((bounds, { x, y }) => ({
    x: [Math.min(bounds.x[0], x), Math.max(bounds.x[1], x)],
    y: [Math.min(bounds.y[0], y), Math.max(bounds.y[1], y)],
  }), { x: [Infinity, -Infinity], y: [Infinity, -Infinity] });
  const circleFit = fitCircularLocus(newCirclePoints);
  const arcSpan = {
    x: newCircleBounds.x[1] - newCircleBounds.x[0],
    y: newCircleBounds.y[1] - newCircleBounds.y[0],
  };
  const startCaWord = machine.memory_word(0o005517, machine.simulated_time).value;
  const circleIndex = rightHalf(startCaWord);
  const circleAddress = 0o024000 + circleIndex;
  const circlePointIndexes = {
    start: rightHalf(machine.memory_word(circleAddress + 0o10, machine.simulated_time).value),
    end: rightHalf(machine.memory_word(circleAddress + 0o12, machine.simulated_time).value),
    center: rightHalf(machine.memory_word(circleAddress + 0o14, machine.simulated_time).value),
  };
  const circlePointRecords = Object.fromEntries(Object.entries(circlePointIndexes).map(
    ([name, index]) => [name, {
      index: octal(index, 6),
      record: Array.from({ length: 0o22 }, (_, offset) =>
        octal(machine.memory_word(0o024000 + index + offset, machine.simulated_time).value)),
    }],
  ));
  if (
    newCirclePoints.length < 32
    || arcSpan.x < 30
    || arcSpan.y < 10
    || circleFit.radius < 30
    || circleFit.maximumError > 3
  ) {
    console.error(JSON.stringify({
      newCirclePointCount: newCirclePoints.length,
      newCircleBounds,
      arcSpan,
      circleFit,
      uniqueCirclePointCount: uniqueCirclePoints.length,
    }, null, 2));
  }
  assert.ok(newCirclePoints.length >= 32,
    "unit 60 must emit at least 32 new points for the reconstructed arc");
  assert.ok(arcSpan.x >= 30 && arcSpan.y >= 10,
    "the assembly-created arc must have visible length and curvature");
  assert.ok(circleFit.radius >= 30,
    "the assembly-created arc must have a nontrivial fitted radius");
  assert.ok(circleFit.maximumError <= 3,
    "the new unit-60 points must follow a circular locus within display quantization");
  machine.set_light_pen((centerX + radius) / 1022, 1 - centerY / 1022, 26 / 1022, false);

  console.log(JSON.stringify({
    designationStateBefore,
    commandPressed,
    commandReleased,
    commandCaptured,
    pointSelected,
    centerX,
    centerY,
    enteredDesignate,
    returnedFromDesignate,
    designationTrace: process.env.DESIGNATION_TRACE === "1" ? trace : undefined,
    atBits: octal(machine.memory_word(0o200044, machine.simulated_time).value),
    selected: octal(machine.memory_word(0o200045, machine.simulated_time).value),
    ccent: octal(machine.memory_word(0o011407, machine.simulated_time).value),
    page1: machine.memory_word(0o011423, machine.simulated_time),
    externalInput: octal(machine.memory_word(0o377621, machine.simulated_time).value),
    buttonQueue: [0o004127, 0o011405, 0o011406, 0o011410].map((address) => ({
      address: octal(address, 6),
      word: octal(machine.memory_word(address, machine.simulated_time).value),
    })),
    commandAddressCount: commandAddresses.size,
    buttonTraceCount: buttonTrace.length,
    postDesignateStateCount: postDesignateStates.size,
    deleteTraceCount: deleteTrace.length,
    sequence76Flag: machine.sequence_flag(0o76),
    sequence76Index: machine.index_register(0o76),
    raisedFlags: raisedFlags(),
    deadHeader: Array.from({ length: 0o10 }, (_, offset) => ({
      address: octal(0o024067 + offset, 6),
      word: octal(machine.memory_word(0o024067 + offset, machine.simulated_time).value),
    })),
    deadHeaderBefore,
    deleteIndexes: Object.fromEntries([1, 2, 7, 0o10].map((index) => [
      octal(index, 2),
      machine.index_register(index),
    ])),
    designationTraceCount: trace.length,
    circle: {
      radius,
      arcSteps,
      drawPressed,
      drawCaptured,
      drawReleased,
      enteredStartDraw,
      enteredStartC,
      returnedFromStartDraw,
      listBefore: octal(listBeforeCircle),
      listAfter: octal(listAfterCircle),
      changedWords: changes(memoryBeforeCircle, snapshot()).length,
      ndispBefore: octal(ndispBeforeCircle, 6),
      ndispAfter: octal(machine.memory_word(0o200031, machine.simulated_time).value, 6),
      changedDisplayWords: changes(
        displayBeforeCircle,
        snapshot(0o100000, 0o101000),
      ).length,
      commandAddressCount: circleCommandAddresses.size,
      scopePointCount: circleScope.points,
      fittedCenter: circleFit.center,
      fittedRadius: circleFit.radius,
      maximumRadiusError: circleFit.maximumError,
      rootMeanSquareRadiusError: circleFit.rootMeanSquareError,
      arcSpan,
      newCircleBounds,
      uniqueScopePointCount: uniqueCirclePoints.length,
      newScopePointCount: newCirclePoints.length,
      newScopePointSample: newCirclePoints.slice(0, 12),
      startCaWord: octal(startCaWord),
      circleIndex: octal(circleIndex, 6),
      circleAddress: octal(circleAddress, 6),
      circlePointIndexes,
      circleMaster: octal(machine.memory_word(0o024201, machine.simulated_time).value),
      displayBuildPublished: true,
    },
    control: machine.control_state(),
  }, null, 2));
  process.exit(0);
}

if (process.env.CONSTRAINT_ONLY === "1" && process.env.MAKECON_ONLY === "1") {
  assert.equal(selectedCommand, "2.8", "MAKECON_ONLY requires SELECT_COMMAND=2.8");
  machine.set_light_pen(firstX, firstY, 26 / 1022, true);
  assert.ok(
    runUntil(
      () => !machine.memory_word(0o200042, machine.simulated_time).meta
        && machine.memory_word(0o200044, machine.simulated_time).value === 0,
      200,
      2_000,
    ),
    "MAKECONS requires a tracked pen with no selected drawing object",
  );

  const beforeList = machine.memory_word(0o024000, machine.simulated_time).value;
  const beforeMemory = snapshot();
  const commandAddresses = new Set();
  const commandDeadline = machine.simulated_time + 20;
  setSelectedCommand(true);
  const commandPressed = true;
  while (
    machine.memory_word(0o024000, machine.simulated_time).value === beforeList
    && machine.simulated_time < commandDeadline
  ) {
    const state = machine.control_state();
    if (state.sequence === 0o76) commandAddresses.add(octal(state.instruction_address, 6));
    stepBatch(1);
    assert.equal(machine.alarm_active, false, machine.last_alarm);
  }
  setSelectedCommand(false);
  assert.equal(commandPressed, true, "Q2.8 must be pressed during the original input scan");
  runUntilTime(machine.simulated_time + 20);
  let attachmentProbe = null;
  if (process.env.ATTACH_PROBE === "1") {
    machine.set_external_input_register(0, 0, 0, 0o40, false);
    runUntil(
      () => octal(machine.memory_word(0o024114, machine.simulated_time).value)
        === "000114000114",
      200,
      1,
    );
    machine.set_external_input_register(0, 0, 0, 0, false);
    runUntilTime(machine.simulated_time + 20);
    machine.set_toggle_register(0o25, 0o610, 0o400, 0, constraintCode, false);
    machine.set_light_pen(finalX, finalY, 26 / 1022, true);
    runUntilTime(machine.simulated_time + 20);
    attachmentProbe = {
      atBits: octal(machine.memory_word(0o200044, machine.simulated_time).value),
      selections: Array.from({ length: 8 }, (_, offset) =>
        octal(machine.memory_word(0o200045 + offset, machine.simulated_time).value)),
      movingHeader: octal(machine.memory_word(0o024114, machine.simulated_time).value),
    };
  }
  const afterList = machine.memory_word(0o024000, machine.simulated_time).value;
  const constraintAddress = 0o024000 + Number(beforeList);
  console.log(JSON.stringify({
    selectedCommand,
    constraintCode: octal(constraintCode, 3),
    beforeList: octal(beforeList),
    afterList: octal(afterList),
    allocatedWords: Number(afterList) - Number(beforeList),
    constraintAddress: octal(constraintAddress, 6),
    constraintWords: Array.from({ length: Math.min(0o24, Number(afterList) - Number(beforeList)) },
      (_, offset) => octal(machine.memory_word(constraintAddress + offset, machine.simulated_time).value)),
    commandAddresses: [...commandAddresses],
    attachmentProbe,
    listChanges: changes(beforeMemory, snapshot()),
    control: machine.control_state(),
    alarm: machine.last_alarm,
  }, null, 2));
  assert.ok(afterList > beforeList, "Q2.8 with a valid constraint code must allocate a constraint");
  process.exit(0);
}

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
  machine.set_light_pen(midpointX / 1022, 1 - midpointY / 1022, 26 / 1022, true);
  const beforeAtBits = octal(machine.memory_word(0o200044, machine.simulated_time).value);
  const beforeConstraintList = machine.memory_word(0o024000, machine.simulated_time).value;
  const memoryBeforeSelectedCommand = snapshot();
  const selectionDeadline = machine.simulated_time + 5;
  let trueupPressed = false;
  while (machine.simulated_time < selectionDeadline) {
    const state = machine.control_state();
    const atBitsAtInstruction = machine.memory_word(0o200044, machine.simulated_time).value;
    if (
      state.sequence === 0o76
      && state.instruction_address === 0o002320
      && hasOctalBit(atBitsAtInstruction, 0o4000000)
      && !machine.memory_word(0o200042, machine.simulated_time).meta
    ) {
      setSelectedCommand(true);
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
  const commandEntryAddresses = new Set();
  const fixitTrace = [];
  const commandWaitSeconds = selectedCommand === "2.9" ? 200 : 20;
  while (
    machine.simulated_time < trueupStart + commandWaitSeconds
    && (selectedCommand !== "2.9" || !enteredTrueup)
  ) {
    const state = machine.control_state();
    if (state.sequence === 0o76) commandEntryAddresses.add(octal(state.instruction_address, 6));
    if (
      selectedCommand === "3.3"
      && state.sequence === 0o76
      && state.instruction_address >= 0o005277
      && state.instruction_address <= 0o005325
      && fixitTrace.length < 80
    ) {
      fixitTrace.push({
        state,
        indexes: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(
          (index) => [octal(index, 2), machine.index_register(index)],
        )),
        lpLost: machine.memory_word(0o200042, machine.simulated_time),
        atBits: octal(machine.memory_word(0o200044, machine.simulated_time).value),
        selected: octal(machine.memory_word(0o200045, machine.simulated_time).value),
        fixedHeader: octal(machine.memory_word(0o024100, machine.simulated_time).value),
      });
    }
    enteredTrueup ||= state.sequence === 0o76 && state.instruction_address === 0o005421;
    stepBatch(1);
    assert.equal(machine.alarm_active, false, machine.last_alarm);
  }
  setSelectedCommand(false);
  machine.set_light_pen(midpointX / 1022, 1 - midpointY / 1022, 26 / 1022, false);
  if (selectedCommand !== "2.9") {
    const probeStart = machine.simulated_time;
    const enteredAddresses = new Set();
    while (machine.simulated_time < probeStart + 20) {
      const state = machine.control_state();
      if (state.sequence === 0o76) enteredAddresses.add(octal(state.instruction_address, 6));
      stepBatch(1);
      assert.equal(machine.alarm_active, false, machine.last_alarm);
    }
    const fixedListChanges = changes(memoryBeforeSelectedCommand, snapshot());
    if (selectedCommand === "3.3") {
      const selectedLineVordChanged = fixedListChanges.some(
        ({ address }) => address === "025267",
      );
      if (!selectedLineVordChanged) {
        console.error(JSON.stringify({
          failure: "FIXIT did not change the expected selected-line VORD link",
          selectedObject,
          commandEntryAddresses: [...commandEntryAddresses],
          enteredAddresses: [...enteredAddresses],
          vordBefore: octal(memoryBeforeSelectedCommand.get(0o025267)),
          vordAfter: octal(machine.memory_word(0o025267, machine.simulated_time).value),
          fixedHeaderBefore: octal(memoryBeforeSelectedCommand.get(0o024100)),
          fixedHeaderAfter: octal(machine.memory_word(0o024100, machine.simulated_time).value),
          fixedListChanges,
          fixitTrace,
          control: machine.control_state(),
        }, null, 2));
      }
      assert.ok(commandEntryAddresses.has("005277"),
        "Q3.3 must enter the original FIXIT routine");
      assert.equal(machine.memory_word(0o024000, machine.simulated_time).value, beforeConstraintList,
        "FIXIT must link the selected object without allocating a new block");
      assert.ok(selectedLineVordChanged,
        "FIXIT must change the selected line's VORD link");

      const unfixAddresses = new Set();
      machine.set_external_input_register(0, 0, 0o100, 0, false);
      const unfixStart = machine.simulated_time;
      while (machine.simulated_time < unfixStart + 20) {
        const state = machine.control_state();
        if (state.sequence === 0o76) unfixAddresses.add(octal(state.instruction_address, 6));
        stepBatch(1);
        assert.equal(machine.alarm_active, false, machine.last_alarm);
      }
      machine.set_external_input_register(0, 0, 0, 0, false);
      runUntilTime(machine.simulated_time + 5);
      assert.ok(unfixAddresses.has("005326"),
        "Q2.7 must enter the original UNFIX routine");
      assert.equal(machine.memory_word(0o025267, machine.simulated_time).value,
        memoryBeforeSelectedCommand.get(0o025267),
        "UNFIX must restore the selected line's VORD link");
      console.log(JSON.stringify({
        selectedCommand,
        selectedObject,
        enteredFixit: true,
        enteredUnfix: true,
        fixedListChanges,
        afterUnfixListChanges: changes(memoryBeforeSelectedCommand, snapshot()),
        alarm: machine.last_alarm,
      }, null, 2));
      process.exit(0);
    }
    console.log(JSON.stringify({
      selectedCommand,
      beforeAtBits,
      selectedAtBits,
      selectedObject,
      beforeList: octal(beforeConstraintList),
      afterList: octal(machine.memory_word(0o024000, machine.simulated_time).value),
      commandEntryAddresses: [...commandEntryAddresses],
      enteredAddresses: [...enteredAddresses],
      listChanges: fixedListChanges,
      control: machine.control_state(),
      alarm: machine.last_alarm,
    }, null, 2));
    process.exit(0);
  }
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
  if (process.env.RELAX_TRACE === "1") {
    // Read-only deterministic trace of the original RELAX solver inside this
    // authentic one-line HOV constraint workflow.  The mode changes no
    // assembly word, CPU semantic, geometry, or solver behaviour.  It only
    // inspects memory and control state and moves the same FIX toggle that
    // the ordinary constraint regression below moves.
    const firstPointAddress = geometryBeforeRelax.firstAddress;
    const secondPointAddress = geometryBeforeRelax.secondAddress;
    const coordinateAddresses = {
      firstX: firstPointAddress + 0o20,
      firstY: firstPointAddress + 0o21,
      secondX: secondPointAddress + 0o20,
      secondY: secondPointAddress + 0o21,
    };
    const boundaryTable = [
      {
        kind: "relax_call",
        address: "200060",
        justification: "The ONLW equality list names this vector RELAX = 200060 "
          + "(sk2.tx2as:482) and the FIX-switch path calls it with hJPQ RELAX "
          + "(sk2.tx2as:1596); APY5 prints 200060| hJMP STARTS (sk2.tx2as:2982-2983) "
          + "and the assembled word is h JMP 12000, so the vector enters the APY5 "
          + "STARTS routine.",
      },
      {
        kind: "variable_pass_head",
        address: "012105",
        justification: "APY5 expands LGORR VCON×α =S RELB RELC (sk2.tx2as:3017) "
          + "into one pass per constraint of the relaxed variable; RELB "
          + "(sk2.tx2as:3018) assembles to ¹STE 12111 at 012105.",
      },
      {
        kind: "constraint_application",
        address: "012166",
        justification: "APY5 ADCONER (sk2.tx2as:3054) is the hJPQ ADCONER target "
          + "of RELB (sk2.tx2as:3021); it applies one constraint to the variable "
          + "and accumulates ADCSUM.",
      },
      {
        kind: "variable_store",
        address: "012235",
        justification: "The ADCON3 store STA *ADVC (sk2.tx2as:3095) probes one "
          + "variable coordinate by adding ADCONSTEP; the assembled word is "
          + "STA [12255] at 012235.",
      },
      {
        kind: "variable_store",
        address: "012257",
        justification: "The ADVC store STA *ADVC (sk2.tx2as:3117) removes the "
          + "probe and folds the measured sensitivity into ADCSUM; the assembled "
          + "word is STA [12255] at 012257.",
      },
      {
        kind: "constraint_error_store",
        address: "012214",
        justification: "ADCONER stores the constraint subroutine's standard "
          + "error in ADCSE before it builds the equation (sk2.tx2as:3075-3078).",
      },
      {
        kind: "constraint_evaluation_call",
        address: "012237",
        justification: "ADCONER calls the constraint type's runtime-selected "
          + "comparison routine once for the base error and once per probe "
          + "(sk2.tx2as:3096-3098).",
      },
      {
        kind: "constraint_coefficient_store",
        address: "012253",
        justification: "ADCONER stores one finite-difference coefficient in the "
          + "active REEQ equation (sk2.tx2as:3106-3108).",
      },
      {
        kind: "constraint_constant_store",
        address: "012274",
        justification: "ADCONER stores the accumulated equation constant in "
          + "REEQ after all variable probes complete (sk2.tx2as:3123-3129).",
      },
      {
        kind: "constraint_pass_head",
        address: "012112",
        justification: "APY5 RELC (sk2.tx2as:3023) assembles to RSX 140 (REEQ) at "
          + "012112 and ends in SOLVE|REEQ REANS (sk2.tx2as:3038).",
      },
      {
        kind: "solve_entry",
        address: "013726",
        justification: "SOLVE|P,Q dispatches a two-equation system to "
          + "hJPQ {SOLVEM|2} (sk2.tx2as:2974); the APY5 assembler listing places "
          + "that call at 012151 and the SOLVEM expansion's first word ¹STE SLVDR "
          + "at 013726.",
      },
      {
        kind: "solve_return",
        address: "012152",
        justification: "The instruction after the hJPQ SOLVEM call is the first "
          + "observable RELC instruction after SOLVEM returns.",
      },
      {
        kind: "solve_answer_dividend",
        address: "014103",
        justification: "SOLVEM SLVD1 loads one reduced equation constant before "
          + "it subtracts the saved term and divides by the diagonal "
          + "(sk2.tx2as:2822-2825).",
      },
      {
        kind: "solve_answer_division",
        address: "014105",
        justification: "SOLVEM SLVD1 divides the reduced equation value by its "
          + "diagonal to calculate one final answer (sk2.tx2as:2824-2826).",
      },
      {
        kind: "solve_answer_store",
        address: "014107",
        justification: "SOLVEM SLVD2 stores one final answer in its temporary "
          + "result vector (sk2.tx2as:2827).",
      },
      {
        kind: "solve_answer_copy",
        address: "014114",
        justification: "SOLVEM copies each temporary final answer into the REANS "
          + "result vector that RELC consumes (sk2.tx2as:2831-2833).",
      },
      {
        kind: "saved_index_restore",
        address: "012154",
        justification: "APY5 RELC2 restores gamma with REX gamma # after SOLVEM "
          + "returns (sk2.tx2as:3039); the corrected GETIX mask leaves the saved "
          + "index as a direct REX operand at this address.",
      },
      {
        kind: "solution_load",
        address: "012156",
        justification: "APY5 loads one returned answer from REANS+1 before it "
          + "computes the over-relaxed coordinate update (sk2.tx2as:3041).",
      },
      {
        kind: "solution_store",
        address: "012163",
        justification: "APY5 stores the over-relaxed answer through the variable "
          + "location chain before advancing the result index (sk2.tx2as:3047).",
      },
      {
        kind: "constraint_pass_exit",
        address: "012165",
        justification: "APY5 RELX is the saved return from the RELB and RELC "
          + "passes (sk2.tx2as:3049); reaching it after the solution store closes "
          + "this constraint pass.",
      },
      {
        kind: "relax_return",
        address: "205567",
        justification: "The acceptance path calls hJPQ RELAX at 0205566. The "
          + "instruction at 0205567 is therefore the first caller instruction "
          + "after the original RELAX invocation returns.",
      },
      {
        kind: "solve_degeneracy_test",
        address: "014073",
        justification: "SOLVEM loads the right half of SLVTS with configuration 11 "
          + "immediately before it decides whether to enter SLVAD "
          + "(sk2.tx2as:2813-2814).",
      },
      {
        kind: "solve_degeneracy_branch",
        address: "014074",
        justification: "The JNA SLVAD instruction enters the constraint-addition "
          + "path when the loaded degeneracy value is negative "
          + "(sk2.tx2as:2814).",
      },
      {
        kind: "solve_added_equation_diagonal_load",
        address: "014154",
        justification: "SLVAD2 loads the diagonal of one candidate equation "
          + "before it tests whether the equation is degenerate "
          + "(sk2.tx2as:2882-2885).",
      },
      {
        kind: "solve_added_equation_zero_branch",
        address: "014157",
        justification: "SLVAD2 jumps directly to SLVAD3 when both signed tests "
          + "find a zero diagonal, so the zero equation entry is preserved "
          + "(sk2.tx2as:2883-2890).",
      },
      {
        kind: "solve_added_equation_term_load",
        address: "014160",
        justification: "SLVAD2 loads the next non-reduced matrix term for a "
          + "nonzero diagonal (sk2.tx2as:2886).",
      },
      {
        kind: "solve_added_equation_term_multiply",
        address: "014161",
        justification: "SLVAD2 multiplies the non-reduced term by the future "
          + "diagonal stored in the active equation constant (sk2.tx2as:2887).",
      },
      {
        kind: "solve_added_equation_term_divide",
        address: "014162",
        justification: "SLVAD2 divides the scaled term by the current diagonal "
          + "to calculate the new equation entry (sk2.tx2as:2888).",
      },
      {
        kind: "solve_added_equation_store",
        address: "014164",
        justification: "SLVAD3 stores the computed entry, including zero for a "
          + "degenerate candidate equation (sk2.tx2as:2885-2890).",
      },
      {
        kind: "solve_retry_load",
        address: "014217",
        justification: "At the end of SLVAD, configuration 11 loads the right half "
          + "of SLVTS before the retry state is rotated (sk2.tx2as:2917).",
      },
      {
        kind: "solve_degeneracy_point_multiply",
        address: "014204",
        justification: "SLVAD6 multiplies one completed-equation term by the "
          + "saved original point value through a self-modified address "
          + "(sk2.tx2as:2905-2907).",
      },
      {
        kind: "solve_degeneracy_constant_store",
        address: "014207",
        justification: "SLVAD6 stores the reconstructed constant for the added "
          + "degeneracy equation (sk2.tx2as:2907-2910).",
      },
      {
        kind: "solve_retry_store",
        address: "014220",
        justification: "Configuration 17 stores the loaded degeneracy state back "
          + "to SLVTS with its two halves exchanged (sk2.tx2as:2918).",
      },
      {
        kind: "solve_elimination_head",
        address: "013767",
        justification: "The assembler listing places SLVR1-2, the elimination "
          + "head entered by the initial solve and by each repaired retry, at "
          + "013767 (sk2.tx2as:2753 and 2919).",
      },
      {
        kind: "solve_retry_tail",
        address: "014221",
        justification: "The JPQ SLVR1-2 word itself (sk2.tx2as:2919) at 014221; "
          + "its executed form names the loop head 013767 that it returns to.",
      },
    ];
    const boundaryByAddress = new Map(boundaryTable.map(
      (entry) => [Number.parseInt(entry.address, 8), entry],
    ));
    const wordAt = (address) => machine.memory_word(address, machine.simulated_time).value;
    // An address field keeps its defer bit in bit 2.9, so the named location
    // is the low 18 bits of the right half without that bit.
    const addressField = (word) => rightHalf(word) % 0o400000;
    const observedEndpoints = () => ({
      first: {
        pointAddress: octal(firstPointAddress, 6),
        x: octal(wordAt(coordinateAddresses.firstX)),
        y: octal(wordAt(coordinateAddresses.firstY)),
      },
      second: {
        pointAddress: octal(secondPointAddress, 6),
        x: octal(wordAt(coordinateAddresses.secondX)),
        y: octal(wordAt(coordinateAddresses.secondY)),
      },
    });
    const observedConstraint = () => ({
      address: octal(constraintAddress, 6),
      linkWord: octal(wordAt(constraintAddress)),
      master: octal(rightHalf(wordAt(constraintAddress)), 6),
      hovCode: octal(rightHalf(wordAt(constraintAddress + 0o14))),
    });
    const solverWordAddresses = {
      slvtr2: 0o014031,
      slvtx: 0o014036,
      slvty: 0o014037,
      slvts: 0o014040,
      slvt5: 0o013760,
      slvtr: 0o014052,
      slvtp: 0o014054,
      slvdr: 0o014117,
      slvadPointMultiply: 0o014204,
      adcse: 0o014336,
      adcsum: 0o014337,
      adceff: 0o014334,
    };
    const observedSolver = () => ({
      indexRegisters: {
        alpha: machine.index_register(0o01),
        beta: machine.index_register(0o02),
        gamma: machine.index_register(0o03),
        s: machine.index_register(0o07),
        t: machine.index_register(0o10),
        x1: machine.index_register(0o11),
        x2: machine.index_register(0o12),
        x3: machine.index_register(0o13),
        y1: machine.index_register(0o14),
      },
      arithmeticRegisters: {
        a: octal(wordAt(0o377604)),
        b: octal(wordAt(0o377605)),
        c: octal(wordAt(0o377606)),
        d: octal(wordAt(0o377607)),
        e: octal(wordAt(0o377610)),
      },
      workWords: Object.fromEntries(Object.entries(solverWordAddresses).map(
        ([name, address]) => [name, {
          address: octal(address, 6),
          value: octal(wordAt(address)),
        }],
      )),
      matrixWords: Object.fromEntries(
        [
          ...Array.from({ length: 0o11 }, (_, offset) => offset),
          ...Array.from({ length: 0o13 }, (_, offset) => 0o000076 + offset),
          ...Array.from({ length: 0o12 }, (_, offset) => 0o000107 + offset),
          ...Array.from({ length: 0o6 }, (_, offset) => 0o000140 + offset),
        ]
          .map((address) => [octal(address, 6), octal(wordAt(address))]),
      ),
    });
    const observedStore = (boundary) => {
      if (boundary.kind !== "variable_store") return null;
      // STA *ADVC defers through the ADVC cell, whose runtime-modified address
      // field plus index register 10 names the coordinate just written.
      const programWord = wordAt(Number.parseInt(boundary.address, 8));
      const pointerCell = addressField(programWord);
      const pointerCellWord = wordAt(pointerCell);
      const indexRegisterT = machine.index_register(0o10);
      return {
        programWord: octal(programWord),
        pointerCell: octal(pointerCell, 6),
        pointerCellWord: octal(pointerCellWord),
        indexRegisterT: octal(indexRegisterT, 6),
        effectiveAddress: octal(addressField(pointerCellWord) + indexRegisterT, 6),
      };
    };
    const derivedResidual = (endpoints) => {
      const delta = (axis) => Math.abs(
        Number.parseInt(endpoints.first[axis], 8) - Number.parseInt(endpoints.second[axis], 8),
      );
      return {
        x: { wordDelta: octal(delta("x")), decimal: delta("x") },
        y: { wordDelta: octal(delta("y")), decimal: delta("y") },
      };
    };
    const trace = {
      schema: "sketchpad-web/relax-hov-trace",
      schemaVersion: 4,
      generator: {
        command: "CONSTRAINT_ONLY=1 RELAX_TRACE=1 node tests/assembly-interaction.mjs",
        harness: "sketchpad-web/tests/assembly-interaction.mjs",
      },
      provenance: {
        tape: "sketchpad-web/rust/assets/sketchpad-combined.tape",
        tapeSha256: sketchpadTapeSha256,
        tapeBytes: sketchpadTapeBytes.length,
        selectCommand: selectedCommand,
        lineAddress: octal(geometryBeforeRelax.lineAddress, 6),
        endpoints: {
          first: octal(firstPointAddress, 6),
          second: octal(secondPointAddress, 6),
        },
        coordinateWords: Object.fromEntries(Object.entries(coordinateAddresses).map(
          ([name, address]) => [name, octal(address, 6)],
        )),
        tickLimit: null,
      },
      boundaries: boundaryTable,
      derived: {
        hovResidual: {
          definition: "absolute difference of the two linked coordinate words per "
            + "axis; the TX-2 stores a coordinate as one fixed-point word, so the "
            + "word difference is proportional to the coordinate difference while "
            + "both words keep the same scale",
          constrainedAxis: null,
          constrainedAxisNote: null,
        },
      },
      samples: [],
      outcome: null,
      labels: {
        observed: [
          "tick",
          "simulatedTimeSeconds",
          "boundary.instruction",
          "observed.control",
          "observed.endpoints",
          "observed.constraint",
          "observed.solver",
          "observed.store",
        ],
        derived: [
          "derived.hovResidual",
        ],
        notes: [
          "observed.control is the control state after the tick that reached the "
            + "boundary instruction, so its sequence can be a hardware display "
            + "sequence servicing the scope and its program counter can belong to "
            + "that sequence, not to RELAX.",
          "The two endpoint records are resolved once, from the selected line "
            + "record, before the traced window opens; every sample then reads the "
            + "same four coordinate words at the addresses recorded in "
            + "provenance.coordinateWords.",
          "observed.constraint reads the HOV constraint's link word, master, and "
            + "HOVCODE word directly; sk2.tx2as:380 defines HOVCODE at octal offset "
            + "14 with HORIZ = 1, VERTICAL = 2, EITHER = 0.",
          "observed.store appears only for the two STA *ADVC boundaries: "
            + "programWord is the raw instruction word, pointerCell is its deferred "
            + "address field (the ADVC cell), pointerCellWord is that cell's "
            + "runtime-modified content, and effectiveAddress is its address field "
            + "plus index register 10, which the executed instruction text confirms.",
          "One instruction can occupy two ticks, so a boundary is recorded only "
            + "when a new instruction executes.",
        ],
      },
    };
    let invocations = 0;
    let passes = 0;
    let eliminationPasses = 0;
    let degeneracyRepairs = 0;
    let coordinateChangeTicks = 0;
    let previousWords = null;
    let previousInstructionAddress = null;
    let fault = null;
    const crossings = new Map();
    const answerWordAddresses = [0o000100, 0o000101, 0o000102];
    const observedAnswers = () => Object.fromEntries(answerWordAddresses.map(
      (address) => [octal(address, 6), octal(wordAt(address))],
    ));
    const answerChanges = [];
    let previousAnswers = observedAnswers();
    const activeMatrixAddresses = Array.from(
      { length: 0o6 },
      (_, offset) => 0o000101 + offset,
    );
    const observedActiveMatrix = () => Object.fromEntries(activeMatrixAddresses.map(
      (address) => [octal(address, 6), octal(wordAt(address))],
    ));
    const matrixChanges = [];
    let previousActiveMatrix = observedActiveMatrix();
    let reachedSolveReturn = false;
    let reachedRelaxReturn = false;
    machine.set_toggle_register(0o20, 0o400, 0, 0, 0, true);
    const tickLimit = Number(process.env.RELAX_TRACE_TICKS ?? "150000");
    trace.provenance.tickLimit = tickLimit;
    let traceTick = 0;
    while (traceTick < tickLimit) {
      try {
        stepBatch(1);
      } catch (error) {
        fault = String(error);
        break;
      }
      traceTick += 1;
      const words = Object.values(coordinateAddresses).map((address) => wordAt(address)).join(",");
      if (previousWords !== null && words !== previousWords) coordinateChangeTicks += 1;
      previousWords = words;
      const state = machine.control_state();
      const answers = observedAnswers();
      if (Object.keys(answers).some((address) => answers[address] !== previousAnswers[address])) {
        answerChanges.push({
          tick: traceTick,
          instruction: {
            address: octal(state.instruction_address, 6),
            text: state.instruction,
          },
          before: previousAnswers,
          after: answers,
        });
      }
      previousAnswers = answers;
      const activeMatrix = observedActiveMatrix();
      if (Object.keys(activeMatrix).some(
        (address) => activeMatrix[address] !== previousActiveMatrix[address],
      )) {
        matrixChanges.push({
          tick: traceTick,
          instruction: {
            address: octal(state.instruction_address, 6),
            text: state.instruction,
          },
          before: previousActiveMatrix,
          after: activeMatrix,
        });
      }
      previousActiveMatrix = activeMatrix;
      // One instruction can occupy two ticks; record a boundary only when a
      // new instruction executes, so a two-tick instruction yields one sample.
      const isNewInstruction = state.instruction_address !== previousInstructionAddress;
      previousInstructionAddress = state.instruction_address;
      if (!isNewInstruction) continue;
      const boundary = boundaryByAddress.get(state.instruction_address);
      if (boundary === undefined) continue;
      if (boundary.kind === "relax_call") invocations += 1;
      if (boundary.kind === "variable_pass_head") passes += 1;
      if (boundary.kind === "solve_elimination_head") eliminationPasses += 1;
      if (boundary.kind === "solve_retry_tail") degeneracyRepairs += 1;
      crossings.set(boundary.address, (crossings.get(boundary.address) ?? 0) + 1);
      const endpoints = observedEndpoints();
      trace.samples.push({
        index: trace.samples.length,
        invocation: invocations,
        pass: passes,
        eliminationPass: eliminationPasses,
        degeneracyRepairs,
        boundary: {
          kind: boundary.kind,
          address: boundary.address,
          instruction: state.instruction,
        },
        tick: traceTick,
        simulatedTimeSeconds: machine.simulated_time,
        observed: {
          control: {
            sequence: state.sequence,
            programCounter: octal(state.program_counter, 6),
          },
          endpoints,
          constraint: observedConstraint(),
          solver: observedSolver(),
          store: observedStore(boundary),
        },
        derived: {
          hovResidual: derivedResidual(endpoints),
        },
      });
      if (boundary.kind === "solve_return") {
        reachedSolveReturn = true;
      }
      if (boundary.kind === "relax_return") {
        reachedRelaxReturn = true;
        break;
      }
    }
    machine.set_toggle_register(0o20, 0o400, 0, 0, 0, false);
    const endState = machine.control_state();
    trace.outcome = {
      kind: reachedRelaxReturn ? "relax_return" : (fault === null ? "tick_limit" : "machine_fault"),
      tick: traceTick,
      simulatedTimeSeconds: machine.simulated_time,
      completedSolve: reachedSolveReturn,
      completedRelax: reachedRelaxReturn,
      eliminationPasses,
      degeneracyRepairs,
      answerChanges,
      matrixChanges,
      observedCoordinateChangeTicks: coordinateChangeTicks,
      endCoordinateWords: Object.fromEntries(Object.entries(coordinateAddresses).map(
        ([name, address]) => [name, octal(wordAt(address))],
      )),
      boundaryCrossings: boundaryTable.map((boundary) => ({
        kind: boundary.kind,
        address: boundary.address,
        crossings: crossings.get(boundary.address) ?? 0,
      })),
      lastInstruction: {
        address: octal(endState.instruction_address, 6),
        instruction: endState.instruction,
      },
      fault,
    };
    const finalHovCode = trace.samples.at(-1).observed.constraint.hovCode;
    const constrainedAxis = finalHovCode === "000000000001" ? "x" : "y";
    trace.derived.hovResidual.constrainedAxis = constrainedAxis;
    trace.derived.hovResidual.constrainedAxisNote = "the constraint enters with HOVCODE 0 "
      + `(EITHER) and the original comparison routine changes it to ${finalHovCode}; the `
      + `completed solve makes the two observed ${constrainedAxis} words equal`;
    const crossed = (kind) => trace.samples.some(
      (sample) => sample.boundary.kind === kind,
    );
    assert.ok(crossed("relax_call"),
      "the traced workflow must call the original RELAX vector at 0200060");
    assert.ok(crossed("variable_pass_head"),
      "the traced RELAX invocation must open one RELB pass");
    assert.ok(crossed("constraint_application"),
      "the traced RELB pass must apply the constraint through ADCONER");
    assert.ok(crossed("variable_store"),
      "the traced RELAX invocation must write a constrained coordinate");
    assert.ok(crossed("constraint_pass_head"),
      "the traced RELAX invocation must open the RELC solve pass");
    assert.ok(crossed("solve_entry"),
      "the traced RELC pass must enter the original SOLVEM expansion");
    assert.ok(crossed("solve_return"),
      "the traced SOLVEM expansion must return to RELC");
    assert.ok(crossed("saved_index_restore"),
      "the traced RELC pass must restore its saved result index");
    assert.ok(crossed("solution_store"),
      "the traced RELC pass must apply a returned answer");
    assert.ok(crossed("relax_return"),
      "the traced RELAX invocation must return to its caller");
    // The artifact is large enough that a plain process.exit can cut the
    // pipe before Node flushes stdout, so exit from the write callback and
    // never fall through into the ordinary constraint regression.
    await new Promise((resolve) => {
      process.stdout.write(`${JSON.stringify(trace, null, 2)}\n`, resolve);
    });
    process.exit(0);
  }
  machine.set_toggle_register(0o20, 0o400, 0, 0, 0, true);
  const relaxDeadline = machine.simulated_time + 200;
  let enteredRelax = false;
  let enteredSolve = false;
  let probeChangeTicks = 0;
  let previousGeometry = geometryBeforeRelax;
  let geometryAfterProbes = geometryBeforeRelax;
  while (!enteredSolve && machine.simulated_time < relaxDeadline) {
    stepBatch(1);
    assert.equal(machine.alarm_active, false, machine.last_alarm);
    const state = machine.control_state();
    if (state.instruction_address === 0o200060) enteredRelax = true;
    if (state.instruction_address === 0o013726) enteredSolve = true;
    geometryAfterProbes = lineGeometry(selectedLineWord);
    const changedThisTick = (
      geometryAfterProbes.first.some((value, index) => value !== previousGeometry.first[index])
      || geometryAfterProbes.second.some((value, index) => value !== previousGeometry.second[index])
    );
    if (changedThisTick) probeChangeTicks += 1;
    previousGeometry = geometryAfterProbes;
  }
  machine.set_toggle_register(0o20, 0o400, 0, 0, 0, false);
  const afterConstraintList = machine.memory_word(0o024000, machine.simulated_time).value;
  const constraintObject = Array.from({ length: 0o24 }, (_, offset) =>
    machine.memory_word(constraintAddress + offset, machine.simulated_time).value);
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
    enteredSolve,
    probeChangeTicks,
    geometryBeforeRelax: geometryForReport(geometryBeforeRelax),
    geometryAfterProbes: geometryForReport(geometryAfterProbes),
    controlAfterConstraint: machine.control_state(),
    alarm: machine.last_alarm,
  }, null, 2));
  assert.equal(afterConstraintList, Number(beforeConstraintList) + 0o16,
    "TRUEUP must allocate one HOV constraint block");
  assert.equal(returnedFromTrueup, true, "the original TRUEUP routine must return");
  assert.equal(rightHalf(constraintObject[0]), 0o561,
    "the new constraint must use the HOV master");
  assert.equal(enteredRelax, true, "the enabled FIX toggle must call the original RELAX routine");
  assert.equal(enteredSolve, true, "the RELAX path must enter the original SOLVEM expansion");
  assert.equal(probeChangeTicks, 4,
    "ADCONER must make and remove one finite-difference probe on each coordinate");
  assert.deepEqual(geometryAfterProbes, geometryBeforeRelax,
    "the finite-difference probes must restore the line before SOLVEM starts");
}
