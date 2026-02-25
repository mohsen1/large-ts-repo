import { Brand } from '@shared/core';
import type { NoInfer } from '@shared/type-level';
import { createRegistry } from './registry';
import { parseStrategyTuple } from './schema';
import type {
  PluginContract,
  ContractByKind,
  PluginExecutionRecord,
  PluginExecutionResult,
} from './contracts';
import type { StrategyLane, StrategyMode, StrategyTuple, SignalEvent } from './types';
import {
  asPluginFingerprint,
  asPlanId,
  asPluginId,
  asRunId,
  asScenarioId,
  asSessionId,
  asWorkspaceId,
} from './types';

export const registryPhases = ['seed', 'wire', 'execute', 'drain', 'close'] as const;
export const laneBuckets = ['forecast', 'resilience', 'containment', 'recovery', 'assurance'] as const;

export type RegistryPhase = (typeof registryPhases)[number];
export type RegistryLane = (typeof laneBuckets)[number];
export type RegistryRoute = `registry:${string}`;

export type ByTuple<T extends readonly PluginContract<string, any, any, any>[]> = {
  [K in T[number] as K['kind'] & string]: Extract<T[number], { kind: K['kind'] }>;
};

export type RegistryTuple<T extends readonly PluginContract<string, any, any, any>[]> = [...T];

export interface RegistryPlaneInput<TContracts extends readonly PluginContract<string, any, any, any>[]> {
  readonly workspace: string;
  readonly contracts: TContracts;
  readonly stages: readonly RegistryPhase[];
}

export interface RegistryPlaneSummary {
  readonly workspace: Brand<string, 'WorkspaceId'>;
  readonly route: RegistryRoute;
  readonly snapshotSize: number;
  readonly tuple: StrategyTuple;
  readonly hasActive: boolean;
}

export interface PlaneExecution<TInput, TOutput> {
  readonly tuple: StrategyTuple;
  readonly stage: RegistryPhase;
  readonly input: TInput;
  readonly output: TOutput;
  readonly report: PluginExecutionResult<TOutput>;
}

const laneOfSeverity = (severity: SignalEvent['severity']): RegistryLane =>
  severity === 'fatal' || severity === 'critical'
    ? 'assurance'
    : severity === 'error'
      ? 'containment'
      : severity === 'warn'
        ? 'recovery'
        : 'forecast';

export const registryLaneTotals = <TEvents extends readonly SignalEvent[]>(
  events: TEvents,
): Record<StrategyLane, number> =>
  events.reduce<Record<StrategyLane, number>>((acc, event) => {
    const lane = laneOfSeverity(event.severity);
    return { ...acc, [lane]: (acc[lane] ?? 0) + 1 };
  }, {
    forecast: 0,
    resilience: 0,
    containment: 0,
    recovery: 0,
    assurance: 0,
  });

const defaultTuple = parseStrategyTuple(['simulate', 'forecast', 'registry', 1]);
const normalizeLane = (value: string): RegistryLane =>
  laneBuckets.includes(value as RegistryLane) ? (value as RegistryLane) : 'forecast';
const registryRoute = (index: number, lane: RegistryLane): RegistryRoute => `registry:${index}:${lane}`;
const toMode = (phase: RegistryPhase): StrategyMode =>
  phase === 'seed'
    ? 'simulate'
    : phase === 'wire'
      ? 'analyze'
      : phase === 'execute'
        ? 'stress'
        : phase === 'drain'
          ? 'plan'
          : 'synthesize';
const toPhase = (mode: StrategyMode): RegistryPhase =>
  mode === 'simulate'
    ? 'seed'
    : mode === 'analyze'
      ? 'wire'
      : mode === 'stress'
        ? 'execute'
        : mode === 'plan'
          ? 'drain'
          : 'close';

export const createRegistryPlane = <
  const TContracts extends readonly PluginContract<string, any, any, any>[],
  const TStages extends readonly RegistryPhase[],
>(
  input: RegistryPlaneInput<TContracts>,
): {
  readonly registry: ReturnType<typeof createRegistry>;
  readonly route: RegistryRoute;
  readonly tuple: StrategyTuple;
  readonly list: RegistryTuple<TContracts>;
} => {
  const tuple = defaultTuple;
  const stages = input.stages.length > 0 ? input.stages : registryPhases;
  const strategyModes = stages.map((phase) => toMode(phase));
  const registry = createRegistry(input.workspace, strategyModes, input.contracts);

  return {
    registry,
    route: `registry:${input.workspace}` as RegistryRoute,
    tuple,
    list: [...input.contracts] as RegistryTuple<TContracts>,
  };
};

