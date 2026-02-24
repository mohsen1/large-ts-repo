import { type NoInfer, type RecursivePath } from '@shared/type-level';
import {
  BuildRouteFromKinds,
  type PluginConfig,
  type PluginContract,
  type PluginStage,
  type StageLabel,
  type HorizonSignal,
  type JsonLike,
  type TimeMs,
  type HorizonInput,
  type HorizonPlan,
  type RunId,
} from './types.js';
import { horizonBrand } from './types.js';
import {
  type BuildWindowKey,
  type StageTransitionPairs,
  type StageReachabilityMap,
  buildReachability,
} from './mesh-advanced-types.js';
import {
  buildTopology,
  type NetworkBlueprint,
} from './plugin-network.js';

export type PipelineWindow<TWindow extends readonly PluginStage[]> = TWindow;

export type PipelineContract<TWindow extends readonly PluginStage[]> =
  readonly PluginContract<TWindow[number], PluginConfig<TWindow[number], JsonLike>, JsonLike>[];

export type PipelineExecution<TWindow extends readonly PluginStage[], TPayload> = {
  readonly window: BuildWindowKey<TWindow>;
  readonly route: Readonly<StageTransitionPairs<TWindow>>;
  readonly contracts: PipelineContract<TWindow>;
  readonly payload: readonly HorizonSignal<TWindow[number], TPayload>[];
};

export interface PipelineArtifact<TWindow extends readonly PluginStage[], TPayload> {
  readonly id: RunId;
  readonly tenantId: string;
  readonly window: TWindow;
  readonly plan: HorizonPlan<TWindow[number]>;
  readonly path: string;
  readonly execution: PipelineExecution<TWindow, TPayload>;
}

export type PipelineNode<TWindow extends readonly PluginStage[]> = {
  readonly kind: TWindow[number];
  readonly route: string;
  readonly labels: readonly string[];
};

export type PluginWindow<TWindow extends readonly PluginStage[]> = TWindow;

export type SignalBundle<TWindow extends readonly PluginStage[], TPayload> = {
  readonly stage: TWindow[number];
  readonly signals: readonly HorizonSignal<TWindow[number], TPayload>[];
};

export interface PipelineRegistry<TWindow extends readonly PluginStage[]> {
  readonly window: PluginWindow<TWindow>;
  readonly edges: readonly {
    readonly from: TWindow[number];
    readonly to: TWindow[number];
  }[];
  readonly reachability: StageReachabilityMap<TWindow>;
}

export interface PipelineTrace<TWindow extends readonly PluginStage[]> {
  readonly at: TimeMs;
  readonly event: string;
  readonly path: string;
  readonly stage: TWindow[number];
}

export type PipelineRecord<TWindow extends readonly PluginStage[], TPayload> = {
  readonly artifact: PipelineArtifact<TWindow, TPayload>;
  readonly topology: NetworkBlueprint<TWindow>;
  readonly registry: PipelineRegistry<TWindow>;
  readonly trace: readonly PipelineTrace<TWindow>[];
};

const now = (): TimeMs => horizonBrand.fromTime(Date.now()) as TimeMs;

type PlanWindowPayload = {
  readonly stageWindow?: readonly PluginStage[];
  readonly contracts?: PipelineContract<readonly PluginStage[]>;
  readonly [key: string]: unknown;
};

const extractPlanPayload = (plan: HorizonPlan<PluginStage>): PlanWindowPayload =>
  (plan.payload as PlanWindowPayload | undefined) ?? {};

export const resolveWindow = <TWindow extends readonly PluginStage[]>(
  requested: NoInfer<TWindow>,
  fallback: PluginWindow<TWindow>,
): PluginWindow<TWindow> =>
  requested.length === 0 ? fallback : requested;

export const deriveRoute = <TWindow extends readonly PluginStage[]>(
  window: NoInfer<TWindow>,
): Readonly<StageTransitionPairs<TWindow>> => {
  const out: string[] = [];
  for (let index = 0; index + 1 < window.length; index += 1) {
    out.push(`${window[index]}:${window[index + 1]}`);
  }
  return out as unknown as Readonly<StageTransitionPairs<TWindow>>;
};

