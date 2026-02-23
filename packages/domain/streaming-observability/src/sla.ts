import { StreamSlaWindow, StreamHealthSignal } from './types';

export interface SlaTarget {
  streamId: string;
  name: string;
  p95LatencyMs: number;
  minAvailability: number;
  minThroughputRatio: number;
}

export interface SlaContext {
  windows: readonly StreamSlaWindow[];
  signals: readonly StreamHealthSignal[];
}

export interface SlaResult {
  compliant: boolean;
  breached: number;
  healthScore: number;
  reasons: string[];
}

export const evaluateSla = (context: SlaContext, target: SlaTarget): SlaResult => {
  const breached = context.windows.filter((window) => window.violated).length;
  const latencyRatio = context.windows.length
    ? context.windows.reduce((acc, window) => acc + window.actualMs / window.targetMs, 0) / context.windows.length
    : 1;
  const severe = context.signals.filter((signal) => signal.level === 'critical').length;

  const reasons: string[] = [];
  let compliance = true;

  if (latencyRatio > target.minThroughputRatio) {
    compliance = false;
    reasons.push('p95 latency trend exceeds target');
  }

  if (context.windows.length && breached / context.windows.length > 0.08) {
    compliance = false;
    reasons.push(`breach ratio ${(breached / context.windows.length).toFixed(2)} exceeds allowance`);
  }

  if (severe > 5) {
    compliance = false;
    reasons.push('multiple critical signals in window');
  }

  const healthScore = Math.max(
    0,
    100 - Math.round(latencyRatio * 100) - breached * 5 - severe * 3,
  );

  return { compliant: compliance, breached, healthScore, reasons };
};

export const toSignalMatrix = (context: SlaContext): Map<string, number> => {
  const matrix = new Map<string, number>();
  for (const signal of context.signals) {
    const previous = matrix.get(signal.streamId) ?? 0;
    const inc = signal.level === 'critical' ? 3 : signal.level === 'warning' ? 1 : 0;
    matrix.set(signal.streamId, previous + inc);
  }
  return matrix;
};
