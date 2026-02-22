import { buildSignalGraph, type SignalGraph } from '@domain/continuity-lens';
import { buildForecast } from '@domain/continuity-lens';
import { fail, ok, type Result } from '@shared/result';
import type {
  ContinuityForecast,
  ContinuitySignal,
  ContinuityTenantId,
} from '@domain/continuity-lens';
import type { ContinuityLensRepository, ContinuityLensStoreFilters } from '@data/continuity-lens-store';
import { withBrand } from '@shared/core';

export interface AggregatedWorkspaceSnapshot {
  readonly riskScore: number;
  readonly graph: SignalGraph;
  readonly windowSnapshotId: string;
  readonly signalCount: number;
}

const selectSignals = (signals: readonly ContinuitySignal[], maxSignals: number): readonly ContinuitySignal[] =>
  [...signals]
    .sort((left, right) => Date.parse(right.reportedAt) - Date.parse(left.reportedAt))
    .slice(0, Math.max(1, maxSignals));

export const assembleWorkspaceSnapshot = async (
  repository: ContinuityLensRepository,
  tenantId: ContinuityTenantId,
  maxSignals: number,
): Promise<Result<AggregatedWorkspaceSnapshot, Error>> => {
  const signalResponse = await repository.listSignals({
    tenantId,
    limit: maxSignals,
    includeResolved: true,
  } satisfies ContinuityLensStoreFilters);

  if (!signalResponse.ok) return fail(signalResponse.error);
  const signals = selectSignals(signalResponse.value, maxSignals);
  const graph = buildSignalGraph(tenantId, signals);
  const snapshotResponse = await repository.listSnapshots({ tenantId, limit: 1 });
  if (!snapshotResponse.ok) return fail(snapshotResponse.error);

  const latestSnapshot = snapshotResponse.value[0];
  const riskScore = Math.min(100, graph.orderedByTime.length + Math.round(graph.signalIds.length * 1.8));
  const windowSnapshotId = latestSnapshot?.id ?? withBrand('none', 'ContinuitySnapshotId');

  return ok({
    riskScore,
    graph,
    windowSnapshotId,
    signalCount: signals.length,
  });
};

export const synthesizeForecast = async (
  repository: ContinuityLensRepository,
  tenantId: ContinuityTenantId,
  input: {
    readonly horizonMinutes: number;
    readonly maxSignals?: number;
    readonly includeResolved: boolean;
  },
): Promise<Result<ContinuityForecast, Error>> => {
  const snapshotsResponse = await repository.listSnapshots({
    tenantId,
    limit: Math.max(20, input.maxSignals ?? 60),
  });
  if (!snapshotsResponse.ok) return fail(snapshotsResponse.error);
  return buildForecast(
    tenantId,
    snapshotsResponse.value,
    {
      tenantId,
      horizonMinutes: input.horizonMinutes,
      maxSignals: input.maxSignals ?? 120,
      includeResolved: input.includeResolved,
    },
  );
};
