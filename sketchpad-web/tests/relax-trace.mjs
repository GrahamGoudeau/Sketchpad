import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

// Validate the deterministic RELAX trace that the assembly harness emits in
// RELAX_TRACE mode, and prove that the checked-in artifact is exactly what the
// harness produces from the checked-in tape.  Run with RELAX_TRACE_UPDATE=1 to
// rewrite the artifact after an intentional machine or assembly change.

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const artifactPath = join(packageRoot, "evidence", "relax-hov-trace.json");
const tapePath = join(packageRoot, "rust", "assets", "sketchpad-combined.tape");
const parseOctal = (text) => Number.parseInt(text, 8);
const octal = (value, width = 12) => value.toString(8).padStart(width, "0");
const ADVC_POINTER_CELL = "012255";

const { stdout } = await run(process.execPath, ["tests/assembly-interaction.mjs"], {
  cwd: packageRoot,
  env: { ...process.env, CONSTRAINT_ONLY: "1", RELAX_TRACE: "1" },
  maxBuffer: 64 * 1024 * 1024,
});
const trace = JSON.parse(stdout);

assert.equal(trace.schema, "sketchpad-web/relax-hov-trace", "the trace must declare its schema");
assert.equal(trace.schemaVersion, 3, "the trace must declare a known schema version");
assert.ok(Array.isArray(trace.samples) && trace.samples.length > 0,
  "the trace must contain samples");

// Provenance: the trace must name the tape it ran, and that name must be the
// tape this package actually ships.
const tapeBytes = await readFile(tapePath);
assert.equal(trace.provenance.tape, "sketchpad-web/rust/assets/sketchpad-combined.tape",
  "the trace must name the checked-in tape");
assert.equal(
  trace.provenance.tapeSha256,
  createHash("sha256").update(tapeBytes).digest("hex"),
  "the traced tape hash must match the checked-in tape",
);
assert.equal(trace.provenance.tapeBytes, tapeBytes.length,
  "the traced tape length must match the checked-in tape");
assert.ok(Number.isInteger(trace.provenance.tickLimit) && trace.provenance.tickLimit > 0,
  "the trace must record its tick window");
for (const address of Object.values(trace.provenance.coordinateWords)) {
  assert.ok(/^[0-7]{6}$/.test(address),
    `provenance coordinate word address ${address} must be six octal digits`);
}

// Every boundary must be a justified, distinct, octal control-flow address, and
// the variable stores must be the two STA *ADVC boundaries of ADCON3 and ADVC.
const boundaryByAddress = new Map(trace.boundaries.map((entry) => [entry.address, entry]));
assert.equal(boundaryByAddress.size, trace.boundaries.length, "boundary addresses must be distinct");
for (const entry of trace.boundaries) {
  assert.ok(/^[0-7]{6}$/.test(entry.address), `boundary address ${entry.address} must be octal`);
  assert.equal(typeof entry.justification, "string");
  assert.ok(entry.justification.length > 0, "each boundary needs a justification");
}
assert.deepEqual(
  trace.boundaries.filter((entry) => entry.kind === "variable_store").map((entry) => entry.address),
  ["012235", "012257"],
  "the two variable stores must be the ADCON3 and ADVC STA *ADVC boundaries",
);

