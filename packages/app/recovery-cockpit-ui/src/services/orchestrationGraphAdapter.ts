import type { GraphServiceState } from './recoveryCockpitGraphService';

export interface GraphAdapterSummary {
  readonly workspaceId: string;
  readonly metricCount: number;
  readonly compact: ReadonlyArray<{ readonly section: string; readonly value: string }>;
}

const project = (state: GraphServiceState): GraphAdapterSummary => ({
  workspaceId: String(state.workspace.snapshot.workspaceId),
  metricCount: state.metrics.commandCount,
  compact: [
    { section: 'critical', value: String(state.metrics.criticalCount) },
    { section: 'replay', value: String(state.metrics.replayRatio) },
    { section: 'latency', value: String(state.metrics.latencyBudgetMs) },
  ],
});

export const adaptWorkspaceSummary = (
  state: GraphServiceState,
): GraphAdapterSummary => project(state);

export const buildSectionHeadlines = (values: readonly string[]) =>
  values.map((value) => ({
    section: value,
    value: value.length.toString(),
  }));
