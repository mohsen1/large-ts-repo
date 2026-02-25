import { type NoInfer } from '@shared/type-level';
import type { SignalEvent, StrategyContext, StrategyLane, StrategyMode, StrategyStep, StrategyTuple } from './types';
import {
  asPlanId,
  asPluginFingerprint,
  asPluginId,
  asRunId,
  asScenarioId,
  asSessionId,
  asWorkspaceId,
} from './types';
import { parseStrategyTuple } from './schema';
import {
  buildContractNamespace,
  buildDescriptor,
  type ContractByKind,
  type PluginContract,
  type PluginExecutionResult,
  type RegistryMap,
  type StrategyFlow,
  type PluginDescriptor,
} from './contracts';
import { createRegistry as createStrategyRegistry } from './registry';

export const lensPhases = ['capture', 'build', 'simulate', 'verify', 'close'] as const;
export type LensPhase = (typeof lensPhases)[number];
export const lensScopes = ['surface', 'runtime', 'telemetry', 'report'] as const;
export type LensScope = (typeof lensScopes)[number];
export type ScopeRoute<TScope extends LensScope = LensScope> = `${TScope}::${string}`;

export type LensTuple<T extends readonly StrategyTuple[]> = T extends readonly [infer Head extends StrategyTuple, ...infer Rest extends readonly StrategyTuple[]]
  ? readonly [Head, ...LensTuple<Rest>]
  : readonly [];

export type LaneAwareContract<TContracts extends readonly PluginContract<string, any, any, any>[]> = {
  [K in TContracts[number] as K['kind'] & string]: ContractByKind<TContracts, K['kind']>;
};

export type ContractMap<TContracts extends readonly PluginContract<string, any, any, any>[]> = {
  [K in keyof LaneAwareContract<TContracts> as K]: Readonly<LaneAwareContract<TContracts>[K]>;
};

export type ContractOutputs<TContracts extends readonly PluginContract<string, any, any, any>[]> = {
  [K in TContracts[number] as K extends PluginContract<infer TKind, any, any, any> ? TKind : never]:
    K extends PluginContract<string, any, infer TOutput, any> ? TOutput : never;
};

export interface LensInput<
  TContracts extends readonly PluginContract<string, any, any, any>[],
  TContext = unknown,
> {
  readonly workspace: string;
  readonly scenario: string;
  readonly mode: StrategyMode;
  readonly lane: StrategyLane;
  readonly tuple: StrategyTuple;
  readonly contracts: TContracts;
  readonly contextFactory: () => StrategyContext<TContext>;
}

export interface LensPlan<TContracts extends readonly PluginContract<string, any, any, any>[]> {
  readonly id: string;
  readonly scope: LensScope;
  readonly stage: LensPhase;
  readonly contracts: TContracts;
  readonly tuple: StrategyTuple;
  readonly contextFactory: () => StrategyContext;
}

export interface LensRunOutput<TContracts extends readonly PluginContract<string, any, any, any>[]> {
  readonly route: ScopeRoute;
  readonly scope: LensScope;
  readonly tuple: StrategyTuple;
  readonly plan: StrategyFlow<TContracts>['plan'];
  readonly outputs: Readonly<ContractOutputs<TContracts>>;
  readonly warnings: readonly string[];
}

export interface LensContext<T extends string = string> {
  readonly route: ScopeRoute;
  readonly scope: LensScope;
  readonly token: `${T}::context`;
  readonly metadata: Readonly<Record<string, unknown>>;
}

const laneByMode: Readonly<Record<StrategyMode, StrategyLane>> = {
  simulate: 'forecast',
  analyze: 'recovery',
  stress: 'containment',
  plan: 'resilience',
  synthesize: 'assurance',
};

const isInScope = (scope: LensScope, candidate: LensScope): boolean => scope === candidate || candidate === 'surface';

const asMode = (mode: string): StrategyMode =>
  mode === 'simulate' || mode === 'analyze' || mode === 'stress' || mode === 'plan' || mode === 'synthesize'
    ? (mode as StrategyMode)
    : 'simulate';

const safeStage = (mode: StrategyMode, fallback: LensPhase = 'capture'): LensPhase =>
  mode === 'simulate'
    ? 'capture'
    : mode === 'analyze'
      ? 'build'
      : mode === 'stress'
        ? 'verify'
        : mode === 'plan'
          ? 'simulate'
          : 'close';

export const makeLensPlan = <
  TContracts extends readonly PluginContract<string, any, any, any>[],
  TContext = unknown,