let previousTick = 0;
let previousPass = 0;
let previousEliminationPass = 0;
let previousDegeneracyRepairs = 0;
const crossingsByAddress = new Map();
for (const sample of trace.samples) {
  assert.equal(sample.index, trace.samples.indexOf(sample), "sample indexes must be sequential");
  assert.ok(sample.tick > previousTick, "sample ticks must strictly increase");
  assert.ok(sample.invocation >= 1, "samples must belong to a RELAX invocation");
  assert.ok(sample.pass >= previousPass, "solver pass indexes must not decrease");
  assert.ok(sample.eliminationPass >= previousEliminationPass,
    "elimination pass indexes must not decrease");
  assert.ok(sample.degeneracyRepairs >= previousDegeneracyRepairs,
    "degeneracy repair indexes must not decrease");
  previousTick = sample.tick;
  previousPass = sample.pass;
  previousEliminationPass = sample.eliminationPass;
  previousDegeneracyRepairs = sample.degeneracyRepairs;

  assert.ok(boundaryByAddress.has(sample.boundary.address),
    "each sample boundary must come from the declared boundary table");
  const boundary = boundaryByAddress.get(sample.boundary.address);
  assert.equal(boundary.kind, sample.boundary.kind,
    "each sample must carry its boundary's declared kind");
  assert.equal(typeof sample.boundary.instruction, "string");
  assert.ok(sample.boundary.instruction.length > 0,
    "each sample must record the executed instruction text");
  assert.ok(Number.isFinite(sample.simulatedTimeSeconds) && sample.simulatedTimeSeconds > 0,
    "each sample must carry simulated time in seconds");
  crossingsByAddress.set(
    sample.boundary.address,
    (crossingsByAddress.get(sample.boundary.address) ?? 0) + 1,
  );

  assert.ok(Number.isInteger(sample.observed.control.sequence),
    "each sample must record the control sequence");
  assert.ok(/^[0-7]{6}$/.test(sample.observed.control.programCounter),
    "the control program counter must be six octal digits");
  const endpoints = sample.observed.endpoints;
  assert.equal(endpoints.first.pointAddress, trace.provenance.endpoints.first,
    "every sample must read the same first endpoint record");
  assert.equal(endpoints.second.pointAddress, trace.provenance.endpoints.second,
    "every sample must read the same second endpoint record");
  for (const endpoint of [endpoints.first, endpoints.second]) {
    assert.ok(/^[0-7]{12}$/.test(endpoint.x), "coordinate words must be 12 octal digits");
    assert.ok(/^[0-7]{12}$/.test(endpoint.y), "coordinate words must be 12 octal digits");
  }

  const constraint = sample.observed.constraint;
  assert.ok(/^[0-7]{12}$/.test(constraint.linkWord),
    "the constraint link word must be 12 octal digits");
  assert.equal(constraint.master, "000561",
    "every sample must see the HOV master 0561 on the constraint record");
  assert.equal(constraint.hovCode, "000000000000",
    "the HOVCODE word must stay 0 (EITHER, sk2.tx2as:380) throughout the window");

  const solver = sample.observed.solver;
  for (const value of Object.values(solver.indexRegisters)) {
    assert.ok(Number.isInteger(value), "solver index registers must be integers");
  }
  for (const value of Object.values(solver.arithmeticRegisters)) {
    assert.ok(/^[0-7]{12}$/.test(value), "solver arithmetic registers must be octal words");
  }
  for (const word of Object.values(solver.workWords)) {
    assert.ok(/^[0-7]{6}$/.test(word.address), "solver work-word addresses must be octal");
    assert.ok(/^[0-7]{12}$/.test(word.value), "solver work words must be octal");
  }
  for (const [address, value] of Object.entries(solver.matrixWords)) {
    assert.ok(/^[0-7]{6}$/.test(address), "solver matrix addresses must be octal");
    assert.ok(/^[0-7]{12}$/.test(value), "solver matrix words must be octal");
  }

  // Only the STA *ADVC boundaries may record a store, and its decoded target
  // must be the coordinate that the executed instruction just wrote.
  assert.equal(
    sample.observed.store === null,
    sample.boundary.kind !== "variable_store",
    "only variable stores may record a store observation",
  );
  if (sample.observed.store !== null) {
    const store = sample.observed.store;
    assert.ok(/^[0-7]{12}$/.test(store.programWord),
      "the store program word must be 12 octal digits");
    assert.equal(store.pointerCell, ADVC_POINTER_CELL,
      "the STA *ADVC boundaries must defer through the ADVC cell at 012255");
    assert.ok(/^[0-7]{12}$/.test(store.pointerCellWord),
      "the ADVC cell word must be 12 octal digits");
    const executedTarget = sample.boundary.instruction.match(/([0-7]+)\s*$/);
    assert.ok(executedTarget !== null,
      "the executed store instruction must name an octal target address");
    assert.equal(parseOctal(store.effectiveAddress), parseOctal(executedTarget[1]),
      `the decoded store target ${store.effectiveAddress} must match the executed instruction`);
  }

  // The derived HOV residual must be exactly the word difference of the two
  // observed coordinate words, so the derivation stays checkable.
  for (const axis of ["x", "y"]) {
    const first = parseOctal(endpoints.first[axis]);
    const second = parseOctal(endpoints.second[axis]);
    const residual = sample.derived.hovResidual[axis];
    assert.equal(residual.decimal, Math.abs(first - second),
      `the ${axis} residual must be the observed word difference`);
    assert.equal(residual.wordDelta, octal(Math.abs(first - second)),
      `the ${axis} residual must print its word delta in octal`);
  }
}

