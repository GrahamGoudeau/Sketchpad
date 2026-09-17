export const PEN_SCALE = 1_000_000;
export const PEN_STATE_LENGTH = 9;

export const PEN_INDEX = Object.freeze({
  sequence: 0,
  x: 1,
  y: 2,
  radius: 3,
  active: 4,
  sentSeconds: 5,
  sentMicros: 6,
  appliedSequence: 7,
  latencyMicros: 8,
});

export function encodePenValue(value) {
  return Math.round(Math.max(0, Math.min(1, value)) * PEN_SCALE);
}

export function decodePenValue(value) {
  return value / PEN_SCALE;
}

export function writeSharedPen(view, state, sequence, absoluteMilliseconds) {
  const seconds = Math.floor(absoluteMilliseconds / 1000);
  const micros = Math.round((absoluteMilliseconds - seconds * 1000) * 1000);
  Atomics.store(view, PEN_INDEX.x, encodePenValue(state.x));
  Atomics.store(view, PEN_INDEX.y, encodePenValue(state.y));
  Atomics.store(view, PEN_INDEX.radius, encodePenValue(state.radius));
  Atomics.store(view, PEN_INDEX.active, state.active ? 1 : 0);
  Atomics.store(view, PEN_INDEX.sentSeconds, seconds);
  Atomics.store(view, PEN_INDEX.sentMicros, micros);
  Atomics.store(view, PEN_INDEX.sequence, sequence);
}

export function readSharedPen(view) {
  return {
    sequence: Atomics.load(view, PEN_INDEX.sequence),
    x: decodePenValue(Atomics.load(view, PEN_INDEX.x)),
    y: decodePenValue(Atomics.load(view, PEN_INDEX.y)),
    radius: decodePenValue(Atomics.load(view, PEN_INDEX.radius)),
    active: Atomics.load(view, PEN_INDEX.active) !== 0,
    sentSeconds: Atomics.load(view, PEN_INDEX.sentSeconds),
    sentMicros: Atomics.load(view, PEN_INDEX.sentMicros),
  };
}

export function recordSharedPenApplication(view, pen, absoluteMilliseconds) {
  const seconds = Math.floor(absoluteMilliseconds / 1000);
  const micros = Math.round((absoluteMilliseconds - seconds * 1000) * 1000);
  const latencyMicros = Math.max(
    0,
    (seconds - pen.sentSeconds) * 1_000_000 + micros - pen.sentMicros,
  );
  Atomics.store(view, PEN_INDEX.latencyMicros, latencyMicros);
  Atomics.store(view, PEN_INDEX.appliedSequence, pen.sequence);
}

export function readSharedPenApplication(view) {
  return {
    sequence: Atomics.load(view, PEN_INDEX.appliedSequence),
    latencyMilliseconds: Atomics.load(view, PEN_INDEX.latencyMicros) / 1000,
  };
}
