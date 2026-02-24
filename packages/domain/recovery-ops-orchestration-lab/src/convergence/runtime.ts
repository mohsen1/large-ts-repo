import { buildMetricBuckets, normalizeTelemetryEvents, tracePluginEvent } from './telemetry';
import { detectCycles, summarizeGraph, withStableGraph } from './graph';
import {
  ConvergencePluginDescriptorV2,
  ConvergencePluginRegistry,
  defineConvergencePlugins,
} from './plugin-registry';
import type {
  ConvergenceDomainId,
  ConvergencePlan,
  ConvergencePhase,
  ConvergencePlanId,
  ConvergenceRunEvent,
  ConvergenceRunId,
  ConvergenceRunResult,
  ConvergencePluginConfig,
  ConvergenceTag,
  ConvergenceWorkspace,
  ConvergenceWorkspaceId,
  ConvergencePluginId,
} from './types';
import type { JsonValue } from '@shared/type-level';
import type { ConvergenceMetricName } from './telemetry';

type ProfileCatalog = {
  readonly source: string;
  readonly region: string;
  readonly regionScore: number;
};

const defaultProfiles: readonly ProfileCatalog[] = [
  {
    source: 'policy.default.discovery',
    region: 'us-east',
    regionScore: 81,
  },
  {
    source: 'policy.default.resilience',
    region: 'us-west',
    regionScore: 77,
  },
] as const;

const defaultPluginId = (value: string): ConvergencePluginId => `convergence-plugin:${value}` as ConvergencePluginId;
const asTag = (value: string): ConvergenceTag['key'] => `tag:${value}` as ConvergenceTag['key'];

export interface ConvergenceRuntimeConfig {
  readonly workspaceId: ConvergenceWorkspaceId;
  readonly domainId: ConvergenceDomainId;
  readonly plugins: readonly ConvergencePluginDescriptorV2[];
  readonly windowSeconds: number;
}

export interface ConvergenceRunContext {
  readonly runId: ConvergenceRunId;
  readonly workspaceId: ConvergenceWorkspaceId;
  readonly plugins: readonly ConvergencePluginId[];
  readonly phases: readonly ConvergencePhase[];
}

export interface ConvergenceEngineSummary {
  readonly runId: ConvergenceRunId;
  readonly workspaceId: ConvergenceWorkspaceId;
  readonly totalPlans: number;
  readonly selectedPlan?: ConvergencePlan;
  readonly pluginCount: number;
  readonly phases: readonly ConvergencePhase[];
}

export interface ConvergenceRuntime {
  readonly evaluate: (workspace: ConvergenceWorkspace, plans: readonly ConvergencePlan[]) => Promise<ConvergenceEngineSummary>;
  readonly run: (workspace: ConvergenceWorkspace, plans: readonly ConvergencePlan[]) => AsyncIterable<ConvergenceRunEvent>;
}

class FallbackAsyncDisposableStack {
  readonly #disposers: Array<() => Promise<void> | void> = [];

  public useDisposer(disposer: () => Promise<void> | void): void {
    this.#disposers.push(disposer);
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    for (let index = this.#disposers.length - 1; index >= 0; index -= 1) {
      await this.#disposers[index]?.();
    }
  }
}

const ensureStack = (): AsyncDisposableStack | FallbackAsyncDisposableStack => {
  const Ctor = (globalThis as { AsyncDisposableStack?: new () => AsyncDisposableStack }).AsyncDisposableStack;
  return Ctor ? new Ctor() : new FallbackAsyncDisposableStack();
};

const normalizeSignals = (workspace: ConvergenceWorkspace): number =>
  workspace.signals.reduce(
    (acc, signal) =>
      acc + signal.score * (signal.tier === 'l3' ? 3 : signal.tier === 'l2' ? 2 : 1),
    0,
  );

const buildFallbackPlans = (workspace: ConvergenceWorkspace): readonly ConvergencePlan[] => {
  if (workspace.plans.length > 0) {
    return workspace.plans;
  }

  return [
    {
      id: `${workspace.id}-fallback-plan` as ConvergencePlanId,
      workspaceId: workspace.id,
      title: 'fallback-plan',
      score: 0,
      steps: [],
      constraints: new Map(),
      createdAt: new Date().toISOString(),
      metadata: {},
    },
  ];
};

const normalizePlanScore = (plan: ConvergencePlan, signalScore: number): ConvergencePlan => ({
  ...plan,
  score: plan.score + signalScore,
});