export const buildPipelineRegistry = <TWindow extends readonly PluginStage[]>(
  window: NoInfer<TWindow>,
): PipelineRegistry<TWindow> => {
  const edges = deriveRoute(window).map((entry) => {
    const [from, to] = entry.split(':');
    return { from: from as TWindow[number], to: to as TWindow[number] };
  });

  return {
    window: window as PluginWindow<TWindow>,
    edges,
    reachability: buildReachability(window),
  };
};

export const buildReachabilityMap = <TWindow extends readonly PluginStage[]>(
  window: NoInfer<TWindow>,
): StageReachabilityMap<TWindow> => buildPipelineRegistry(window).reachability;

export const buildSignalBundle = <TWindow extends readonly PluginStage[], TPayload extends JsonLike>(
  signals: readonly HorizonSignal<TWindow[number], TPayload>[],
): SignalBundle<TWindow, TPayload>[] => {
  const grouped = new Map<TWindow[number], HorizonSignal<TWindow[number], TPayload>[]>();
  for (const signal of signals) {
    const existing = grouped.get(signal.kind) ?? [];
    existing.push(signal);
    grouped.set(signal.kind, existing);
  }

  return [...grouped.entries()].map(([stage, list]) => ({
    stage,
    signals: list,
  }));
};

export const summarizePlanPath = <TWindow extends readonly PluginStage[]>(
  plan: HorizonPlan<PluginStage>,
): BuildWindowKey<TWindow> => {
  const source = extractPlanPayload(plan).stageWindow as PluginStage[] | undefined;
  if (!source || source.length === 0) {
    return 'empty' as BuildWindowKey<TWindow>;
  }
  return source.join('>') as BuildWindowKey<TWindow>;
};

export const normalizeTopologySignature = <TWindow extends readonly PluginStage[]>(
  tenantId: string,
  window: NoInfer<TWindow>,
  plan: HorizonPlan<PluginStage>,
): string => `${tenantId}#${summarizePlanPath<TWindow>(plan)}#${window.length}`;

export const makeTopologyPipeline = <TWindow extends readonly PluginStage[]>(
  tenantId: string,
  window: NoInfer<TWindow>,
  plan: HorizonPlan<PluginStage>,
): PipelineRecord<TWindow, JsonLike> => {
  const contracts = resolveContractsFromPlan(plan, window);
  const registry = buildPipelineRegistry(window);
  const signature = normalizeTopologySignature(tenantId, window, plan);

  const nodes = registry.edges
    .flatMap((entry) => [entry.from, entry.to])
    .filter((entry, index, list) => list.indexOf(entry) === index)
    .map((stage) => ({
      kind: stage,
      route: `route:${stage}`,
      labels: [stage, tenantId] as const,
    }));

  return {
    artifact: {
      id: horizonBrand.fromRunId(`${tenantId}:${plan.id}:${signature}`),
      tenantId,
      window: window as TWindow,
      plan: plan as HorizonPlan<TWindow[number]>,
      path: `pipeline:${signature}`,
      execution: {
        window: summarizePlanPath<TWindow>(plan),
        route: deriveRoute(window),
        contracts,
        payload: [],
      },
    },
    topology: buildTopology(tenantId, window, contracts),
    registry,
    trace: nodes.map<PipelineTrace<TWindow>>((entry) => ({
      at: now(),
      event: 'node',
      path: entry.route,
      stage: entry.kind,
    })),
  };
};

export const normalizeInput = <TKind extends PluginStage>(
  input: HorizonInput<TKind>,
): HorizonInput<TKind> => input;

export const composeBundle = <
  TWindow extends readonly PluginStage[],
  TPayload extends JsonLike,
>(
  bundles: readonly SignalBundle<TWindow, TPayload>[],
): readonly HorizonSignal<TWindow[number], TPayload>[] =>
  bundles.flatMap((bundle) => bundle.signals);

export const buildExecution = <
  TWindow extends readonly PluginStage[],
  TPayload extends JsonLike = JsonLike,
