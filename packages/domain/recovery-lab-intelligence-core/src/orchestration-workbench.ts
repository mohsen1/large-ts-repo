import { Brand, type ReadonlyDeep } from '@shared/core';
import type { NoInfer } from '@shared/type-level';
import type {
  SessionId,
  RunId,
  WorkspaceId,
  ScenarioId,
  PlanId,
  StrategyContext,
  StrategyLane,
  StrategyMode,
  StrategyPlan,
  StrategyResult,
  StrategyTuple,
  SignalEvent,
} from './types';
import {
  asPlanId,
  asPluginId,
  asRunId,
  asScenarioId,
  asSessionId,
  asWorkspaceId,
  laneRouteFor,
  withNoInfer,
} from './types';
import { laneFromSeverity } from './advanced-types';
import { parseStrategyTuple } from './schema';
import { runIntelligencePlan, type ServiceRequest } from './service';
import { summarizeEvents } from './telemetry';
import { createRegistry, StrategyRegistry } from './registry';
import type { PluginContract } from './contracts';

export const workbenchModes = ['simulate', 'analyze', 'stress', 'plan', 'synthesize'] as const;
export const workbenchLanes = ['forecast', 'resilience', 'containment', 'recovery', 'assurance'] as const;
export type WorkbenchMode = (typeof workbenchModes)[number];
export type WorkbenchLane = (typeof workbenchLanes)[number];
export type WorkspaceKey<T extends string = string> = `${T}::${string}`;
export type WorkbenchRoute = `workbench:${string}`;
export type WorkbenchMetaSchema = `recovery-lab-intelligence-core::${string}`;
export type RunReportChannel = 'catalog' | 'plan' | 'signal' | 'result';

export interface WorkbenchManifest {
  readonly route: WorkbenchRoute;
  readonly workspace: WorkspaceId;
  readonly scenario: ScenarioId;
  readonly tuple: StrategyTuple;
}

export interface WorkbenchEnvelope<TInput = Record<string, unknown>, TOutput = unknown> {
  readonly manifest: WorkbenchManifest;
  readonly plan: StrategyPlan & {
    readonly metadata: Readonly<Record<string, unknown>> & { readonly __schema: WorkbenchMetaSchema };
  };
  readonly input: TInput;
  readonly output: ReadonlyDeep<TOutput>;
  readonly signals: readonly SignalEvent[];
  readonly score: number;
}

export interface WorkbenchSession<TInput = Record<string, unknown>, TOutput = unknown> {
  readonly context: WorkbenchContext;
  readonly registry: StrategyRegistry<any, readonly WorkbenchMode[]>;
  readonly output: StrategyResult<TOutput>;
  readonly envelope: WorkbenchEnvelope<TInput, TOutput>;
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
}

export interface WorkbenchContext {
  readonly workspace: WorkspaceId;
  readonly scenario: ScenarioId;
  readonly planId: PlanId;
  readonly runId: RunId;
  readonly sessionId: SessionId;
  readonly mode: WorkbenchMode;
  readonly lane: WorkbenchLane;
}

export type ManifestTuple<T extends readonly StrategyTuple[]> = T extends readonly [
  infer Head extends StrategyTuple,
  ...infer Rest extends readonly StrategyTuple[],
]
  ? readonly [Head, ...ManifestTuple<Rest>]
  : readonly [];

export type WorkbenchRegistrySnapshot<TContracts extends readonly PluginContract<string, any, any, any>[]> = {
  readonly size: number;
  readonly map: {
    [K in TContracts[number] as K['kind'] & string]: K;
  };
};

const asMode = (source: string): WorkbenchMode =>
  workbenchModes.includes(source as WorkbenchMode) ? (source as WorkbenchMode) : 'simulate';

const asLane = (source: string): WorkbenchLane =>
  workbenchLanes.includes(source as WorkbenchLane) ? (source as WorkbenchLane) : 'forecast';

export const workbenchTuple = (mode: WorkbenchMode, lane: WorkbenchLane, runId: string): StrategyTuple =>
  parseStrategyTuple([mode, lane, `workbench-${runId}`, Math.max(1, runId.length % 9)]);

export const buildWorkbenchManifest = (workspace: string, scenario: string, tuple: StrategyTuple): WorkbenchManifest => ({
  route: `workbench:${workspace}::${tuple[0]}` as WorkbenchRoute,
  workspace: asWorkspaceId(workspace),
  scenario: asScenarioId(scenario),
  tuple,
});

export const buildWorkbenchContext = (
  workspace: string,
  scenario: string,
  mode: WorkbenchMode = 'simulate',
  lane: WorkbenchLane = 'forecast',
): WorkbenchContext => ({
  workspace: asWorkspaceId(workspace),
  scenario: asScenarioId(scenario),
  planId: asPlanId(`plan:${workspace}:${scenario}`),
  runId: asRunId(`run:${workspace}:${Date.now()}`),
  sessionId: asSessionId(`session:${workspace}:${Date.now()}`),
  mode,
  lane,
});

