import { fromRatio, keyValue, snap, toRatio } from './scale';

const linear = { min: 0, max: 1, step: 0.01 };
const hz = { min: 80, max: 16000, step: 1, log: true };

describe('scale', () => {
  it('place une valeur entre 0 et 1, linéaire ou logarithmique', () => {
    expect(toRatio(0.25, linear)).toBe(0.25);
    expect(toRatio(5, linear)).toBe(1);
    // On a log scale, the geometric middle (80 x 200^0.5 ≈ 1131 Hz) sits at the center.
    expect(toRatio(80 * Math.sqrt(200), hz)).toBeCloseTo(0.5, 5);
  });

  it("retrouve la valeur d'une position, arrondie au pas", () => {
    expect(fromRatio(0.333, linear)).toBe(0.33);
    expect(fromRatio(0, hz)).toBe(80);
    expect(fromRatio(1, hz)).toBe(16000);
    expect(fromRatio(0.5, hz)).toBe(1131);
  });

  it('arrondit sans erreur de virgule flottante', () => {
    expect(snap(0.1 + 0.2, linear)).toBe(0.3);
    expect(snap(-3, linear)).toBe(0);
  });

  it('gère les touches du clavier', () => {
    expect(keyValue('ArrowUp', 0.5, linear)).toBe(0.51);
    expect(keyValue('ArrowLeft', 0.5, linear)).toBe(0.49);
    expect(keyValue('PageUp', 0.5, linear)).toBe(0.6);
    expect(keyValue('Home', 0.5, linear)).toBe(0);
    expect(keyValue('End', 0.5, linear)).toBe(1);
    expect(keyValue('a', 0.5, linear)).toBeNull();
    // Log scale: one arrow press = 1% of the travel, not 1 Hz.
    expect(keyValue('ArrowUp', 1000, hz)).toBeGreaterThan(1040);
  });
});