>(
  input: LensInput<TContracts, TContext>,
): LensPlan<TContracts> => {
  const stage = input.tuple[3] > 4 ? lensPhases.at(-1) ?? 'close' : lensPhases[input.tuple[3] % lensPhases.length];
  return {
    id: `lens:${input.workspace}::${input.scenario}::${input.tuple[2]}`,
    scope: input.tuple[0] === 'simulate' ? 'surface' : input.tuple[0] === 'plan' ? 'report' : 'runtime',
    stage,
    contracts: input.contracts,
    tuple: input.tuple,
    contextFactory: input.contextFactory,
  };
};

export const asContractTuple = <TContracts extends readonly PluginContract<string, any, any, any>[]>(
  contracts: TContracts,
): readonly [...TContracts] => [...contracts];

export const buildRegistryFlow = <
  TContracts extends readonly PluginContract<string, any, any, any>[],
  const TStages extends readonly StrategyMode[],
>(
  workspace: string,
  stages: TStages,
  contracts: TContracts,
): StrategyFlow<TContracts> => {
  const registry = createStrategyRegistry(workspace, stages, contracts);
  const entries = [...registry.entries()] as readonly {
    readonly contract: TContracts[number];
    readonly key: string;
  }[];
  const chain = entries.map((entry) => entry.contract) as unknown as StrategyFlow<TContracts>['chain'];

  const steps = entries.map((entry, index) => {
    const descriptor = buildDescriptor(entry.contract, 'lens-step', {
      timeoutMs: 2_000,
      retries: 1,
    }) as PluginDescriptor<TContracts[number], Record<string, unknown>>;
    return {
      stepId: asPluginId(entry.contract.id),
      index,
      plugin: asPluginId(entry.key),
      lane: entry.contract.lane,
      mode: entry.contract.mode,
      inputs: descriptor,
      output: descriptor,
      trace: {
        route: buildContractNamespace(entry.contract.kind, entry.contract.mode),
        attempts: 0,
        fingerprint: asPluginFingerprint(`${workspace}:${descriptor.key}`),
      },
    };
  }) as readonly StrategyStep[];

  return {
    chain,
    steps,
    plan: {
      planId: asPlanId(`plan:${workspace}`),
      sessionId: asSessionId(`session:${workspace}`),
      workspace: asWorkspaceId(workspace),
      scenario: asScenarioId(`${workspace}:seed`),
      title: `flow:${workspace}`,
      lanes: [laneByMode[stages[0] ?? 'simulate']],
      steps,
      metadata: {
        __schema: `recovery-lab-intelligence-core::runtime`,
        tuple: stages,
      },
    },
  };
};

export const asContractMap = <TContracts extends readonly PluginContract<string, any, any, any>[]>(
  contracts: TContracts,
): ContractMap<TContracts> => {
  const map = {} as ContractMap<TContracts>;
  for (const contract of contracts) {
    map[contract.kind as keyof ContractMap<TContracts>] = contract as never;
  }
  return map;
};

export const collectLensContractsByScope = <
  TContracts extends readonly PluginContract<string, any, any, any>[],
  TScope extends LensScope,
>(
  scope: TScope,
  contracts: TContracts,
): RegistryMap<TContracts> => {
  const registry = createStrategyRegistry(`registry:${scope}:${contracts.length}`, ['simulate', 'analyze', 'stress', 'plan', 'synthesize'], contracts);
  const list = [...registry.entries()] as readonly PluginDescriptor<TContracts[number], Record<string, unknown>>[];
  const bag = {} as RegistryMap<TContracts>;

  for (const entry of list.filter((entry) => isInScope(scope, 'report') || entry.contract.lane !== 'forecast')) {
    bag[entry.contract.kind as keyof RegistryMap<TContracts>] = entry.contract as never;
  }

  return bag;
};

export const runLensFlow = <
  TContracts extends readonly PluginContract<string, any, any, any>[],
  TOutput,