export const summarizePlane = <TContracts extends readonly PluginContract<string, any, any, any>[]>(
  input: RegistryPlaneInput<TContracts>,
): RegistryPlaneSummary => {
  const plane = createRegistryPlane(input);
  const list = plane.list;
  const laneByKind = list.reduce<Record<StrategyLane, number>>((acc, contract) => {
    const tuple = parseStrategyTuple([contract.mode, contract.lane, contract.kind, list.length]);
    const lane = normalizeLane(tuple[1]);
    return { ...acc, [lane]: (acc[lane] ?? 0) + 1 };
  }, {
    forecast: 0,
    resilience: 0,
    containment: 0,
    recovery: 0,
    assurance: 0,
  });

  return {
    workspace: asWorkspaceId(input.workspace) as Brand<string, 'WorkspaceId'>,
    route: registryRoute(list.length, normalizeLane(list[0]?.lane ?? 'forecast')),
    snapshotSize: list.length,
    tuple: plane.tuple,
    hasActive: Object.values(laneByKind).some((count) => count > 0),
  };
};

export const runRegistryPlane = async <
  TInput extends Record<string, unknown>,
  TOutput,
  TContracts extends readonly PluginContract<string, any, any, any>[],
>(
  input: {
    readonly workspace: string;
    readonly lane: RegistryLane;
    readonly tuple: StrategyTuple;
    readonly contracts: TContracts;
    readonly runner: (kind: string, payload: TInput, lane: RegistryLane) => Promise<TOutput>;
  },
): Promise<readonly PlaneExecution<TInput, TOutput>[]> => {
  const plane = createRegistryPlane({
    workspace: input.workspace,
    stages: ['seed', 'wire', 'execute', 'drain', 'close'],
    contracts: input.contracts,
  });
  const outputs: PlaneExecution<TInput, TOutput>[] = [];
  const stage = toPhase(input.tuple[0]);

  for (const descriptor of plane.registry.entries()) {
    const payload = input.tuple[2] as unknown as TInput;
    const output = await input.runner(descriptor.contract.kind, payload, input.lane);
    const event: SignalEvent = {
      source: 'policy',
      severity: input.tuple[0] === 'stress' ? 'error' : 'info',
      at: new Date().toISOString(),
      detail: {
        key: descriptor.key,
        lane: input.lane,
        mode: input.tuple[0],
      },
    };

    const report: PluginExecutionResult<TOutput> = {
      output,
      fingerprint: asPluginFingerprint(`${input.workspace}:${descriptor.key}`),
      consumedMs: Math.max(1, descriptor.contract.id.length * 3),
      warnings: descriptor.contract.kind.includes('warn') ? ['descriptor flagged'] : [],
      diagnostics: [event],
    };

    const record: PluginExecutionRecord<TInput, TOutput, { readonly tuple: StrategyTuple }> = {
      traceId: asPluginId(`${input.workspace}:${descriptor.key}`),
      phase: input.tuple[0],
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      input: payload,
      output,
      diagnostics: [],
      context: {
        sessionId: asSessionId(`${input.workspace}:session`),
        workspace: asWorkspaceId(input.workspace),
        runId: asRunId(`${input.workspace}:run`),
        planId: asPlanId(`${input.workspace}:plan`),
        scenario: asScenarioId(`${input.workspace}:scenario`),
        plugin: asPluginId(`${input.workspace}:plugin`),
        phase: {
          phase: input.tuple[0],
          lane: input.lane,
          scenario: asScenarioId(`${input.workspace}:scenario`) as never,
          runId: asRunId(`${input.workspace}:run`) as never,
          workspace: asWorkspaceId(input.workspace) as never,
          mode: input.tuple[0],
          startedAt: new Date().toISOString(),
          payload: { tuple: input.tuple },
        },
        baggage: {
          source: 'registry-plane',
          tuple: input.tuple,
        },
      },
    };
    void record;

    outputs.push({
      tuple: input.tuple,
      stage,
      input: payload,
      output,
      report,
    });
  }

  return outputs;
};

export const buildDescriptorMap = <TContracts extends readonly PluginContract<string, any, any, any>[]>(
  contracts: NoInfer<TContracts>,
): ByTuple<TContracts> => {
  const map = {} as ByTuple<TContracts>;
  for (const contract of contracts) {
    const key = contract.kind as ContractByKind<TContracts, typeof contract.kind> & string;
    map[key] = contract as never;
  }
  return map;
};

export const buildRegistryRoute = (workspace: string, lane: RegistryLane): RegistryRoute =>
  registryRoute(workspace.length, lane);