>(
  plans: readonly HorizonPlan<PluginStage>[],
  records: readonly SignalBundle<TWindow, TPayload>[],
): readonly PipelineExecution<TWindow, TPayload>[] =>
  plans.map((plan) => ({
    window: summarizePlanPath<TWindow>(plan),
    route: deriveRoute(
      resolveWindow(
        extractPlanPayload(plan).stageWindow as PluginWindow<TWindow>,
        ['ingest'] as unknown as PluginWindow<TWindow>,
      ),
    ),
    contracts: resolveContractsFromPlan(plan, extractPlanPayload(plan).stageWindow as PluginWindow<TWindow>),
    payload: composeBundle(records),
  }));

export const resolveContractsFromPlan = <TWindow extends readonly PluginStage[]>(
  plan: HorizonPlan<PluginStage>,
  window: NoInfer<TWindow>,
): PipelineContract<TWindow> => {
  const hint = extractPlanPayload(plan).contracts as PipelineContract<TWindow> | undefined;
  if (!hint) {
    const generated = [] as Array<
      PluginContract<TWindow[number], PluginConfig<TWindow[number], JsonLike>, JsonLike>
    >;
    if (window.length === 0) {
      return generated;
    }

    for (const entry of window) {
      generated.push({
        kind: entry,
        id: `${entry}:${window.indexOf(entry)}` as PluginContract<TWindow[number], PluginConfig<TWindow[number], JsonLike>, JsonLike>['id'],
        capabilities: [{
          key: entry,
          description: `generated:${entry}`,
          configSchema: { source: 'runtime-composition', stage: entry },
        }],
        defaults: {
          pluginKind: entry,
          payload: { stage: entry, generated: true },
          retryWindowMs: horizonBrand.fromTime(120),
        },
        execute: async (
          inputs: readonly PluginConfig<TWindow[number], JsonLike>[],
        ): Promise<readonly HorizonSignal<TWindow[number], JsonLike>[]> =>
          inputs.map((entryInput: PluginConfig<TWindow[number], JsonLike>, offset: number) => ({
            id: horizonBrand.fromPlanId(`fallback:${entryInput.pluginKind}:${offset}`),
            kind: entryInput.pluginKind as TWindow[number],
            payload: entryInput.payload,
            input: {
              version: '1.0.0',
              runId: horizonBrand.fromRunId(`fallback:${entry}:${offset}`),
              tenantId: 'tenant-001',
              stage: entry,
              tags: ['fallback', 'runtime-composition'],
              metadata: { source: 'fallback', windowStage: String(entry) },
            },
            severity: 'low',
            startedAt: horizonBrand.fromDate(new Date(now()).toISOString()),
          })) as readonly HorizonSignal<TWindow[number], JsonLike>[],
      });
    }

    return generated as PipelineContract<TWindow>;
  }
  return hint;
};

export const bindWindow = <TWindow extends readonly PluginStage[], TPayload = JsonLike>(
  stageWindow: NoInfer<TWindow>,
  signals: readonly HorizonSignal<TWindow[number], TPayload>[],
): PipelineArtifact<TWindow, TPayload> => {
  const planPayload: PlanWindowPayload = {
    stageWindow,
    contracts: {} as PipelineContract<TWindow>,
  };
  const anchor = stageWindow[0] ?? 'ingest';

  return {
    id: horizonBrand.fromRunId(`artifact:${anchor}:${horizonBrand.fromTime(Date.now())}`),
    tenantId: 'tenant-001',
    window: stageWindow as TWindow,
    plan: {
      id: horizonBrand.fromPlanId(`bind:${anchor}:${stageWindow.length}`),
      tenantId: 'tenant-001',
      startedAt: now(),
      pluginSpan: {
        stage: anchor,
        label: `${anchor.toUpperCase()}_STAGE` as StageLabel<PluginStage> as StageLabel<TWindow[number]>,
        startedAt: now(),
      },
      payload: planPayload as HorizonPlan<TWindow[number]>['payload'],
    },
    path: `bind:${stageWindow.join('|')}`,
    execution: {
      window: stageWindow.join('>') as BuildWindowKey<TWindow>,
      route: deriveRoute(stageWindow),
      contracts: planPayload.contracts as PipelineContract<TWindow>,
      payload: signals,
    },
  };
};

export const summarizePipelineRoute = (
  route: BuildRouteFromKinds<readonly PluginStage[]>,
): RecursivePath<{ route: string }> => `pipeline.${route}` as RecursivePath<{ route: string }>;
