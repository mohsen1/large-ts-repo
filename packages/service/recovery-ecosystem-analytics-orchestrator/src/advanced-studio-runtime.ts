import { createInMemorySignalAdapter } from './adapters';
import { runScenarioWithEngine } from './orchestrator';
import { createPlanCatalogOrchestratorRuntime, type PlanCatalogRuntimeFacade } from './catalog-orchestrator-runtime';
import type { AnalyzeRequest, OrchestratorDependencies, OrchestratorOptions } from './ports';
import type { JsonValue } from '@shared/type-level';
import { catalogPlanFromPhases } from '@data/recovery-ecosystem-analytics-plan-catalog';
import {
  asNamespace,
  asPlan,
  asRun,
  asSession,
  asTenant,
  asWindow,
  type PluginNode,
  summarizeSignalsByKind,
  evaluateMetricPoints,
  type AnalyticsPlanRecord,
  type PluginRunInput,
} from '@domain/recovery-ecosystem-analytics';
import { ok, fail, type Result } from '@shared/result';
import { mapWithIteratorHelpers } from '@shared/type-level';

export interface StudioRuntimePlan {
  readonly route: readonly string[];
  readonly status: 'ready' | 'error';
  readonly score: number;
}

export interface StudioScenarioResult {
  readonly runId: ReturnType<typeof asRun>;
  readonly resultCount: number;
  readonly metric: number;
  readonly traces: readonly string[];
}

export interface AdvancedStudioService {
  readonly prepare: (seedPlugins: readonly string[]) => Promise<Result<StudioRuntimePlan>>;
  readonly run: (
    tenant: string,
    namespace: string,
    payloads: readonly { kind: string; payload: JsonValue }[],
  ) => Promise<Result<StudioScenarioResult>>;
  readonly close: () => Promise<Result<void>>;
}

type RuntimeTrace = readonly string[];
type StudioPlugin = PluginNode<string, 'studio', PluginRunInput, PluginRunResult, string>;

interface PluginRunResult {
  readonly plugin: string;
  readonly accepted: boolean;
  readonly signalCount: number;
  readonly payload: JsonValue;
  readonly diagnostics: readonly {
    readonly step: string;
    readonly latencyMs: number;
  }[];
}

const normalizeSignal = (value: string): `signal:${string}` => {
  const normalized = value.toLowerCase().trim();
  return normalized.startsWith('signal:') ? (normalized as `signal:${string}`) : (`signal:${normalized}` as `signal:${string}`);
};

const buildSeedPlugins = (signals: readonly string[]): readonly StudioPlugin[] =>
  mapWithIteratorHelpers(signals, (signal, index) => ({
    name: `plugin:${signal.replace(/^signal:/, '')}` as const,
    namespace: `namespace:${signal}` as const,
    kind: 'plugin:studio' as const,
    dependsOn: [] as const,
    inputKinds: ['in:studio'] as const,
    outputKinds: ['out:studio'] as const,
    weight: index + 1,
    signature: 'studio',
    version: 'v1' as const,
    run: async (input: PluginRunInput): Promise<PluginRunResult> => ({
      plugin: `plugin:${signal.replace(/^signal:/, '')}` as const,
      accepted: true,
      signalCount: Number(input.value ?? 0),
      payload: input.payload,
      diagnostics: [{ step: signal, latencyMs: 1 }],
    }),
  }));

const buildTraces = (runId: ReturnType<typeof asRun>, results: readonly PluginRunResult[]): RuntimeTrace =>
  mapWithIteratorHelpers(results, (entry, index) => `${runId}:${index}:${entry.plugin}`);

const summarizeMetric = (results: readonly PluginRunResult[]): number =>
  results.reduce((acc, entry) => acc + entry.signalCount, 0) / Math.max(1, results.length);

const runToInputs = (runId: ReturnType<typeof asRun>, payloads: readonly { kind: string; payload: JsonValue }[]): PluginRunInput[] =>
  payloads.map((entry, index) => ({
    runId: asRun(`${runId}:${index}`),
    kind: normalizeSignal(entry.kind),
    namespace: asNamespace('namespace:studio'),
    at: new Date().toISOString(),
    value: index + 1,
    payload: entry.payload,
  }));

const buildStudioCatalogPlan = (plugins: readonly string[], tenant: string): AnalyticsPlanRecord => {
  const normalizedTenant = tenant.replace(/^tenant:/, '');
  const normalizedNamespace = tenant.replace(/^tenant:/, '');
  const catalogPlan = catalogPlanFromPhases(
    normalizedTenant || 'studio',
    normalizedNamespace || 'studio',
    plugins,
  );
  return {
    ...catalogPlan,
    planId: asPlan(`studio-${tenant}-${plugins.length}`),
    window: asWindow(`window:studio-${normalizedTenant || 'studio'}`),
  };
};

