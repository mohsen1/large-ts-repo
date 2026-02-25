import {
  asRun,
  asSession,
  asTenant,
  asWindow,
  asNamespace,
  type AnalyticsTenant,
  type AnalyticsWindow,
  type SignalNamespace,
  buildCatalogState,
  buildTopologyFromPlugins,
  pluginCatalogToMap,
  pluginRouteSignature,
  type PluginNode,
  type PluginRunContext,
  type PluginRunInput,
  type PluginRunResult,
  type PluginSignalKind,
  type PluginRouteSignature,
  pluginNameFrom,
  createPluginContext,
  toPluginTraceId,
} from '@domain/recovery-ecosystem-analytics';
import { ok, type Result } from '@shared/result';
import { mapWithIteratorHelpers } from '@shared/type-level';
import type { AnalyticsStore } from '@data/recovery-ecosystem-analytics-store';

type HubPlugin = PluginNode<string, string, PluginRunInput, PluginRunResult>;
type HubCatalog = ReturnType<typeof pluginCatalogToMap>;

export interface HubOptions {
  readonly timeoutMs: number;
  readonly namespace: SignalNamespace;
  readonly tenant: AnalyticsTenant;
  readonly window: AnalyticsWindow;
  readonly maxDepth: number;
}

export interface HubState {
  activeNodeCount: number;
  topologySize: number;
  traceCount: number;
  open: boolean;
  runId: string;
}

export interface PluginHubRuntime {
  readonly state: HubState;
  readonly run: (input: readonly PluginRunInput[]) => Promise<Result<readonly PluginRunResult[]>>;
  readonly runSignal: (input: PluginRunInput) => Promise<Result<PluginRunResult>>;
  readonly close: () => Promise<void>;
  [Symbol.asyncDispose](): PromiseLike<void>;
  [Symbol.dispose](): void;
}

const defaultHubOptions: HubOptions = {
  timeoutMs: 500,
  namespace: 'namespace:recovery-ecosystem' as SignalNamespace,
  tenant: 'tenant:recovery-ecosystem' as AnalyticsTenant,
  window: 'window:recovery-ecosystem' as AnalyticsWindow,
  maxDepth: 16,
};

const normalizeValue = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const signalToTarget = (signalKind: PluginSignalKind): ReturnType<typeof pluginNameFrom> =>
  pluginNameFrom(signalKind.replace(/^signal:/, ''));

const normalizePayloadValue = (payload: unknown): ReturnType<typeof JSON.stringify> => JSON.stringify(payload);

export class RecoveryEcosystemPluginHub implements PluginHubRuntime {
  #nodes: HubCatalog;
  #plugins: readonly HubPlugin[];
  #options: HubOptions;
  #state: HubState;
  #stack = new AsyncDisposableStack();

  constructor(plugins: readonly HubPlugin[], options?: Partial<HubOptions>) {
    const safeOptions = {
      ...defaultHubOptions,
      ...options,
      namespace: options?.namespace ?? defaultHubOptions.namespace,
      tenant: options?.tenant ?? defaultHubOptions.tenant,
      window: options?.window ?? defaultHubOptions.window,
    };
    this.#plugins = [...plugins];
    this.#nodes = pluginCatalogToMap(plugins);
    this.#options = safeOptions;
    this.#state = {
      activeNodeCount: 0,
      topologySize: 0,
      traceCount: 0,
      open: true,
      runId: `run:${Date.now()}`,
    };
    const nodes = Object.entries(this.#nodes);
    this.#state.topologySize = nodes.length;
    this.#state.activeNodeCount = nodes.filter(([, entry]) => entry.enabled).length;
  }