type WorkbenchRegistry<TContracts extends readonly PluginContract<string, any, any, any>[]> = StrategyRegistry<
  TContracts,
  readonly WorkbenchMode[]
>;

export const createWorkbenchRegistry = <
  const TContracts extends readonly PluginContract<string, any, any, any>[],
  const TStages extends readonly WorkbenchMode[],
>(
  workspace: WorkspaceId,
  stages: TStages,
  contracts: TContracts,
): WorkbenchRegistry<TContracts> => createRegistry(String(workspace), stages, contracts);

export const collectRegistrySnapshot = <TContracts extends readonly PluginContract<string, any, any, any>[]>(contracts: TContracts): WorkbenchRegistrySnapshot<TContracts> => {
  const registry = createWorkbenchRegistry(asWorkspaceId('snapshot'), ['simulate', 'analyze', 'stress', 'plan', 'synthesize'], contracts);
  const entries = [...registry.entries()] as readonly { readonly contract: TContracts[number]; readonly key: string }[];
  const map = entries.reduce<WorkbenchRegistrySnapshot<TContracts>['map']>(
    (acc, entry) => ({ ...acc, [entry.contract.kind]: entry.contract }),
    {} as WorkbenchRegistrySnapshot<TContracts>['map'],
  );
  return {
    size: entries.length,
    map,
  };
};

export const findByKind = <
  TContracts extends readonly PluginContract<string, any, any, any>[],
  TKind extends TContracts[number]['kind'],
>(
  snapshot: WorkbenchRegistrySnapshot<TContracts>,
  kind: NoInfer<TKind>,
): TContracts[number] | undefined =>
  snapshot.map[kind as keyof WorkbenchRegistrySnapshot<TContracts>['map']] as TContracts[number] | undefined;

const routeSignature = (path: string): Brand<string, 'RouteSignature'> => `${path}::signature` as Brand<string, 'RouteSignature'>;

export const summarizeWorkbenchSignals = (events: readonly SignalEvent[]): Readonly<Record<SignalEvent['severity'], number>> => {
  return events.reduce<Record<SignalEvent['severity'], number>>((acc, event) => {
    const lane = laneFromSeverity(event.severity);
    const weight = lane === 'assurance' ? 4 : 1;
    return { ...acc, [event.severity]: (acc[event.severity] ?? 0) + weight };
  }, {
    info: 0,
    warn: 0,
    error: 0,
    critical: 0,
    fatal: 0,
  });
};

export const summarizeWorkbenchTuple = (manifest: WorkbenchManifest): WorkspaceKey =>
  `${manifest.workspace}::${manifest.scenario}::${manifest.route}::${manifest.tuple[2]}`;

export const normalizeWorkbenchTuple = <TMode extends StrategyMode>(
  tuple: StrategyTuple,
  mode: NoInfer<TMode>,
): StrategyTuple =>
  [mode, tuple[1], `${tuple[2]}:${mode}`, tuple[3]] as StrategyTuple;

type AnyWorkspaceStack = {
  dispose(): void;
  disposeAsync(): Promise<void>;
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
};

const fallbackStack: AnyWorkspaceStack = {
  dispose: () => {
    return;
  },
  disposeAsync: () => Promise.resolve(),
  [Symbol.dispose]() {},
  [Symbol.asyncDispose]() {
    return Promise.resolve();
  },
};

const createSessionStack = (): AnyWorkspaceStack => {
  const candidate = globalThis as unknown as {
    AsyncDisposableStack?: new () => {
      dispose(): void;
      disposeAsync(): Promise<void>;
    };
  };

  if (candidate.AsyncDisposableStack === undefined) {
    return fallbackStack;
  }

  try {
    const stack = new candidate.AsyncDisposableStack();
    return {
      [Symbol.dispose]() {
        stack.dispose();
      },
      [Symbol.asyncDispose]() {
        return stack.disposeAsync();
      },
      dispose: () => {
        stack.dispose();
      },
      disposeAsync: () => stack.disposeAsync(),
    };
  } catch {
    return fallbackStack;
  }
};

export const buildPlanEnvelope = async <TInput extends Record<string, unknown>, TOutput = unknown>(
  input: TInput,
  build: (context: WorkbenchContext, input: TInput) => Promise<WorkbenchEnvelope<TInput, TOutput>>,
): Promise<WorkbenchEnvelope<TInput, TOutput>> => {
  const context = buildWorkbenchContext('default-workspace', 'default-scenario', 'analyze', 'recovery');
  return build(context, input);
};

export const runWorkbench = async <
  TInput extends Record<string, unknown>,
  TContracts extends readonly PluginContract<string, any, any, any>[],
  TOutput = unknown,
