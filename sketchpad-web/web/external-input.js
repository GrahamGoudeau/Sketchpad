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