assert.equal(trace.samples[0].boundary.kind, "relax_call",
  "the trace must open at the RELAX call vector");
for (const kind of [
  "variable_pass_head",
  "constraint_application",
  "variable_store",
  "constraint_pass_head",
  "solve_entry",
  "solve_elimination_head",
  "solve_degeneracy_test",
  "solve_degeneracy_branch",
  "solve_retry_load",
  "solve_retry_store",
  "solve_retry_tail",
  "solve_return",
]) {
  assert.ok(trace.samples.some((sample) => sample.boundary.kind === kind),
    `the trace must record the ${kind} boundary`);
}

// The outcome must account for every boundary and for the whole window.
const outcome = trace.outcome;
assert.equal(outcome.kind, "solve_return",
  "the trace must end when SOLVEM returns to RELC");
assert.equal(outcome.completedSolve, true,
  "the outcome must mark the original SOLVEM call complete");
assert.equal(typeof outcome.simulatedTimeSeconds, "number");
assert.ok(outcome.tick <= trace.provenance.tickLimit,
  "the outcome tick cannot exceed the traced window");
assert.deepEqual(
  outcome.boundaryCrossings,
  trace.boundaries.map((boundary) => ({
    kind: boundary.kind,
    address: boundary.address,
    crossings: crossingsByAddress.get(boundary.address) ?? 0,
  })),
  "the outcome must count exactly the crossings the samples record",
);
assert.ok(/^[0-7]{6}$/.test(outcome.lastInstruction.address),
  "the outcome must name the last instruction address in octal");

// The solver performs one initial elimination pass and one repaired retry.
const solveEliminationHeadCrossings = crossingsByAddress.get("013770") ?? 0;
const solveRetryTailCrossings = crossingsByAddress.get("014222") ?? 0;
assert.equal(solveEliminationHeadCrossings, 2,
  "the trace must contain the initial elimination pass and one repaired retry");
assert.equal(solveRetryTailCrossings, 1,
  "one degeneracy repair must return to the elimination head");
assert.equal(outcome.eliminationPasses, 2,
  "the outcome must count both elimination passes");
assert.equal(outcome.degeneracyRepairs, 1,
  "the outcome must count the one completed degeneracy repair");

// The window's measured solver progress: only the two ADCON3 probes and their
// removals may change the endpoint words. The trace stops at SOLVEM's return,
// before RELC applies the returned answer to the endpoint coordinates.
assert.equal(outcome.observedCoordinateChangeTicks, 4,
  "the two ADCON3 probes and their removals must be the only coordinate changes");
const firstSample = trace.samples[0].observed.endpoints;
for (const [name, word] of Object.entries(outcome.endCoordinateWords)) {
  const axis = name.endsWith("X") ? "x" : "y";
  const endpoint = name.startsWith("first") ? firstSample.first : firstSample.second;
  assert.equal(word, endpoint[axis],
    `the window must end with ${name} unchanged before RELC applies the answer`);
}

if (process.env.RELAX_TRACE_UPDATE === "1") {
  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, stdout);
} else {
  const artifact = await readFile(artifactPath, "utf8");
  assert.equal(stdout, artifact,
    "the harness output must reproduce the checked-in relax trace byte for byte");
  console.log(
    `relax trace: ${trace.samples.length} samples match ${artifactPath}`,
  );
}
