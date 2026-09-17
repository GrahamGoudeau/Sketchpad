export function displayTime(sourceEpoch, realEpoch, realNow) {
  if (sourceEpoch === null || realEpoch === null) {
    return null;
  }
  return sourceEpoch + (realNow - realEpoch);
}

export function phosphorFade(elapsedSeconds, persistenceSeconds = 2) {
  const elapsed = Math.max(0, elapsedSeconds);
  const persistence = Math.max(Number.EPSILON, persistenceSeconds);
  const visibleAtPersistence = 1 / 64;
  return Math.min(0.995, 1 - Math.pow(visibleAtPersistence, elapsed / persistence));
}

export function lightPenDetectionRadius(
  configuredRadius,
  lost,
  acquisitionRadius = 40 / 1022,
) {
  return lost ? Math.max(configuredRadius, acquisitionRadius) : configuredRadius;
}

export function axisPosition(physicalCoordinate, extent) {
  const normalized = physicalCoordinate / 1022;
  const lastPixel = Math.max(0, extent - 1);
  return Math.max(0, Math.min(lastPixel, normalized * lastPixel));
}

export function scopePointPosition(event, width, height) {
  const lastCanvasRow = Math.max(0, height - 1);
  return {
    x: axisPosition(event.physical_x, width),
    y: lastCanvasRow - axisPosition(event.physical_y, height),
  };
}

export function lightPenStatus(
  active,
  lost,
  initialized = true,
  lostForMilliseconds = Number.POSITIVE_INFINITY,
  lossDelayMilliseconds = 150,
) {
  if (!active) return "UP";
  if (!initialized) return "ACQUIRING";
  return lost && lostForMilliseconds >= lossDelayMilliseconds ? "LOST" : "TRACKING";
}
