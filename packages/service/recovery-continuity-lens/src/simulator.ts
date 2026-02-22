import { fail, ok, type Result } from '@shared/result';
import { withBrand } from '@shared/core';
import type { ContinuitySignal, ContinuitySnapshot, ContinuityTenantId } from '@domain/continuity-lens';
import { buildWindow } from '@domain/continuity-lens';

export interface SimulationConfig {
  readonly maxCycles: number;
}

export interface SimulationResult {
  readonly runId: string;
  readonly cycles: number;
  readonly snapshots: readonly ContinuitySnapshot[];
}

export const runSimulation = (
  tenantId: ContinuityTenantId,
  signals: readonly ContinuitySignal[],
  config: SimulationConfig,
): Result<SimulationResult, Error> => {
  if (config.maxCycles <= 0) return fail(new Error('max-cycles'));

  let currentSignals = [...signals];
  const snapshots: ContinuitySnapshot[] = [];
  for (let index = 0; index < config.maxCycles; index += 1) {
    const window = buildWindow({
      tenantId,
      from: new Date(Date.now() + index * 2_000).toISOString(),
      to: new Date(Date.now() + index * 2_000 + 30_000).toISOString(),
      horizonMinutes: 5,
    });
    const snapshot: ContinuitySnapshot = {
      id: withBrand(`${tenantId}:sim:${index}`, 'ContinuitySnapshotId'),
      tenantId,
      windowStart: window.from,
      windowEnd: window.to,
      riskScore: currentSignals.reduce((sum, signal) => sum + signal.severity, 0) / Math.max(1, currentSignals.length),
      trend: 'flat',
      signals: currentSignals,
      programs: [],
    };
    snapshots.push(snapshot);
    currentSignals = currentSignals.map((signal) => ({
      ...signal,
      severity: Math.min(100, signal.severity + 1),
      reportedAt: new Date(Date.parse(signal.reportedAt) + 1000).toISOString(),
    }));
  }

  return ok({
    runId: `${tenantId}:sim-run`,
    cycles: config.maxCycles,
    snapshots,
  });
};
