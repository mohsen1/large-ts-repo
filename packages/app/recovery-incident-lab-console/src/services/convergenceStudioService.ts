import { runSequence, runConvergenceDiagnostics, buildRuntimeManifest, type RuntimeOutput } from '@service/recovery-stress-lab-orchestrator';
import type { ConvergenceScope, ConvergenceStage } from '@domain/recovery-lab-orchestration-core';

export interface StudioRunRecord {
  readonly tenantId: string;
  readonly runId: string;
  readonly scope: ConvergenceScope;
  readonly stage: ConvergenceStage;
  readonly score: number;
  readonly confidence: number;
  readonly constraintCount: number;
  readonly selectedRunbookCount: number;
}

export interface StudioWorkspace {
  readonly tenantId: string;
  readonly generatedAt: string;
  readonly runs: readonly StudioRunRecord[];
  readonly manifestScopeCount: number;
  readonly manifestPluginCount: number;
}

export interface ScopedTimelineState {
  readonly runIds: readonly string[];
  readonly eventCount: number;
  readonly latestRunAt: string | null;
}

export interface StudioQuery {
  readonly tenantId: string;
  readonly scopes: readonly ConvergenceScope[];
}

const buildRecord = (output: RuntimeOutput, scope: ConvergenceScope): StudioRunRecord => ({
  tenantId: output.output.tenantId,
  runId: output.runId,
  scope,
  stage: output.output.stage,
  score: output.output.score,
  confidence: output.output.confidence,
  constraintCount: output.constraints.length,
  selectedRunbookCount: output.output.selectedRunbooks.length,
});

export const runStudioWorkspace = async (query: StudioQuery): Promise<StudioWorkspace> => {
  const manifest = await buildRuntimeManifest(query.tenantId);
  const fallbackScopes = ['tenant', 'topology', 'signal', 'policy', 'fleet'] as const satisfies readonly ConvergenceScope[];
  const scopes: readonly ConvergenceScope[] = query.scopes.length > 0 ? query.scopes : fallbackScopes;

  const runs = await Promise.all(
    scopes.map(async (scope) => {
      const sequence = await runSequence(query.tenantId, [scope]);
      return {
        scope,
        run: sequence.runs.at(0),
      };
    }),
  );

  return {
    tenantId: query.tenantId,
    generatedAt: new Date().toISOString(),
    runs: runs
      .map(({ run, scope }) => (run ? buildRecord(run, scope) : null))
      .filter((entry): entry is StudioRunRecord => Boolean(entry)),
    manifestScopeCount: manifest.planCount,
    manifestPluginCount: manifest.pluginCount,
  };
};

export const runStudioDiagnostics = async (
  tenantId: string,
  scopes: readonly ConvergenceScope[] = ['tenant', 'topology', 'signal', 'policy', 'fleet'],
): Promise<ScopedTimelineState> => {
  const timeline = await runConvergenceDiagnostics(tenantId, scopes);
  const runIds = timeline.timelines.map((entry) => entry.runId);
  const lastEvents = timeline.timelines
    .flatMap((entry) => entry.events)
    .toSorted((left, right) => left.at.localeCompare(right.at));

  return {
    runIds,
    eventCount: lastEvents.length,
    latestRunAt: lastEvents.at(-1)?.at ?? null,
  };
};

const mergeSorted = <T extends { readonly at: string }>(left: readonly T[], right: readonly T[]): readonly T[] => {
  return [...left, ...right].toSorted((lhs, rhs) => lhs.at.localeCompare(rhs.at));
};

export const buildConvergenceTimeline = (timeline: readonly { readonly at: string; readonly message: string }[]) => {
  const rows = mergeSorted(timeline.filter((entry) => entry.message.length > 0), []);
  return rows.map((entry) => `${entry.at}:${entry.message}`);
};

export const summarizeTimelineState = (state: ScopedTimelineState) => ({
  ...state,
  isActive: state.eventCount > 0,
  latestRunAt: state.latestRunAt ?? 'pending',
} as const);
