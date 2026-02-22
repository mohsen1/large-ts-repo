import type { ContinuitySignal } from '@domain/continuity-lens';

export interface ContinuitySchedulerPlan {
  readonly requestedMinutes: number;
  readonly signalCount: number;
}

export class ContinuityCycleScheduler {
  public readonly createdAt = new Date().toISOString();

  constructor(private readonly maxCycles: number) {}

  buildPlan(signals: readonly ContinuitySignal[]): ContinuitySchedulerPlan {
    const signalCount = signals.length;
    return {
      requestedMinutes: Math.max(5, signalCount * this.maxCycles),
      signalCount,
    };
  }

  confidence(): number {
    return Number(Math.min(0.99, 0.4 + this.maxCycles * 0.1).toFixed(4));
  }
}
