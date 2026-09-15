export function displayTime(sourceEpoch, realEpoch, realNow) {
  if (sourceEpoch === null || realEpoch === null) {
    return null;
  }
  return sourceEpoch + (realNow - realEpoch);
}

export function axisPosition(value, movedOrigin, extent) {
  const normalized = movedOrigin ? value / 511 : (value + 511) / 1022;
  const lastPixel = Math.max(0, extent - 1);
  return Math.max(0, Math.min(lastPixel, normalized * lastPixel));
}

export function scopePointPosition(event, width, height) {
  const leftOrigin = event.origin === "left_center" || event.origin === "lower_left";
  const bottomOrigin = event.origin === "bottom_center" || event.origin === "lower_left";
  const lastCanvasRow = Math.max(0, height - 1);
  return {
    x: axisPosition(event.x, leftOrigin, width),
    y: lastCanvasRow - axisPosition(event.y, bottomOrigin, height),
  };
}
