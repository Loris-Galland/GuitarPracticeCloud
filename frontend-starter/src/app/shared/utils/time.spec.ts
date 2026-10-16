import { formatTime } from './time';

describe('formatTime', () => {
  it('affiche minutes et secondes sur deux chiffres', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.9)).toBe('1:05');
    expect(formatTime(243.62)).toBe('4:03');
  });

  it('ne casse pas sur une durée inconnue', () => {
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(Infinity)).toBe('0:00');
    expect(formatTime(-3)).toBe('0:00');
  });
});
