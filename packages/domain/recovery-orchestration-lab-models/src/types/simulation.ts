import type { RunId } from '@shared/recovery-orchestration-lab-runtime';
import { parseRuntimeId } from '@shared/recovery-orchestration-lab-runtime';
import type { StageResult, StageRunInput, StageRunOutput } from './laboratory.js';
import type { WorkspaceToken, ScenarioToken } from './brands.js';

export type SimulationScope = {
  readonly workspace: WorkspaceToken;
  readonly scenario: ScenarioToken;
};

export interface SimulationEvent<TPayload = unknown> {
  readonly at: string;
  readonly type: `simulation:${string}`;
  readonly payload: TPayload;
}

export interface SimulationLog {
  readonly runId: RunId;
  readonly startedAt: string;
  readonly events: readonly SimulationEvent[];
}

export type SimulationTick<TState, TAction> =
  | { readonly kind: 'input'; readonly value: StageRunInput<TAction>; readonly state: TState }
  | { readonly kind: 'output'; readonly value: StageRunOutput<TState>; readonly state: TState };

export type SimulationReducer<TState, TAction> = (state: TState, tick: SimulationTick<TState, TAction>) => TState;

export interface SimulationPlan<TState, TAction> {
  readonly runId: RunId;
  readonly scope: SimulationScope;
  readonly initialState: TState;
  readonly reduce: SimulationReducer<TState, TAction>;
  readonly ticks: readonly SimulationTick<TState, TAction>[];
}

export interface SimulationResult<TState> {
  readonly ok: boolean;
  readonly finalState: TState;
  readonly logs: readonly SimulationLog[];
  readonly warnings: readonly string[];
}

export const summarizeTicks = <TState, TAction>(
  plan: SimulationPlan<TState, TAction>,
): { total: number; byKind: Readonly<Record<'input' | 'output', number>> } => {
  const byKind = { input: 0, output: 0 } satisfies Record<'input' | 'output', number>;
  for (const tick of plan.ticks) {
    byKind[tick.kind] += 1;
  }
  return { total: plan.ticks.length, byKind };
};

export const runSimulation = <TState, TAction>(plan: SimulationPlan<TState, TAction>): SimulationResult<TState> => {
  let state = plan.initialState;
  const logs: SimulationLog[] = [];
  const warnings: string[] = [];
  const runId = parseRuntimeId('run', plan.runId);

  const timeline = plan.ticks.reduce((acc, tick) => {
    state = plan.reduce(state, tick);
    const event: SimulationEvent = {
      at: new Date().toISOString(),
      type: `simulation:${tick.kind}`,
      payload: tick,
    };
    acc.push({
      runId,
      startedAt: plan.ticks.length > 0 ? new Date().toISOString() : new Date(0).toISOString(),
      events: [event],
    });
    return acc;
  }, [] as SimulationLog[]);

  if (plan.ticks.length === 0) {
    warnings.push('no ticks executed');
  }

  return {
    ok: warnings.length === 0,
    finalState: state,
    logs: timeline,
    warnings,
  };
};
