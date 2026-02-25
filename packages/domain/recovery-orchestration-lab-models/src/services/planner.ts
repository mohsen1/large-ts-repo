import type { StageRunInput, StageRunOutput } from '../types/laboratory.js';
import { createDomainRegistry } from '../runtime/registry.js';
import { registerPluginFactory } from '../runtime/registry.js';
import type { PluginSet } from '../runtime/registry.js';
import { parseToken } from '../types/brands.js';
import type { StageToken } from '../types/brands.js';
import { summarizeTicks, runSimulation, type SimulationPlan, type SimulationTick } from '../types/simulation.js';
import { parseRuntimeId } from '@shared/recovery-orchestration-lab-runtime';

export interface PlanRequest {
  readonly tenant: string;
  readonly workspace: string;
  readonly scenario: string;
  readonly commands: readonly string[];
}

export interface PlanResult {
  readonly score: number;
  readonly warnings: readonly string[];
  readonly pluginNames: readonly string[];
  readonly simulationTicks: number;
}

const pluginNameOf = (command: string): `plugin:${string}` => `plugin:${command}` as const;

export const buildPlanFromCommands = (request: PlanRequest): PlanResult => {
  const workspace = parseToken(request.workspace);
  const pluginSet: PluginSet = request.commands.map((command: string, index: number) => registerPluginFactory((name) => {
    const pluginName = pluginNameOf(command);
    return {
      name: `${name}-${index}:${pluginName}` as string,
      meta: {
        id: `${command}:meta`,
        name: command,
        tags: ['contract:planner'],
        version: '1.0.0',
        description: `planner plugin ${command}`,
      },
      canRun: () => true,
      run: async (input) => ({
        traceId: input.traceId,
        result: {
          stage: 'stage:intake' as StageToken,
          state: 'queued',
          result: 'ok',
          payload: input.payload,
          score: 1,
          tags: ['generated'],
        },
        score: 100,
      }),
    };
  }));

  const registry = createDomainRegistry(pluginSet);
  const simulationPlan: SimulationPlan<readonly string[], unknown> = {
    runId: parseRuntimeId('run', 'run:tenant:plan'),
    scope: {
      workspace: `ws:${workspace.namespace}:${workspace.tenant}:${workspace.sequence}` as never,
      scenario: `scenario:${workspace.namespace}:${workspace.tenant}:${request.scenario}` as never,
    },
    initialState: request.commands,
    reduce: (state: readonly string[], tick: SimulationTick<readonly string[], unknown>) => {
      if (tick.kind === 'input') {
        return [...state, tick.value.traceId] as const;
      }
      return state;
    },
    ticks: [
      {
        kind: 'input',
        value: {
          traceId: `trace:${request.scenario}`,
          payload: { request },
          timestamp: new Date().toISOString(),
        } as StageRunInput<unknown>,
        state: request.commands,
      },
    ],
  };

  const simulation = runSimulation(simulationPlan);
  const summary = summarizeTicks(simulationPlan);

  return {
    score: simulation.ok ? 100 : 50,
    warnings: simulation.warnings,
    pluginNames: request.commands,
    simulationTicks: summary.total,
  };
};

export const estimateLaneHealth = (outputs: readonly StageRunOutput<unknown>[]): number => {
  if (outputs.length === 0) {
    return 0;
  }
  const score = outputs.reduce((acc, output) => acc + output.score, 0) / outputs.length;
  return Math.max(0, Math.min(100, Math.round(score)));
};

export const createPlanForWorkspace = async (request: PlanRequest): Promise<PlanResult> => {
  const result = buildPlanFromCommands(request);
  return {
    ...result,
    warnings: [...result.warnings],
  };
};
