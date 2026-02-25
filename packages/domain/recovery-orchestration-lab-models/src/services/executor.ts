import {
  createPipeline,
  type RuntimePlugin,
  type RuntimePluginInput,
} from '@shared/recovery-orchestration-lab-runtime';
import { parseRuntimeId } from '@shared/recovery-orchestration-lab-runtime';
import { runSimulation } from '../types/simulation.js';
import { type SimulationPlan, type SimulationTick, summarizeTicks } from '../types/simulation.js';
import type { StageRunInput, StageRunOutput } from '../types/laboratory.js';
import { isPolicyToken, type WorkspaceToken } from '../types/brands.js';

export interface ExecutorInput {
  readonly workspace: WorkspaceToken;
  readonly runId: string;
  readonly plugins: readonly RuntimePlugin<string, unknown, unknown>[];
}

export interface ExecutionResult {
  readonly ok: boolean;
  readonly summary: string;
  readonly outputCount: number;
  readonly score: number;
}

const scoreFromPlan = (plan: ReturnType<typeof summarizeTicks>): number =>
  Math.max(0, Math.min(100, 100 - Math.abs(plan.total - 12) * 3));

export const executePlan = async (input: ExecutorInput): Promise<ExecutionResult> => {
  if (!isPolicyToken(`policy:${input.runId}:v1`)) {
    throw new Error('workspace policy id invalid');
  }
  const policyId = `policy:${input.runId}:v1` as `policy:${string}:v1`;
  if (!isPolicyToken(policyId)) {
    throw new Error('policy token invalid');
  }

  const pipeline = createPipeline(
    parseRuntimeId('run', `run:${input.runId}`),
    input.plugins.map((plugin: RuntimePlugin<string, unknown, unknown>) => ({
      kind: 'transform',
      label: plugin.name,
      run: async (payload: unknown) => {
        const typedInput = {
          traceId: `trace:${input.runId}`,
          payload,
          context: {
            tenant: input.workspace,
            workspace: input.workspace,
            runId: `run:${input.runId}`,
            startedAt: new Date(),
          },
        } as RuntimePluginInput<unknown>;
        const output = await plugin.run(typedInput);
        return output.result;
      },
    })),
  );

  const runId = parseRuntimeId('run', `run:${input.runId}`);
  const outputs = await pipeline.executeAll([{ workspace: input.workspace, runId }]);
  if (!outputs.ok) {
    throw new Error(`execution failed: ${outputs.metrics.errorCount}`);
  }

  const plan: SimulationPlan<readonly StageRunOutput<unknown>[], StageRunInput<unknown>> = {
    runId,
    scope: {
      workspace: input.workspace,
      scenario: `scenario:${input.runId}` as never,
    },
    initialState: [],
    reduce: (state: readonly StageRunOutput<unknown>[], tick: SimulationTick<readonly StageRunOutput<unknown>[], StageRunInput<unknown>>) => {
      if (tick.kind === 'output') {
        return [...state, tick.value] as const;
      }
      return state;
    },
    ticks: [],
  };

  const summary = runSimulation(plan);
  const tickSummary = summarizeTicks(plan);

  return {
    ok: summary.ok,
    summary: summary.finalState.length === 0 ? 'empty' : 'complete',
    outputCount: outputs.value.length,
    score: scoreFromPlan(tickSummary),
  };
};

export const executePlanSafe = async (input: ExecutorInput): Promise<ExecutionResult> => {
  try {
    return await executePlan(input);
  } catch (error) {
    return {
      ok: false,
      summary: String((error as Error).message),
      outputCount: 0,
      score: 0,
    };
  }
};