const seedPluginsFromPayload = (payloads: readonly { kind: string; payload: JsonValue }[], tenant: string): readonly string[] =>
  payloads.map((entry, index) => `${tenant}:${entry.kind}:${index}`);

export class RecoveryStudioRuntime implements AdvancedStudioService {
  readonly #dependencies: OrchestratorDependencies;
  readonly #options: OrchestratorOptions;
  readonly #stack = new AsyncDisposableStack();
  readonly #catalogRuntime: PlanCatalogRuntimeFacade;
  #closed = false;

  constructor(dependencies: OrchestratorDependencies, options: OrchestratorOptions) {
    this.#dependencies = dependencies;
    this.#options = options;
    this.#catalogRuntime = createPlanCatalogOrchestratorRuntime(this.#dependencies.store, {
      tenant: options.tenant,
      namespace: options.namespace,
      window: options.window,
    });
  }

  async prepare(seedPlugins: readonly string[]): Promise<Result<StudioRuntimePlan>> {
    if (seedPlugins.length === 0) {
      return fail(new Error('prepare-empty'));
    }
    const plugins = buildSeedPlugins(seedPlugins);
    const score = plugins.length * 7;
    return ok({
      route: plugins.map((plugin) => plugin.name),
      status: 'ready',
      score,
    });
  }

  async run(
    tenant: string,
    namespace: string,
    payloads: readonly { kind: string; payload: JsonValue }[],
  ): Promise<Result<StudioScenarioResult>> {
    if (this.#closed) {
      return fail(new Error('runtime-closed'));
    }
    const resolvedTenant = asTenant(tenant);
    const resolvedNamespace = asNamespace(namespace);
    const runId = asRun(`studio-${resolvedTenant}-${Date.now()}`);
    const catalogPlan = buildStudioCatalogPlan(seedPluginsFromPayload(payloads, tenant), tenant);
    const catalogBoot = await this.#catalogRuntime.bootstrap([catalogPlan]);
    if (!catalogBoot.ok) {
      return catalogBoot;
    }
    const request: AnalyzeRequest = {
      tenant: resolvedTenant,
      namespace: resolvedNamespace,
      signals: payloads.map((entry) => ({ kind: normalizeSignal(entry.kind), payload: entry.payload })),
    };
    const start = await runScenarioWithEngine(request, this.#dependencies);
    if (!start.ok) {
      return start;
    }
    const adapter = await createInMemorySignalAdapter();
    await adapter.store.open({
      runId: asRun(`studio-adapter-${Date.now()}`),
      tenant: resolvedTenant,
      namespace: resolvedNamespace,
      window: asWindow(`window:${tenant}`),
      session: asSession(`session:${runId}`),
    });
    const byKind = summarizeSignalsByKind(
      mapWithIteratorHelpers(payloads, (entry, index) => ({
        kind: normalizeSignal(entry.kind),
        runId,
        namespace: resolvedNamespace,
        at: new Date().toISOString(),
        payload:
          typeof entry.payload === 'object' && entry.payload !== null && !Array.isArray(entry.payload)
            ? ({
                ...(entry.payload as Record<string, JsonValue>),
                index,
              } as JsonValue)
            : ({ index, value: entry.payload } as JsonValue),
      })),
      resolvedTenant,
    );
    const baseline = evaluateMetricPoints(payloads.map((entry, index) => ({ value: index + entry.kind.length + 1 })));
    const inputs = runToInputs(runId, payloads);
    const mapped: readonly PluginRunResult[] = mapWithIteratorHelpers(inputs, (entry, index) => ({
      plugin: `plugin:${entry.kind.replace('signal:', '')}` as const,
      accepted: true,
      signalCount: entry.value + index,
      payload: entry.payload,
      diagnostics: [{ step: `plan:${resolvedTenant}`, latencyMs: index + 1 }],
    }));
    const traces = buildTraces(runId, mapped);
    const diagnostics = mapWithIteratorHelpers(Array.from(Object.keys(byKind)), (entry, index) => `${entry}:${index}`);
    return ok({
      runId: asRun(start.value.runId),
      resultCount: mapped.length,
      metric: summarizeMetric(mapped) + baseline.score + diagnostics.length,
      traces: [...traces, ...diagnostics],
    });
  }

  async close(): Promise<Result<void>> {
    if (this.#closed) {
      return ok(undefined);
    }
    this.#closed = true;
    await this.#stack.disposeAsync();
    await this.#catalogRuntime.close();
    void asWindow('window:studio');
    return ok(undefined);
  }
}

export const createAdvancedStudioRuntime = (
  dependencies: OrchestratorDependencies,
  options: OrchestratorOptions,
): AdvancedStudioService => {
  const runtime = new RecoveryStudioRuntime(dependencies, options);
  return {
    prepare: runtime.prepare.bind(runtime),
    run: runtime.run.bind(runtime),
    close: runtime.close.bind(runtime),
  };
};
