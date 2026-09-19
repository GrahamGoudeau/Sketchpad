export class HeldControls {
  constructor() {
    this.owners = new Map();
  }

  set(control, owner, held) {
    let owners = this.owners.get(control);
    if (held) {
      if (!owners) {
        owners = new Set();
        this.owners.set(control, owners);
      }
      owners.add(owner);
    } else if (owners) {
      owners.delete(owner);
      if (owners.size === 0) this.owners.delete(control);
    }
  }

  has(control) {
    return this.owners.has(control);
  }

  values() {
    return this.owners.keys();
  }

  clear() {
    this.owners.clear();
  }
}

export function drawKeyTransitions(held) {
  return held
    ? [
        { command: "STOPMOVEP", held: false },
        { command: "STARTDRAW", held: true },
      ]
    : [
        { command: "STARTDRAW", held: false },
        { command: "STOPMOVEP", held: true },
      ];
}

export function drawCanStart(penActive, penInitialized) {
  return penActive && penInitialized;
}

export function sketchpadToggleState({
  drawCycle,
  solve,
  showBlocks,
  showConstraints,
  showPoints,
  showTypicalVariables,
  suppressLines,
  constraintCode,
}) {
  if (!Number.isInteger(constraintCode) || constraintCode < 0 || constraintCode > 0o777) {
    throw new RangeError("the Sketchpad constraint code must fit one TX-2 quarter");
  }
  let register25Quarter4 = 0;
  if (showBlocks) register25Quarter4 |= 0o400;
  if (showConstraints) register25Quarter4 |= 0o200;
  if (showPoints) register25Quarter4 |= 0o100;
  if (suppressLines) register25Quarter4 |= 0o010;
  return {
    register20: {
      quarters: [drawCycle ? 0o400 : 0, 0, 0, 0],
      meta: solve,
    },
    register25: {
      quarters: [register25Quarter4, showTypicalVariables ? 0o400 : 0, 0, constraintCode],
      meta: false,
    },
  };
}