const makeDiscoverEvent = (runId: ConvergenceRunId, phase: ConvergencePhase, plugin: ConvergencePluginId, elapsedMs: number): ConvergenceRunEvent => ({
  type: 'command',
  at: new Date().toISOString(),
  runId,
  phase,
  payload: {
    phase,
    plugin,
    elapsedMs,
  },
});

const asMetricEvent = (runId: ConvergenceRunId): ConvergenceRunEvent => ({
  type: 'metric',
  at: new Date().toISOString(),
  runId,
  phase: 'discover',
  payload: { score: 1 },
});

const defaultPlugins = (policies: readonly ConvergencePluginConfig<string>[]): readonly ConvergencePluginDescriptorV2[] =>
  [
    {
      id: defaultPluginId('discover'),
      label: 'discover',
      stages: ['discover', 'prioritize'],
      dependencies: [],
      config: {
        profile: policies[0]?.profile ?? 'discover',
        tags: policies[0]?.tags ?? [{ key: asTag('purpose:discover'), value: 'discover' }],
        enabled: true,
        metadata: policies[0]?.metadata,
      },
      weight: 10,
      pluginConfig: { profile: policies[0]?.profile ?? 'discover', tags: policies[0]?.tags ?? [], enabled: true, metadata: policies[0]?.metadata },
      execute: async (event) => ({
        output: {
          workspaceId: event.context.workspaceId,
          phase: event.phase,
          plugin: defaultPluginId('discover'),
        },
        events: [asMetricEvent(event.runId), makeDiscoverEvent(event.runId, event.phase, defaultPluginId('discover'), 1)],
        trace: {
          stage: event.phase,
          elapsedMs: 1,
          plugin: defaultPluginId('discover'),
        },
      }),
    },
    {
      id: defaultPluginId('simulate'),
      label: 'simulate',
      stages: ['simulate', 'rehearse'],
      dependencies: [defaultPluginId('discover')],
      config: {
        profile: policies[1]?.profile ?? 'simulate',
        tags: policies[1]?.tags ?? [{ key: asTag('purpose:simulate'), value: 'simulate' }],
        enabled: true,
        metadata: policies[1]?.metadata,
      },
      weight: 9,
      pluginConfig: { profile: policies[1]?.profile ?? 'simulate', tags: policies[1]?.tags ?? [], enabled: true, metadata: policies[1]?.metadata },
      execute: async (event) => ({
        output: {
          simulationDepth: event.context.phase,
          input: event.input,
        },
        events: [asMetricEvent(event.runId), makeDiscoverEvent(event.runId, event.phase, defaultPluginId('simulate'), 5)],
        trace: {
          stage: event.phase,
          elapsedMs: 5,
          plugin: defaultPluginId('simulate'),
        },
      }),
    },
    {
      id: defaultPluginId('verify'),
      label: 'verify',
      stages: ['verify', 'close'],
      dependencies: [defaultPluginId('simulate')],
      config: {
        profile: policies[0]?.profile ?? 'verify',
        tags: [{ key: asTag('purpose:verify'), value: 'verify' }],
        enabled: true,
      },
      weight: 6,
      pluginConfig: { profile: policies[0]?.profile ?? 'verify', tags: [{ key: asTag('purpose:verify'), value: 'verify' }], enabled: true },
      execute: async (event) => ({
        output: {
          verified: true,
          phase: event.phase,
        },
        events: [asMetricEvent(event.runId), makeDiscoverEvent(event.runId, event.phase, defaultPluginId('verify'), 3)],
        trace: {
          stage: event.phase,
          elapsedMs: 3,
          plugin: defaultPluginId('verify'),
        },
      }),
    },
  ];

const mergePolicies = (workspaceId: ConvergenceWorkspaceId): readonly ConvergencePluginConfig<string>[] => {
  return defaultProfiles.map((profile) => ({
    profile: `${workspaceId}:${profile.source}`,
    tags: [{ key: asTag(`region:${profile.region}`), value: profile.region }],
    enabled: true,
    metadata: { regionScore: profile.regionScore },
  }));
};