  get state(): HubState {
    return { ...this.#state };
  }

  createRunContext(runId: string): PluginRunContext {
    const context = createPluginContext(this.#options.tenant, this.#options.namespace, this.#options.window);
    return { ...context, runId: asRun(runId), trace: toPluginTraceId(runId) };
  }

  async runSignal(input: PluginRunInput): Promise<Result<PluginRunResult>> {
    const target = signalToTarget(input.kind);
    const manifest = this.#nodes[target];
    if (!manifest?.enabled) {
      const missing: PluginRunResult = {
        plugin: target,
        accepted: false,
        signalCount: 0,
        payload: {
          kind: input.kind,
          value: normalizeValue(input.value),
        },
        diagnostics: [{ step: 'hub-input-missing', latencyMs: 0 }],
      };
      this.#state.traceCount += 1;
      return ok(missing);
    }

    const context = this.createRunContext(input.runId);
    const output = await manifest.node.run({ ...input, namespace: context.namespace }, context);
    this.#state.traceCount += 1;
    return ok(output);
  }

  async run(input: readonly PluginRunInput[]): Promise<Result<readonly PluginRunResult[]>> {
    if (!this.#state.open) {
      return ok([]);
    }
    if (input.length === 0) {
      const noop: PluginRunResult = {
        plugin: 'plugin:none',
        accepted: false,
        signalCount: 0,
        payload: { reason: 'no-input' },
        diagnostics: [{ step: 'run-empty', latencyMs: 0 }],
      };
      return ok([noop]);
    }

    const contextRunId = asRun(`run:${Date.now()}`);
    const outputs: PluginRunResult[] = [];
    const ordered = input.map((entry) => ({ ...entry, runId: contextRunId }));
    for (const signal of ordered) {
      const result = await this.runSignal(signal);
      if (result.ok) {
        outputs.push(result.value);
      } else {
        outputs.push({
          plugin: pluginNameFrom(signal.kind),
          accepted: false,
          signalCount: 0,
          payload: { error: normalizePayloadValue(result.error) },
          diagnostics: [{ step: 'run-error', latencyMs: 1 }],
        });
      }
    }

    const signalNames = ordered.map((entry) => entry.kind);
    const topology = buildTopologyFromPlugins(
      this.#plugins,
      {
        includeDetached: true,
        allowCycles: false,
        maxDepth: this.#options.maxDepth,
      },
    );
    this.#state.traceCount += signalNames.length + topology.size;
    const catalog = buildCatalogState(this.#plugins);
    this.#state.activeNodeCount = catalog.topology.size;
    return ok(outputs as readonly PluginRunResult[]);
  }

  async close(): Promise<void> {
    if (!this.#state.open) {
      return;
    }
    this.#state.open = false;
    await this.#stack.disposeAsync();
  }

  [Symbol.dispose](): void {
    this.#state.open = false;
  }

  [Symbol.asyncDispose](): PromiseLike<void> {
    return this.close();
  }
}

export const createPluginHub = <TPlugins extends readonly HubPlugin[]>(
  plugins: TPlugins,
  _dependencies: { readonly catalog?: readonly PluginNode[] } = {},
  options?: Partial<HubOptions>,
): RecoveryEcosystemPluginHub => new RecoveryEcosystemPluginHub(plugins, options);

export const describeHub = (hub: RecoveryEcosystemPluginHub): string => {
  const state = hub.state;
  const signature = pluginRouteSignature([] as const) as PluginRouteSignature<readonly PluginNode[]>;
  return `${state.runId}:${state.topologySize}:${state.traceCount}:${state.activeNodeCount}:${state.open}:${signature}`;
};

export const buildHubStateSeed = async (): Promise<readonly PluginRunResult[]> => {
  const topologySignature: PluginRouteSignature<readonly PluginNode[]> = pluginRouteSignature([] as const);
  return [
    {
      plugin: 'plugin:seed' as const,
      accepted: true,
      signalCount: topologySignature.length,
      payload: { topology: topologySignature },
      diagnostics: [{ step: 'seed', latencyMs: 0 }],
    },
  ];
};

export const createHubSession = (): {
  readonly session: ReturnType<typeof asSession>;
  readonly tenant: ReturnType<typeof asTenant>;
  readonly window: ReturnType<typeof asWindow>;
} => ({
  session: asSession(`hub-session`),
  tenant: asTenant('tenant:hub'),
  window: asWindow('window:hub'),
});

export const resolveHubTopologySignature = (plugins: readonly PluginNode[]): PluginRouteSignature<readonly PluginNode[]> =>
  pluginRouteSignature(plugins as readonly PluginNode[]);
