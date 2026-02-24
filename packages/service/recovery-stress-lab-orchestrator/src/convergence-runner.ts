import {
  summarizeStore,
  topConstraintShifts,
} from '@data/recovery-incident-lab-store';
import { runOrchestratedConvergence, runSequence, type RuntimeOutput } from './convergence-runtime';
import {
  runConvergenceDiagnostics,
  scoreConvergenceTimeline,
  timelineWindow,
  inspectTopologyDigest,
  type ScopedTimeline,
} from './convergence-observability';
import { buildScopedRegistry, type RuntimeRegistryEntry } from './convergence-runtime-contracts';
import type { ConvergenceStoreRecord } from '@data/recovery-incident-lab-store';
import type { ConvergenceScope, ConvergenceStage } from '@domain/recovery-lab-orchestration-core';

export type RunTuple<TScopes extends readonly ConvergenceScope[]> = {
  [K in keyof TScopes]: Promise<RuntimeOutput>;
};

export interface RunnerPlan<TScopes extends readonly ConvergenceScope[]> {
  readonly tenantId: string;
  readonly stages: TScopes;
  readonly timeline: string;
}

export type ConstraintSnapshot<TOutput extends RuntimeOutput> = Pick<TOutput, 'runId' | 'manifestDigest' | 'constraints'> & {
  readonly constraintCount: number;
  readonly outputStage: TOutput['output']['stage'];
};

export interface ConvergenceRunReport {
  readonly tenantId: string;
  readonly runIds: readonly string[];
  readonly outputs: readonly RuntimeOutput[];
  readonly diagnostics: readonly string[];
  readonly timelineDigest: string;
  readonly windowMs: number;
  readonly registry: readonly RuntimeRegistryEntry<ConvergenceScope, ConvergenceStage>[];
}

export const registryEntries = buildScopedRegistry();

export const normalizeScopes = <TScopes extends readonly ConvergenceScope[]>(scopes: TScopes): TScopes =>
  [...new Set(scopes)] as unknown as TScopes;

const runTuple = async (tenantId: string, scopes: readonly ConvergenceScope[]): Promise<readonly RuntimeOutput[]> => {
  const entries = await Promise.all(scopes.map((scope) => runOrchestratedConvergence(tenantId, scope)));
  return entries;
};

export const executeRunSequence = async <
  const TScopes extends readonly ConvergenceScope[],
>(tenantId: string, scopes: TScopes): Promise<{ readonly runs: readonly RuntimeOutput[]; readonly plan: RunnerPlan<TScopes> }> => {
  const normalized = normalizeScopes(scopes);
  const runs = await runTuple(tenantId, normalized);

  return {
    runs,
    plan: {
      tenantId,
      stages: normalized,
      timeline: `run:${tenantId}:${normalized.join('|')}`,
    },
  };
};

export const buildConstraintSnapshot = <TOutput extends RuntimeOutput>(run: TOutput): ConstraintSnapshot<TOutput> => ({
  runId: run.runId,
  manifestDigest: run.manifestDigest,
  constraints: run.constraints,
  constraintCount: run.constraints.length,
  outputStage: run.output.stage,
});

export const runConvergenceSuite = async <
  const TScopes extends readonly ConvergenceScope[],
>(tenantId: string, scopes: TScopes): Promise<ConvergenceRunReport> => {
  const { runs, plan } = await executeRunSequence(tenantId, scopes);

  const snapshots = runs.map((run) => buildConstraintSnapshot(run));
  const shifts = runs.toSorted((left, right) => right.output.score - left.output.score);
  const diagnostics: string[] = [
    `tenant:${tenantId}`,
    `stages:${plan.stages.join(',')}`,
    `runs:${runs.length}`,
    ...snapshots.map((snapshot) => `snapshot:${snapshot.runId}:${snapshot.constraintCount}`),
    ...topConstraintShifts(
      shifts.map((snapshot, index): ConvergenceStoreRecord => ({
        id: `suite:${tenantId}:${snapshot.runId}:${index}` as ConvergenceStoreRecord['id'],
        runId: snapshot.runId,
        tenantId,
        scope: plan.stages[index] ?? 'tenant',
        stage: snapshot.output.stage,
        output: snapshot.output,
        constraints: snapshot.constraints,
        events: [],
        diagnostics: [`scope:${plan.stages[index] ?? 'tenant'}`, `stage:${snapshot.output.stage}`],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      8,
    ).map((entry) => `shift:${entry.runId}:${entry.score}`),
  ];

  const timeline: ScopedTimeline = await runConvergenceDiagnostics(tenantId, scopes);
  const timelineScore = timeline.timelines
    .map((entry) => scoreConvergenceTimeline(entry))
    .reduce((acc, value) => acc + value, 0);
  const primary = timeline.timelines.at(-1);
  const windowMs = primary ? timelineWindow(primary).durationMs : 0;
  const digest = primary ? inspectTopologyDigest(primary.graph) : `${tenantId}:no-run`;

  return {
    tenantId,
    runIds: runs.map((run) => run.runId),
    outputs: runs,
    diagnostics,
    timelineDigest: `${digest}:${timelineScore.toFixed(5)}`,
    windowMs,
    registry: Object.values(registryEntries),
  };
};

export const compareScopesByDensity = <
  TScope extends ConvergenceScope,
>(
  tenantId: string,
  scopes: readonly TScope[],
): Promise<{ readonly tenantId: string; readonly density: number; readonly signalGroups: Array<{ readonly scope: TScope; readonly signals: number }> }> => {
  const snapshot = summarizeStore([]);
  return Promise.resolve({
    tenantId,
    density: snapshot.scopeCount / Math.max(1, scopes.length),
    signalGroups: scopes.flatMap((scope) => [{
      scope,
      signals: snapshot.byScope.find((entry) => entry.key === scope)?.count ?? 0,
    }]),
  });
};

export const collectSignalsForTenant = async (
  tenantId: string,
  scope: ConvergenceScope,
): Promise<readonly string[]> => {
  const timeline = await runConvergenceDiagnostics(tenantId, [scope]);
  const scoped = timeline.timelines[0]?.events;

  const baseline = await runSequence(tenantId);
  const recordSignals = baseline.runs
    .flatMap((run) => run.constraints.map((constraint) => `${run.runId}:${constraint.key}`))
    .toSorted();

  return [
    ...recordSignals,
    ...(scoped?.map((entry) => `${entry.at}:${entry.scope}:${entry.message}`) ?? []),
  ];
};
