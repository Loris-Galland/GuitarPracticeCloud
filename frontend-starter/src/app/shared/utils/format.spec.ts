import { formatDb, formatHz, formatPan, formatPercent, formatSeconds } from './format';

describe('format', () => {
  it('affiche pourcentages et décibels', () => {
    expect(formatPercent(0.8)).toBe('80 %');
    expect(formatDb(3.5)).toBe('+3.5 dB');
    expect(formatDb(-6)).toBe('-6 dB');
    expect(formatDb(0)).toBe('0 dB');
  });

  it('affiche le pan côté gauche ou droit', () => {
    expect(formatPan(-0.2)).toBe('G 20');
    expect(formatPan(0.35)).toBe('D 35');
    expect(formatPan(0)).toBe('Centre');
  });

  it('affiche fréquences et durées dans la bonne unité', () => {
    expect(formatHz(850)).toBe('850 Hz');
    expect(formatHz(2500)).toBe('2.5 kHz');
    expect(formatHz(16000)).toBe('16 kHz');
    expect(formatSeconds(0.35)).toBe('350 ms');
    expect(formatSeconds(2)).toBe('2 s');
  });
});
