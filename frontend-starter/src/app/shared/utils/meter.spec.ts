import { ballistics, meterRatio, toDb } from './meter';

describe('meter', () => {
  it('convertit un niveau linéaire en dBFS', () => {
    expect(toDb(1)).toBe(0);
    expect(toDb(0.5)).toBeCloseTo(-6.02, 2);
    expect(toDb(0)).toBe(-Infinity);
  });

  it('place le niveau sur une échelle en dB de -48 à 0', () => {
    expect(meterRatio(1)).toBe(1);
    expect(meterRatio(0)).toBe(0);
    // -24 dB is exactly half of the scale.
    expect(meterRatio(10 ** (-24 / 20))).toBeCloseTo(0.5, 5);
    // Below the floor, nothing is shown.
    expect(meterRatio(10 ** (-60 / 20))).toBe(0);
  });

  it('monte tout de suite mais redescend lentement', () => {
    expect(ballistics(0.2, 0.9, 16)).toBe(0.9);
    // 1.5 heights per second: 100 ms of release = -0.15.
    expect(ballistics(0.9, 0, 100)).toBeCloseTo(0.75, 5);
    // Never goes below the real level.
    expect(ballistics(0.9, 0.85, 1000)).toBe(0.85);
  });
});
