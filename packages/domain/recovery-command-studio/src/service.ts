import { fail, ok, type Result } from '@shared/result';
import type {
  CommandRun,
  CommandSequence,
  CommandStudioWorkspaceId,
  CommandSimulation,
  SequenceIntentMap,
  StudioRuntimeState,
  CommandMetric,
  CommandStudioCommandId,
  CommandStudioWorkspaceId as CommandStudioWorkspaceIdAlias,
} from './types';
import { runBatchSimulations } from './simulator';
import { buildAllocation, rebalanceLanes } from './allocator';
import { makeAdvice, synthesizePlan } from './planner';
import { deserializeRuntime, buildIntentMap } from './adapter';
import { withBrand } from '@shared/core';
import type { RecoveryProgram } from '@domain/recovery-orchestration';

export interface OrchestratorCreateInput {
  readonly workspaceId: CommandStudioWorkspaceIdAlias;
  readonly program: RecoveryProgram;
  readonly sequence: CommandSequence;
}

export interface OrchestratorOutcome {
  readonly run: CommandRun;
  readonly simulation: CommandSimulation;
  readonly advice: ReturnType<typeof makeAdvice>;
  readonly allocations: ReturnType<typeof rebalanceLanes>;
}

export interface LoadInput {
  readonly rawState: unknown;
}

const createRun = (input: OrchestratorCreateInput): CommandRun => ({
  runId: `${input.sequence.sequenceId}-run` as CommandRun['runId'],
  tenant: 'studio' as CommandRun['tenant'],
  workspaceId: input.workspaceId,
  planId: input.program.id,
  sequenceId: input.sequence.sequenceId,
  state: 'queued',
  createdAt: new Date().toISOString(),
  completedNodeIds: [],
});

const makeAllocationMetric = (
  runId: CommandRun['runId'],
  nodeId: CommandStudioCommandId,
  idx: number,
): CommandMetric => ({
  metricId: withBrand(`${runId}-${nodeId}-allocation`, 'MetricId'),
  commandId: nodeId,
  label: 'allocation-rank',
  value: idx + 1,
  unit: 'count',
});

export class RecoveryCommandStudioOrchestrator {
  private state: StudioRuntimeState = {
    sequences: [],
    runs: [],
    simulations: [],
    metrics: [],
  };

  constructor(initialState?: StudioRuntimeState) {
    if (initialState) {
      this.state = initialState;
    }
  }

  hydrate(input: LoadInput): void {
    this.state = deserializeRuntime(input.rawState);
  }

  buildDrafts = (input: OrchestratorCreateInput): Result<StudioRuntimeState, Error> => {
    const plan = synthesizePlan(input.sequence);
    if (plan.sequence.nodes.length === 0) {
      return fail(new Error('Sequence has no executable nodes'));
    }

    const run = createRun(input);
    const simulations = runBatchSimulations(
      {
        workspaceId: input.workspaceId,
        run,
        program: input.program,
        nodes: input.sequence.nodes,
        metrics: this.state.metrics,
      },
      2,
    );

    const allocations = rebalanceLanes(buildAllocation(input.sequence, this.state.metrics));

    const allocationMetrics = allocations.lanes.flatMap((lane) => lane.nodeIds.map((nodeId, idx) => makeAllocationMetric(run.runId, nodeId, idx)));
    const updated: StudioRuntimeState = {
      sequences: [...this.state.sequences, input.sequence],
      runs: [...this.state.runs, run],
      simulations: [...this.state.simulations, ...simulations],
      metrics: [...this.state.metrics, ...allocationMetrics],
    };

    this.state = updated;
    return ok(updated);
  };

  estimateIntents = (mappingSource: SequenceIntentMap): StudioRuntimeState => ({
    ...this.state,
    latestIntentMap: mappingSource,
  });

  applyIntents = (): StudioRuntimeState => this.state;

  getState = (): StudioRuntimeState => ({
    ...this.state,
    runs: [...this.state.runs],
    simulations: [...this.state.simulations],
    sequences: [...this.state.sequences],
    metrics: [...this.state.metrics],
  });

  dispatch = (): Result<OrchestratorOutcome, Error> => {
    const run = this.state.runs.at(-1);
    if (!run) {
      return fail(new Error('No active run available'));
    }

    const sequence = this.state.sequences.find((item) => item.sequenceId === run.sequenceId);
    if (!sequence) {
      return fail(new Error('No sequence registered for active run'));
    }

    const simulation = this.state.simulations[this.state.simulations.length - 1];
    const allocations = rebalanceLanes(buildAllocation(sequence, this.state.metrics));
    const advice = makeAdvice(sequence);

    return ok({
      run: {
        ...run,
        state: 'active',
        startedAt: new Date().toISOString(),
      },
      simulation,
      advice,
      allocations,
    });
  };
}

export const mapIntentMap = buildIntentMap;
export const buildStudioRun = createRun;

export const buildWorkspaceId = (workspace: string): CommandStudioWorkspaceIdAlias =>
  withBrand(workspace, 'CommandStudioWorkspaceId');

export const previewPayload = (sequence: CommandSequence): string =>
  JSON.stringify({
    workspaceId: sequence.workspaceId,
    sequenceId: sequence.sequenceId,
    nodes: sequence.nodes.length,
    signals: sequence.signals.length,
  });
