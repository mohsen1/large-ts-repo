import type { RecoverySignal } from '@domain/incident-fusion-models';

export type TickWindow = 'last-hour' | 'last-6h' | 'last-24h';

export interface TickRange {
  readonly from: number;
  readonly to: number;
}

export const selectByWindow = (signals: readonly RecoverySignal[], window: TickWindow): readonly RecoverySignal[] => {
  const thresholds = {
    'last-hour': 60,
    'last-6h': 360,
    'last-24h': 1440,
  };
  const limitMinutes = thresholds[window];
  const threshold = Date.now() - limitMinutes * 60_000;
  return signals.filter((signal) => Date.parse(signal.updatedAt) > threshold);
};

export const estimateCadenceMinutes = (signals: readonly RecoverySignal[]): number => {
  if (signals.length === 0) return 120;
  const criticalRatio = signals.filter((signal) => signal.priority === 'critical').length / signals.length;
  if (criticalRatio > 0.6) return 5;
  if (criticalRatio > 0.3) return 15;
  if (signals.length > 20) return 30;
  return 45;
};

export const buildTicks = (window: TickWindow): TickRange => {
  const now = Date.now();
  const map: Record<TickWindow, number> = {
    'last-hour': 60,
    'last-6h': 360,
    'last-24h': 1440,
  };
  const minutes = map[window];
  return {
    from: now - minutes * 60_000,
    to: now,
  };
};

export const buildScheduleWindows = (): readonly TickWindow[] => {
  return ['last-hour', 'last-6h', 'last-24h'];
};

export const resolveWindow = (candidate: TickWindow | undefined, hasSignals: boolean): TickWindow => {
  if (!candidate) return hasSignals ? 'last-hour' : 'last-24h';
  return candidate;
};