const buildRuntime = (config: ConvergenceRuntimeConfig): ConvergenceRuntime => {
  const policies = mergePolicies(config.workspaceId);
  const registry = new ConvergencePluginRegistry(
    defineConvergencePlugins([
      ...defaultPlugins(policies),
      ...config.plugins,
    ]),
  );
  const pluginIds = registry.getPluginIds();

  const evaluate = async (workspace: ConvergenceWorkspace, plans: readonly ConvergencePlan[]): Promise<ConvergenceEngineSummary> => {
    const signalScore = normalizeSignals(workspace);
    const sortedPlans = plans
      .map((plan) => normalizePlanScore(plan, signalScore))
      .toSorted((left, right) => right.score - left.score);
    const selected = sortedPlans[0];

    return {
      runId: `${workspace.id}:eval:${Date.now()}` as ConvergenceRunId,
      workspaceId: workspace.id,
      totalPlans: sortedPlans.length,
      selectedPlan: selected,
      pluginCount: pluginIds.length,
      phases: ['discover', 'prioritize', 'simulate', 'rehearse', 'verify', 'close'],
    };
  };

  const run = async function* (
    workspace: ConvergenceWorkspace,
    plans: readonly ConvergencePlan[],
  ): AsyncIterable<ConvergenceRunEvent> {
    const signalScore = normalizeSignals(workspace);
    const normalized = plans
      .map((plan) => normalizePlanScore(plan, signalScore))
      .toSorted((left, right) => right.score - left.score);

    const baseline = buildFallbackPlans(workspace);
    const graph = withStableGraph(baseline);
    const graphSummary = summarizeGraph(graph);
    const hasCycle = detectCycles(graph);
    const metricNames: readonly ConvergenceMetricName[] = ['latency', 'throughput', 'coverage', 'stability', 'errorRate', 'custom:runtime'];
    const metricBuckets = buildMetricBuckets(
      graphSummary.eventLog.map((_, index) => ({
        name: metricNames[index % metricNames.length],
        value: hasCycle ? -1 : graphSummary.pathCount,
        unit: 'score',
      })),
    );

    const runContext: ConvergenceRunContext = {
      runId: `${workspace.id}:run:${Date.now()}` as ConvergenceRunId,
      workspaceId: workspace.id,
      plugins: pluginIds,
      phases: ['discover', 'prioritize', 'simulate', 'rehearse', 'verify', 'close'],
    };

    const stack = ensureStack();
    await using _lease = stack;

    yield {
      type: 'metric',
      at: new Date().toISOString(),
      runId: runContext.runId,
      phase: 'discover',
      payload: metricBuckets,
    };

    for (const phase of runContext.phases) {
      const plugins = registry.candidatesForPhase(phase);
      const phaseTrace = Iterator.from(plugins)
        .map((plugin) => tracePluginEvent(phase, plugin.id, graphSummary.pathCount))
        .toArray()
        .map((entry, index) => makeDiscoverEvent(runContext.runId, phase, entry.plugin, entry.elapsedMs + index * 10));

      for (const entry of phaseTrace) {
        yield entry;
      }

      const outputs = await registry.runPhase(
        phase,
        {
          workspaceId: workspace.id,
          runId: runContext.runId,
          phase,
          startedAt: new Date().toISOString(),
        },
        {
          planCount: normalized.length,
          runContext,
        } as never,
        runContext.runId,
      );

      for (const entry of outputs) {
        yield {
          type: 'phase',
          at: new Date().toISOString(),
          runId: runContext.runId,
          phase,
          payload: {
            plugin: entry.trace.plugin,
            elapsedMs: entry.trace.elapsedMs,
          },
        };
      }
    }

    yield {
      type: 'metric',
      at: new Date().toISOString(),
      runId: runContext.runId,
      phase: 'close',
      payload: normalizeTelemetryEvents(graphSummary.eventLog) as unknown as JsonValue,
    };
  };

  return { evaluate, run };
};

const defaultConfig: ConvergenceRuntimeConfig = {
  workspaceId: 'convergence:default' as ConvergenceWorkspaceId,
  domainId: 'domain:default' as ConvergenceDomainId,
  windowSeconds: 300,
  plugins: [],
};

export const createConvergenceRuntime = (overrides?: Partial<ConvergenceRuntimeConfig>): ConvergenceRuntime =>
  buildRuntime({ ...defaultConfig, ...overrides, plugins: overrides?.plugins ?? defaultConfig.plugins });

export const createRunSnapshot = (result: ConvergenceRunResult, workspace: ConvergenceWorkspace): ConvergenceRunEvent[] => {
  const event: ConvergenceRunEvent = {
    type: 'metric',
    at: new Date().toISOString(),
    runId: result.runId,
    phase: 'verify',
    payload: {
      workspaceId: workspace.id,
      runId: result.runId,
      durationMs: result.durationMs,
      status: result.status,
      eventCount: result.events.length,
    },
  };
  return [event, ...result.events];
};
