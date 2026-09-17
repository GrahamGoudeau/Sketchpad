const SVG_NS = "http://www.w3.org/2000/svg";

export function parseOctalWord(value) {
  return Number.parseInt(value, 8);
}

export function phaseForBoundary(kind) {
  if (kind === "relax_call") return "ENTER RELAX";
  if (kind.startsWith("constraint_") || kind === "variable_pass_head" || kind === "variable_store") {
    return "MEASURE CONSTRAINT";
  }
  if (kind === "solve_entry" || kind === "solve_elimination_head") return "ELIMINATE";
  if (kind.startsWith("solve_degeneracy") || kind.startsWith("solve_added") || kind.startsWith("solve_retry")) {
    return "REPAIR DEGENERACY";
  }
  if (kind.startsWith("solve_answer")) return "BACK-SUBSTITUTE";
  if (kind === "solve_return" || kind === "saved_index_restore" || kind.startsWith("solution_")) {
    return "APPLY ANSWER";
  }
  if (kind === "constraint_pass_exit") return "CLOSE PASS";
  if (kind === "relax_return") return "RETURN";
  return kind.replaceAll("_", " ").toUpperCase();
}

function endpoint(sample, name) {
  const value = sample.observed.endpoints[name];
  return { x: parseOctalWord(value.x), y: parseOctalWord(value.y) };
}