>(
  input: TInput,
  contracts: TContracts,
  mode: WorkbenchMode = 'simulate',
  lane: WorkbenchLane = 'forecast',
): Promise<WorkbenchSession<TInput, TOutput>> => {
  const context = buildWorkbenchContext('default-workspace', 'default-scenario', mode, lane);
  const registry = createWorkbenchRegistry(context.workspace, ['simulate', 'analyze', 'stress', 'plan', 'synthesize'], contracts);
  const tuple = workbenchTuple(context.mode, context.lane, context.runId);
  const manifest = buildWorkbenchManifest(String(context.workspace), String(context.scenario), tuple);
  const response = await runIntelligencePlan<TInput, TOutput>({
    workspace: String(context.workspace),
    scenario: String(context.scenario),
    mode: context.mode,
    lane: context.lane,
    seed: input,
    tuple,
  });

  const envelope = await buildPlanEnvelope<TInput, TOutput>(input, async (planContext, payload) => {
    const baseMetadata = response.plan.metadata as Record<string, unknown>;
    return {
      manifest,
      plan: {
        ...response.plan,
        metadata: {
          ...baseMetadata,
          __schema: 'recovery-lab-intelligence-core::runtime',
          route: manifest.route,
          lane: planContext.lane,
          mode: planContext.mode,
        },
      },
      input: payload,
      output: response.result.output,
      signals: response.result.events,
      score: response.result.score,
    };
  });

  const signature = routeSignature(`${laneRouteFor(context.lane)}:${manifest.route}:${asMode(mode)}:${asLane(lane)}`);
  summarizeEvents(response.result.events);

  const session: WorkbenchSession<TInput, TOutput> = {
    context,
    registry,
    output: {
      ...response.result,
      mode: response.result.mode,
      scenario: asScenarioId(response.result.scenario),
    },
    envelope: {
      ...envelope,
      manifest: {
        ...manifest,
        route: signature as WorkbenchRoute,
      },
    },
    [Symbol.dispose]() {
      void registry[Symbol.asyncDispose]();
    },
    async [Symbol.asyncDispose]() {
      await registry[Symbol.asyncDispose]();
    },
  };

  return session;
};

export const runWorkbenchSeries = async <
  TInput extends Record<string, unknown>,
  TContracts extends readonly PluginContract<string, any, any, any>[],
  TOutput = unknown,
>(
  requests: readonly { readonly input: TInput; readonly mode: WorkbenchMode; readonly lane: WorkbenchLane }[],
  contracts: TContracts,
): Promise<readonly WorkbenchSession<TInput, TOutput>[]> => {
  const sessions: WorkbenchSession<TInput, TOutput>[] = [];
  const stack = createSessionStack();
  try {
    for (const request of requests) {
      const session = await runWorkbench<TInput, TContracts, TOutput>(request.input, contracts, request.mode, request.lane);
      sessions.push(session);
    }
    return sessions;
  } finally {
    await stack[Symbol.asyncDispose]();
  }
};

export interface WorkbenchExecutionPlan<TInput> extends ServiceRequest<TInput> {
  readonly manifestKey?: string;
}

export const buildWorkbenchExecutionPlan = <TInput extends Record<string, unknown>>(
  workspace: string,
  scenario: string,
  mode: WorkbenchMode,
  lane: WorkbenchLane,
  seed: TInput,
): WorkbenchExecutionPlan<TInput> => ({
  workspace,
  scenario,
  mode,
  lane,
  seed,
  manifestKey: `${workspace}::${scenario}::${mode}::${lane}`,
});

export const runWorkbenchFromPlan = async <TInput extends Record<string, unknown>, TOutput = unknown>(
  plan: WorkbenchExecutionPlan<TInput>,
): Promise<StrategyResult<TOutput>> => {
  const response = await runIntelligencePlan<TInput, TOutput>({
    workspace: plan.workspace,
    scenario: plan.scenario,
    mode: plan.mode,
    lane: plan.lane,
    seed: plan.seed,
    tuple: parseStrategyTuple([plan.mode, plan.lane, plan.manifestKey ?? 'workbench', Date.now()]),
  });
  return response.result;
};

export type WorkbenchSessionTuple<T extends readonly WorkbenchExecutionPlan<Record<string, unknown>>[]> = T extends readonly [
  infer Head extends WorkbenchExecutionPlan<Record<string, unknown>>,
  ...infer Tail extends readonly WorkbenchExecutionPlan<Record<string, unknown>>[],
]
  ? readonly [Head, ...WorkbenchSessionTuple<Tail>]
  : readonly [];

export const summarizeWorkbenchSessions = <
  TInputs extends readonly WorkbenchExecutionPlan<Record<string, unknown>>[],
>(
  plans: TInputs,
): {
  readonly planCount: number;
  readonly workspaceCount: number;
  readonly tupleSignature: StrategyTuple;
  readonly normalized: WorkbenchSessionTuple<TInputs>;
} => {
  const unique = new Set(plans.map((plan) => plan.workspace));
  const tuple = parseStrategyTuple([plans[0]?.mode ?? 'simulate', plans[0]?.lane ?? 'forecast', 'workbench', plans.length]) satisfies StrategyTuple;
  const normalized = plans.map((plan) => ({
    ...plan,
  })) as unknown as WorkbenchSessionTuple<TInputs>;

  return {
    planCount: plans.length,
    workspaceCount: unique.size,
    tupleSignature: tuple,
    normalized,
  };
};
