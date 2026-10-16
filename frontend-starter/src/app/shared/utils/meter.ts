/** Bottom of the meter scale: below -48 dBFS the meter shows nothing. */
export const METER_FLOOR_DB = -48;
/** How fast a meter falls back, in "full meter heights" per second (like a real VU needle). */
const RELEASE_PER_SECOND = 1.5;

/** Converts a linear level (0 to 1) to decibels full scale. Silence gives -Infinity. */
export function toDb(level: number): number {
  return level > 0 ? 20 * Math.log10(level) : -Infinity;
}

/** Position on the meter, from 0 (floor) to 1 (0 dBFS). The scale is in dB, like our ears. */
export function meterRatio(level: number, floor = METER_FLOOR_DB): number {
  const db = toDb(level);
  if (db <= floor) return 0;
  return Math.min(1, (db - floor) / -floor);
}

/**
 * Meter ballistics: rises instantly, falls back slowly.
 * Without it the bars flicker 60 times per second and become unreadable.
 */
export function ballistics(previous: number, target: number, elapsedMs: number): number {
  if (target >= previous) return target;
  return Math.max(target, previous - (RELEASE_PER_SECOND * elapsedMs) / 1000);
}
