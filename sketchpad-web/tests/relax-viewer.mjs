import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createTraceModel,
  parseOctalWord,
  phaseForBoundary,
} from "../web/relax-viewer.js";

const here = dirname(fileURLToPath(import.meta.url));
const trace = JSON.parse(await readFile(join(here, "..", "evidence", "relax-hov-trace.json"), "utf8"));
const model = createTraceModel(trace);

assert.equal(model.samples.length, 104, "the viewer must expose every checked-in trace sample");
assert.equal(model.maxPass, 2, "the viewer must expose both endpoint passes");
assert.ok(model.maxResidual > 0, "the viewer must scale a nonzero residual");
assert.ok(model.bounds.xMin < model.bounds.xMax, "the viewer must calculate a usable x scale");
assert.ok(model.bounds.yMin < model.bounds.yMax, "the viewer must calculate a usable y scale");
assert.equal(phaseForBoundary(model.samples[0].boundary.kind), "ENTER RELAX");
assert.equal(phaseForBoundary(model.samples.at(-1).boundary.kind), "RETURN");
assert.equal(phaseForBoundary("solve_added_equation_store"), "REPAIR DEGENERACY");
assert.equal(phaseForBoundary("solve_answer_store"), "BACK-SUBSTITUTE");
assert.equal(parseOctalWord("000040104003"), 0o40104003);
assert.throws(
  () => createTraceModel({ schema: trace.schema, schemaVersion: 3, samples: trace.samples }),
  /not supported/,
  "the viewer must reject a trace with unknown semantics",
);

console.log(`relax viewer: ${model.samples.length} samples across ${model.maxPass} passes`);
