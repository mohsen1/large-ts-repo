import type { TelemetryPulse } from './types';

export const normalizePulse = (values: readonly number[]): number => {
  if (values.length === 0) {
    return 0;
  }
  const bounded = values.map((value) => Math.min(1, Math.max(0, value)));
  return Number((bounded.reduce((acc, current) => acc + current, 0) / bounded.length).toFixed(5));
};

export const buildPulse = (label: string, values: readonly number[]): TelemetryPulse => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const first = sorted[0] ?? 0;
  const last = sorted.at(-1) ?? 0;

  let trend: TelemetryPulse['trend'] = 'flat';
  if (last > first) {
    trend = 'up';
  } else if (last < first) {
    trend = 'down';
  }

  return {
    label,
    value: Number(middle.toFixed(4)),
    trend,
  };
};

export const aggregatePulse = (pulses: readonly TelemetryPulse[]): TelemetryPulse => {
  const values = pulses.map((pulse) => pulse.value);
  const base = buildPulse('aggregate', values);
  return {
    ...base,
    label: `aggregate:${pulses.length}`,
    value: normalizePulse(values),
  };
};
