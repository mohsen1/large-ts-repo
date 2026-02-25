import {
  asRun,
  asSession,
  asSignal,
  asWindow,
  type AnalyticsTenant,
  type SignalNamespace,
  buildTopologyFromPlugins,
  buildCatalogState,
} from '@domain/recovery-ecosystem-analytics';
import {
  summarizeSignalsByKind,
  evaluateMetricPoints,
  normalizeTopologyNodes,
  pluginCatalogToMap,
  pluginRouteSignature,
  createPluginContext,
  type PluginNode,
  type PluginRunContext,
  type PluginRunInput,
  type PluginRouteSignature,
  type PluginSignalKind,
} from '@domain/recovery-ecosystem-analytics';
import type { AnalyticsStore } from '@data/recovery-ecosystem-analytics-store';
import { toPluginTraceId } from '@domain/recovery-ecosystem-analytics';

type TimelineTuple<TEntries extends readonly string[]> = {
  readonly [K in keyof TEntries]: {
    readonly order: number;
    readonly name: TEntries[K];
  };
};

export interface PlanHubOptions {
  readonly tenant: string;
  readonly namespace: string;
  readonly window: string;
}

export interface PlanHubDependencies {
  readonly store: AnalyticsStore;
}

export interface PlanHubExecution {
  readonly topology: ReturnType<typeof buildTopologyFromPlugins>;
  readonly metrics: {
    readonly score: number;
    readonly warningCount: number;
    readonly criticalCount: number;
    readonly signals: readonly string[];
  };
  readonly diagnostics: readonly string[];
}

export interface PlanHubFacade {
  evaluatePlan(plan: { readonly steps: readonly { readonly name: string }[] }): Promise<{ readonly ok: true; readonly value: PlanHubExecution }>;
  composePlan(plugins: readonly PluginNode[]): Promise<ReturnType<typeof buildTopologyFromPlugins>>;
  close(): Promise<void>;
}

const normalizeWindow = (value: string): ReturnType<typeof asWindow> =>
  asWindow(`window:${value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-')}`);

const toSignalKind = (kind: string): PluginSignalKind => `signal:${kind.replace(/^signal:/, '').toLowerCase()}` as PluginSignalKind;

const toStageName = (seed: string): string => `stage:${seed.replace(/[^a-z0-9._-]+/g, '-')}`;

class PlanHub {
  readonly #store: AnalyticsStore;
  readonly #options: { readonly tenant: AnalyticsTenant; readonly namespace: SignalNamespace; readonly window: ReturnType<typeof asWindow> };
  readonly #session: string;
  readonly #graphByRequest = new Map<string, ReturnType<typeof buildTopologyFromPlugins>>();

  constructor(dependencies: PlanHubDependencies, options: PlanHubOptions) {
    this.#store = dependencies.store;
    this.#options = {
      tenant: `tenant:${options.tenant.replace('tenant:', '')}` as AnalyticsTenant,
      namespace: `namespace:${options.namespace.replace('namespace:', '')}` as SignalNamespace,
      window: normalizeWindow(options.window),
    };
    this.#session = `session:${this.#options.tenant}`;
  }

  private async emitDiagnostics(plugins: readonly PluginNode[]): Promise<readonly string[]> {
    const context = createPluginContext(
      this.#options.tenant,
      this.#options.namespace,
      this.#options.window,
    );
    const aliases = plugins.map((entry, index) => asSignal(`${entry.name}-${index}`));
    const diagnostics = aliases.map((entry) => `${entry}:${context.runId}`);
    return diagnostics;
  }

  async evaluatePlan(plan: { readonly steps: readonly { readonly name: string }[] }): Promise<{ readonly ok: true; readonly value: PlanHubExecution }> {
    const ordered = plan.steps.map((step, index) => ({
      name: step.name,
      signature: toStageName(step.name),
      weight: index + 1,
    }));
    const pluginNodes: PluginNode[] = ordered.map((entry, index) => ({
      name: `plugin:${entry.name}` as const,
      namespace: this.#options.namespace,
      kind: 'plugin:plan',
      dependsOn: [] as const,
      inputKinds: ['in:plan'] as const,
      outputKinds: ['out:plan'] as const,
      weight: entry.weight,
      signature: entry.signature,
      version: 'v1',
      run: async (input: PluginRunInput) => ({
        plugin: `plugin:${entry.name}` as const,
        accepted: true,
        signalCount: Number(input.value),
        payload: {
          value: input.value,
          kind: input.kind,
          at: input.at,
        },
        diagnostics: [{ step: `step:${entry.name}`, latencyMs: 1 }],
      }),
    }));

    const topology = buildTopologyFromPlugins(normalizeTopologyNodes(pluginNodes), {
      includeDetached: true,
      allowCycles: false,
      maxDepth: 24,
    });
    const orderedNames = topology.order().ordered.map((entry) => entry.id.replace('node:', ''));
    const signals = mapSignalsFromNames(orderedNames);
    const byKind = summarizeSignalsByKind(signals, this.#options.tenant);
    const metrics = evaluateMetricPoints(mapSignalsToMetrics(signals));
    const runtime = buildCatalogState(pluginNodes);

    await this.#store.open({
      runId: asRun(`run:${this.#options.tenant}-${this.#session}`),
      tenant: this.#options.tenant,
      namespace: this.#options.namespace,
      window: this.#options.window,
      session: asSession(this.#session),
    });
    const diagnostics = await this.emitDiagnostics(pluginNodes);

    this.#graphByRequest.set(pluginRouteSignature(pluginNodes), topology);
    return {
      ok: true,
      value: {
        topology,
        metrics: {
          score: metrics.score,
          warningCount: metrics.warningCount,
          criticalCount: metrics.criticalCount,
          signals: Object.keys(byKind),
        },
        diagnostics: [
          `session:${this.#session}`,
          `tenant:${this.#options.tenant}`,
          `window:${this.#options.window}`,
          ...diagnostics,
          runtime.manifest.id,
        ],
      },
    };
  }

  async composePlan(plugins: readonly PluginNode[]): Promise<ReturnType<typeof buildTopologyFromPlugins>> {
    const normalized = plugins.length > 0 ? normalizeTopologyNodes(plugins) : [];
    const topology = buildTopologyFromPlugins(normalized, {
      includeDetached: true,
      allowCycles: false,
      maxDepth: 16,
    });
    this.#graphByRequest.set(`compose:${this.#session}`, topology);
    const _catalog = pluginCatalogToMap([...normalized]);
    void _catalog;
    return topology;
  }

  buildTimelineTuple<TEntries extends readonly string[]>(entries: TEntries): TimelineTuple<TEntries> {
    return entries.map((entry, index) => ({ order: index, name: entry })) as TimelineTuple<TEntries>;
  }

  async close(): Promise<void> {
    for (const topology of this.#graphByRequest.values()) {
      await topology[Symbol.asyncDispose]();
    }
    this.#graphByRequest.clear();
  }
}

const mapSignalsFromNames = (names: readonly string[]) =>
  names.map((name, index) => ({
    kind: toSignalKind(name),
    runId: asRun(`run:${index}`),
    namespace: `namespace:${name}` as SignalNamespace,
    at: new Date().toISOString(),
    payload: { seed: index },
  }));

const mapSignalsToMetrics = (signals: ReturnType<typeof mapSignalsFromNames>) =>
  signals.map((entry, index) => ({ value: index + entry.kind.length }));

export const createPlanHub = (
  dependencies: PlanHubDependencies,
  options: PlanHubOptions,
): PlanHubFacade => new PlanHub(dependencies, options);