>(
  input: NoInfer<TContracts>,
  runner: (input: NoInfer<TContracts>, context: StrategyContext) => Promise<TOutput>,
): Promise<LensRunOutput<TContracts>> => {
  const flow = buildRegistryFlow(`flow:${input.length}`, ['simulate', 'analyze', 'stress', 'plan', 'synthesize'], input);
  const tuple = parseStrategyTuple([asMode(input[0]?.mode ?? 'simulate'), laneByMode[input[0]?.mode ?? 'simulate'], 'run', 1]);
  const context: StrategyContext = {
    sessionId: asSessionId(`session:${Date.now()}`),
    workspace: asWorkspaceId('flow'),
    runId: asRunId(`run:${Date.now()}`),
    planId: asPlanId(`plan:${Date.now()}`),
    scenario: asScenarioId('flow'),
    plugin: asPluginId('flow:plugin'),
    phase: {
      phase: tuple[0],
      lane: tuple[1],
      scenario: asScenarioId('flow'),
      runId: asRunId(`phase:${Date.now()}`),
      workspace: asWorkspaceId('flow'),
      mode: tuple[0],
      startedAt: new Date().toISOString(),
      payload: {},
    },
    baggage: {},
  };

  return Promise.resolve(input).then((contracts) => {
    void contracts;
    return runner(input, context).then(() => ({
      route: `runtime:${tuple.join('::')}` as ScopeRoute,
      scope: 'runtime',
      tuple,
      plan: flow.plan,
      outputs: {} as Readonly<ContractOutputs<TContracts>>,
      warnings: flow.steps.length > 0 ? ['flow-composed'] : ['flow-empty'],
    }));
  });
};

export const summarizeFlow = <
  TContracts extends readonly PluginContract<string, any, any, any>[],
  TOutput,
>(
  input: LensRunOutput<TContracts>,
  runner: (input: NoInfer<TContracts>, context: StrategyContext) => Promise<TOutput>,
): Promise<PluginExecutionResult<TOutput>> => {
  const sampleContext: StrategyContext = {
    sessionId: asSessionId('diagnostic-session'),
    workspace: asWorkspaceId('flow'),
    runId: asRunId('diagnostic-run'),
    planId: asPlanId('diagnostic-plan'),
    scenario: asScenarioId('flow'),
    plugin: asPluginId('diagnostic-plugin'),
    phase: {
      phase: 'simulate',
      lane: 'forecast',
      scenario: asScenarioId('flow'),
      runId: asRunId('diagnostic-phase'),
      workspace: asWorkspaceId('flow'),
      mode: 'simulate',
      startedAt: new Date().toISOString(),
      payload: {},
    },
    baggage: {},
  };

  return runner(input.outputs as never, sampleContext).then((output) => ({
    output,
    fingerprint: asPluginFingerprint(`plugin:${Date.now()}`),
    consumedMs: 1,
    warnings: ['summarize'],
    diagnostics: [
      {
        source: 'manual',
        severity: input.warnings.length > 0 ? 'warn' : 'info',
        at: new Date().toISOString(),
        detail: {
          route: input.route,
          mode: input.tuple[0],
        },
      },
    ],
  }));
};

export const normalizePhase = (phase: StrategyMode): LensPhase => safeStage(phase);

export const makeScopeRoute = (scope: LensScope, lane: StrategyLane): ScopeRoute => `${scope}:${lane}` as ScopeRoute;

export const buildLensEventStream = <TContracts extends readonly PluginContract<string, any, any, any>[]>(
  contracts: NoInfer<TContracts>,
): readonly LensContext[] => {
  return contracts.map((contract): LensContext<string> => ({
    route: `runtime:${contract.namespace}` as ScopeRoute,
    scope: contract.mode === 'simulate' ? 'surface' : 'runtime',
    token: `lens:${contract.kind}::context`,
    metadata: {
      namespace: contract.namespace,
      lane: contract.lane,
      mode: contract.mode,
    },
  }));
};

export const summarizeEventCounts = <TPayload extends Record<string, unknown>>(
  events: readonly SignalEvent[],
  payload: TPayload,
): {
  readonly payload: TPayload;
  readonly counts: Readonly<Record<SignalEvent['severity'], number>>;
} => ({
  payload,
  counts: events.reduce<Record<SignalEvent['severity'], number>>(
    (acc, event) => ({ ...acc, [event.severity]: (acc[event.severity] ?? 0) + 1 }),
    {
      info: 0,
      warn: 0,
      error: 0,
      critical: 0,
      fatal: 0,
    },
  ),
});

export const isScopeRelevant = (
  current: LensScope,
  candidate: LensScope,
): current is LensScope => isInScope(current, candidate);

export const lensScopeSignature = <T extends readonly LensScope[]>(scopes: T): readonly {
  readonly path: T[number];
  readonly route: string;
}[] =>
  scopes.map((scope) => ({
    path: scope,
    route: makeScopeRoute(scope, 'forecast'),
  }));
