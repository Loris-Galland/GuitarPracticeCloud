/** Display helpers for the studio controls (knob and fader values). */

export const formatPercent = (value: number) => `${Math.round(value * 100)} %`;

export const formatDb = (value: number) => `${value > 0 ? '+' : ''}${value} dB`;

/** -0.2 gives "G 20", 0.35 gives "D 35", 0 gives "Centre". */
export const formatPan = (value: number) => {
  const amount = Math.round(Math.abs(value) * 100);
  if (amount === 0) return 'Centre';
  return `${value < 0 ? 'G' : 'D'} ${amount}`;
};

/** 850 gives "850 Hz", 2500 gives "2.5 kHz". */
export const formatHz = (value: number) =>
  value >= 1000 ? `${Number((value / 1000).toFixed(1))} kHz` : `${Math.round(value)} Hz`;

/** Below one second in ms (350 ms), above in seconds (2.4 s). */
export const formatSeconds = (value: number) =>
  value < 1 ? `${Math.round(value * 1000)} ms` : `${Number(value.toFixed(1))} s`;