export function createTraceModel(trace) {
  if (trace.schema !== "sketchpad-web/relax-hov-trace" || trace.schemaVersion !== 4) {
    throw new Error("The RELAX trace schema is not supported.");
  }
  if (!Array.isArray(trace.samples) || trace.samples.length === 0) {
    throw new Error("The RELAX trace contains no samples.");
  }

  const coordinates = trace.samples.flatMap((sample) => [endpoint(sample, "first"), endpoint(sample, "second")]);
  const xs = coordinates.map((point) => point.x);
  const ys = coordinates.map((point) => point.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xPadding = Math.max(1, (xMax - xMin) * 0.12);
  const yPadding = Math.max(1, (yMax - yMin) * 0.12);

  return {
    trace,
    samples: trace.samples,
    maxPass: Math.max(...trace.samples.map((sample) => sample.pass)),
    maxResidual: Math.max(...trace.samples.map((sample) => sample.derived.hovResidual.x.decimal), 1),
    bounds: {
      xMin: xMin - xPadding,
      xMax: xMax + xPadding,
      yMin: yMin - yPadding,
      yMax: yMax + yPadding,
    },
  };
}

function initializeViewer() {
  const plot = document.querySelector("#relax-plot");
  if (!plot) return;

  const nodes = {
    phase: document.querySelector("#relax-phase"),
    pass: document.querySelector("#relax-pass"),
    residual: document.querySelector("#relax-residual"),
    tick: document.querySelector("#relax-tick"),
    firstTrail: document.querySelector("#relax-first-trail"),
    secondTrail: document.querySelector("#relax-second-trail"),
    initialLine: document.querySelector("#relax-initial-line"),
    currentLine: document.querySelector("#relax-current-line"),
    firstPoint: document.querySelector("#relax-first-point"),
    secondPoint: document.querySelector("#relax-second-point"),
    firstLabel: document.querySelector("#relax-first-label"),
    secondLabel: document.querySelector("#relax-second-label"),
    residualStrip: document.querySelector("#relax-residual-strip"),
    cursor: document.querySelector("#relax-cursor"),
    previous: document.querySelector("#relax-previous"),
    play: document.querySelector("#relax-play"),
    next: document.querySelector("#relax-next"),
    step: document.querySelector("#relax-step"),
    stepOutput: document.querySelector("#relax-step-output"),
    detail: document.querySelector("#relax-detail"),
  };
  let model = null;
  let currentIndex = 0;
  let playback = null;

  const plotPoint = (point) => {
    const { xMin, xMax, yMin, yMax } = model.bounds;
    return {
      x: 70 + ((point.x - xMin) / (xMax - xMin)) * 870,
      y: 390 - ((point.y - yMin) / (yMax - yMin)) * 340,
    };
  };

  const setLine = (node, first, second) => {
    node.setAttribute("x1", first.x);
    node.setAttribute("y1", first.y);
    node.setAttribute("x2", second.x);
    node.setAttribute("y2", second.y);
  };

  const trailPath = (name, index) => model.samples.slice(0, index + 1)
    .map((sample, sampleIndex) => {
      const point = plotPoint(endpoint(sample, name));
      return `${sampleIndex === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    })
    .join(" ");

  const stop = () => {
    if (playback !== null) window.clearInterval(playback);
    playback = null;
    nodes.play.textContent = "PLAY";
  };

  const render = (index) => {
    currentIndex = Math.max(0, Math.min(index, model.samples.length - 1));
    const sample = model.samples[currentIndex];
    const first = plotPoint(endpoint(sample, "first"));
    const second = plotPoint(endpoint(sample, "second"));
    const initialFirst = plotPoint(endpoint(model.samples[0], "first"));
    const initialSecond = plotPoint(endpoint(model.samples[0], "second"));

    setLine(nodes.initialLine, initialFirst, initialSecond);
    setLine(nodes.currentLine, first, second);
    nodes.firstTrail.setAttribute("d", trailPath("first", currentIndex));
    nodes.secondTrail.setAttribute("d", trailPath("second", currentIndex));
    for (const [node, point] of [[nodes.firstPoint, first], [nodes.secondPoint, second]]) {
      node.setAttribute("cx", point.x);
      node.setAttribute("cy", point.y);
    }
    for (const [node, point] of [[nodes.firstLabel, first], [nodes.secondLabel, second]]) {
      node.setAttribute("x", point.x + 14);
      node.setAttribute("y", point.y - 14);
    }

    const cursorX = 70 + (currentIndex / Math.max(1, model.samples.length - 1)) * 870;
    nodes.cursor.setAttribute("x1", cursorX);
    nodes.cursor.setAttribute("x2", cursorX);
    nodes.phase.textContent = phaseForBoundary(sample.boundary.kind);
    nodes.pass.textContent = sample.pass === 0 ? "—" : `${sample.pass} / ${model.maxPass}`;
    nodes.residual.textContent = sample.derived.hovResidual.x.wordDelta;
    nodes.tick.textContent = sample.tick.toLocaleString("en-US");
    nodes.step.value = String(currentIndex);
    nodes.stepOutput.value = `${currentIndex + 1} / ${model.samples.length}`;
    nodes.previous.disabled = currentIndex === 0;
    nodes.next.disabled = currentIndex === model.samples.length - 1;
    nodes.detail.textContent = `${sample.boundary.instruction} · ${sample.boundary.kind.replaceAll("_", " ")} · P1 (${sample.observed.endpoints.first.x}, ${sample.observed.endpoints.first.y}) · P2 (${sample.observed.endpoints.second.x}, ${sample.observed.endpoints.second.y})`;
    plot.setAttribute(
      "aria-label",
      `${phaseForBoundary(sample.boundary.kind)}. Trace step ${currentIndex + 1} of ${model.samples.length}. X residual ${sample.derived.hovResidual.x.wordDelta}.`,
    );
  };

  const buildResidualStrip = () => {
    nodes.residualStrip.replaceChildren();
    const width = 870 / model.samples.length;
    for (const [index, sample] of model.samples.entries()) {
      const rect = document.createElementNS(SVG_NS, "rect");
      const strength = Math.sqrt(sample.derived.hovResidual.x.decimal / model.maxResidual);
      rect.setAttribute("x", 70 + index * width);
      rect.setAttribute("y", 420);
      rect.setAttribute("width", width + 0.4);
      rect.setAttribute("height", 50);
      rect.setAttribute("fill", `rgb(145 255 181 / ${0.1 + strength * 0.8})`);
      nodes.residualStrip.append(rect);
    }
  };

  fetch("./relax-hov-trace.json")
    .then((response) => {
      if (!response.ok) throw new Error(`Trace request failed with ${response.status}.`);
      return response.json();
    })
    .then((trace) => {
      model = createTraceModel(trace);
      nodes.step.max = String(model.samples.length - 1);
      for (const node of [nodes.previous, nodes.play, nodes.next, nodes.step]) node.disabled = false;
      buildResidualStrip();
      render(0);
    })
    .catch((error) => {
      nodes.phase.textContent = "TRACE ERROR";
      nodes.detail.textContent = String(error);
    });

  nodes.previous.addEventListener("click", () => {
    stop();
    render(currentIndex - 1);
  });
  nodes.next.addEventListener("click", () => {
    stop();
    render(currentIndex + 1);
  });
  nodes.step.addEventListener("input", () => {
    stop();
    render(Number(nodes.step.value));
  });
  nodes.play.addEventListener("click", () => {
    if (playback !== null) {
      stop();
      return;
    }
    if (currentIndex === model.samples.length - 1) render(0);
    nodes.play.textContent = "PAUSE";
    playback = window.setInterval(() => {
      if (currentIndex >= model.samples.length - 1) {
        stop();
        return;
      }
      render(currentIndex + 1);
    }, 240);
  });
}

if (typeof document !== "undefined") initializeViewer();
