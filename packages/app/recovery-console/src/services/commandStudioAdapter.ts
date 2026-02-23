import type {
  CommandSequence,
  CommandRun,
  CommandSimulation,
  StudioRuntimeState,
} from '@domain/recovery-command-studio';

export interface StudioCommandBoardRow {
  readonly sequenceId: string;
  readonly state: CommandRun['state'];
  readonly estimatedMinutes: number;
  readonly warningCount: number;
}

export interface StudioTimelinePoint {
  readonly startedAt: string;
  readonly nodeId: string;
  readonly blockerCount: number;
  readonly metricCount: number;
}

export interface StudioSummary {
  readonly workspaceId: string;
  readonly totalRuns: number;
  readonly activeCount: number;
  readonly timeline: readonly StudioTimelinePoint[];
  readonly rows: readonly StudioCommandBoardRow[];
}

export const toBoardRows = (state: StudioRuntimeState): readonly StudioCommandBoardRow[] =>
  state.runs.map((run): StudioCommandBoardRow => {
    const simulation = state.simulations.find((item) => item.sequenceId === run.sequenceId);
    return {
      sequenceId: run.sequenceId,
      state: run.state,
      estimatedMinutes: simulation?.outcome.estimatedMinutes ?? 0,
      warningCount: simulation?.outcome.warningCount ?? 0,
    };
  });

export const summarizeSequence = (
  workspaceId: string,
  state: StudioRuntimeState,
  sequences: readonly CommandSequence[],
): StudioSummary => {
  const rows = toBoardRows(state);
  const timeline: StudioTimelinePoint[] = state.simulations.flatMap((simulation: CommandSimulation) =>
    simulation.steps.map((step) => ({
      startedAt: step.expectedStart,
      nodeId: step.commandId,
      blockerCount: step.blockers.length,
      metricCount: step.metrics.length,
    })),
  );

  return {
    workspaceId,
    totalRuns: rows.length,
    activeCount: rows.filter((row) => row.state === 'active').length,
    timeline,
    rows,
  };
};

export const enrichSequences = (sequences: readonly CommandSequence[]): readonly CommandSequence[] =>
  sequences.map((sequence, index) => ({
    ...sequence,
    name: `${sequence.name}-${index}`,
  }));
