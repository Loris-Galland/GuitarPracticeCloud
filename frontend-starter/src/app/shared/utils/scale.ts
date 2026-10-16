/** A value range for a control: linear (volume, mix) or logarithmic (frequencies). */
export interface ControlScale {
  min: number;
  max: number;
  step: number;
  log?: boolean;
}

/** Position of a value on the control, from 0 to 1. */
export function toRatio(value: number, { min, max, log }: ControlScale): number {
  const ratio = log ? Math.log(value / min) / Math.log(max / min) : (value - min) / (max - min);
  return Math.min(1, Math.max(0, ratio));
}

/** Value at a position of the control, rounded to the step. */
export function fromRatio(ratio: number, scale: ControlScale): number {
  const { min, max, log } = scale;
  const r = Math.min(1, Math.max(0, ratio));
  return snap(log ? min * (max / min) ** r : min + r * (max - min), scale);
}

/** Rounds to the step and keeps the value in range (also removes 0.30000000000000004). */
export function snap(value: number, { min, max, step }: ControlScale): number {
  const decimals = (String(step).split('.')[1] ?? '').length;
  const rounded = Math.round(value / step) * step;
  return Number(Math.min(max, Math.max(min, rounded)).toFixed(decimals));
}

/**
 * Value after a key press, shared by the knob and the fader.
 * Arrows move by one step (on the ratio for log scales), Page keys by 10%, Home/End to the ends.
 * Returns null for any other key.
 */
export function keyValue(key: string, value: number, scale: ControlScale): number | null {
  const byRatio = (delta: number) => fromRatio(toRatio(value, scale) + delta, scale);
  // On a log scale one step means nothing (1 Hz at 20 Hz is not 1 Hz at 10 kHz): move by 1% instead.
  const arrow = (direction: 1 | -1) =>
    scale.log ? byRatio(direction * 0.01) : snap(value + direction * scale.step, scale);

  switch (key) {
    case 'ArrowUp':
    case 'ArrowRight':
      return arrow(1);
    case 'ArrowDown':
    case 'ArrowLeft':
      return arrow(-1);
    case 'PageUp':
      return byRatio(0.1);
    case 'PageDown':
      return byRatio(-0.1);
    case 'Home':
      return scale.min;
    case 'End':
      return scale.max;
    default:
      return null;
  }
}
