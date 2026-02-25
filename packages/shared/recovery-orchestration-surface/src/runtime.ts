import {
  createSurfaceRuntimeState,
  createSurfacePluginContract,
  summarizeRuntimeState,
  type ExtendedSurfaceRuntimeState,
  type SurfaceLaneKind,
  type SurfacePluginContract,
  type SurfaceSignalEnvelope,
} from './contracts';
import { summarizeExecution, buildManifest } from './diagnostics';
import { toPluginEvents, type SurfacePluginEvent } from './plugins';
import { SurfacePluginRegistry, type PluginExecutionRecord } from './registry';
import {
  createSurfaceLaneId,
  createSurfaceNodeId,
  createSurfacePluginId,
  createSurfaceSignalId,
  createSurfaceTelemetryId,
  createSurfaceWorkspaceId,
  type SurfaceLaneId,
  type SurfacePluginId,
  type SurfaceRuntimeContext,
  type SurfaceWorkspaceId,
} from './identity';
import { planFromPluginIds, SurfacePlanGraph } from './plan';
import { replaySignals, streamSignals } from './streaming';
import { NoInfer } from '@shared/type-level';

type PluginCatalog = readonly SurfacePluginContract<SurfaceLaneKind, Record<string, unknown>, Record<string, unknown>>[];

type AsyncDisposableStackCtor = new () => {
  use<T>(resource: T & { [Symbol.asyncDispose](): PromiseLike<void> }): T & { [Symbol.asyncDispose](): PromiseLike<void> };
  [Symbol.asyncDispose](): Promise<void>;
};

const createRuntimeStack = (): AsyncDisposableStackCtor => {
  const candidate = (globalThis as { AsyncDisposableStack?: AsyncDisposableStackCtor }).AsyncDisposableStack;
  if (candidate) {
    return candidate;
  }

  return class FallbackAsyncDisposableStack {
    readonly #disposers: Array<() => PromiseLike<void> | void> = [];

    use<T>(resource: T & { [Symbol.asyncDispose](): PromiseLike<void> }): T & { [Symbol.asyncDispose](): PromiseLike<void> } {
      this.#disposers.push(() => resource[Symbol.asyncDispose]());
      return resource;
    }

    async [Symbol.asyncDispose](): Promise<void> {
      for (let index = this.#disposers.length - 1; index >= 0; index -= 1) {
        await this.#disposers[index]?.();
      }
    }
  };
};

const AsyncStack = createRuntimeStack();

export interface RuntimeBuildOptions {
  readonly tenant: string;
  readonly domain: string;
  readonly zone?: string;
}

export interface RuntimeSessionResult {
  readonly ready: boolean;
  readonly score: number;
  readonly records: readonly PluginExecutionRecord[];
  readonly eventIds: readonly ReturnType<typeof createSurfaceSignalId>[];
}

type RuntimeSessionDiagnostics = {
  readonly summary: ReturnType<typeof summarizeExecution>;
  readonly graphRoute: readonly string[];
  readonly events: readonly SurfacePluginEvent[];
  readonly manifest: ReturnType<typeof buildManifest>;
};

class RuntimeSession {
  readonly #graph: SurfacePlanGraph;
  readonly #registry: SurfacePluginRegistry<PluginCatalog>;
  readonly #laneId: SurfaceLaneId;
  readonly #events: readonly SurfacePluginEvent[];

  constructor(
    private readonly workspaceId: SurfaceWorkspaceId,
    private readonly plugins: PluginCatalog,
  ) {
    this.#registry = new SurfacePluginRegistry(workspaceId, this.plugins, { defaultScope: 'synthesize' });
    this.#laneId = createSurfaceLaneId(workspaceId, 'runtime');
    this.#graph = new SurfacePlanGraph(workspaceId).buildFromManifest(
      planFromPluginIds(workspaceId, this.plugins.map((plugin) => plugin.id)),
    );

    this.#events = toPluginEvents(
      {
        workspaceId,
        currentLane: this.#laneId,
        stage: 'runtime',
        pluginCount: this.plugins.length,
        signalsPerMinute: 60,
      },
      Date.now(),
    );
  }

  async run<TKind extends SurfaceLaneKind>(
    kind: TKind,
    input: NoInfer<Record<string, unknown>>,
    options: RuntimeBuildOptions,
  ): Promise<RuntimeSessionResult> {
    await using _scope = new AsyncStack();

    const context: SurfaceRuntimeContext = {
      workspaceId: this.workspaceId,
      lane: this.#laneId,
      stage: 'runtime',
      metadata: {
        tenant: options.tenant,
        domain: options.domain,
        namespace: 'runtime',
        createdAt: Date.now(),
        region: options.zone,
        createdBy: `${options.tenant}/runtime`,
      },
      createdAt: Date.now(),
    };

    const signal: SurfaceSignalEnvelope = {
      signalId: createSurfaceSignalId(this.workspaceId, 'bootstrap'),
      kind: 'state',
      workspaceId: this.workspaceId,
      generatedAt: Date.now(),
      value: context,
      ttlSeconds: 30,
    };

    const route = this.#graph.route(
      createSurfaceNodeId(this.workspaceId, 'bootstrap'),
      createSurfaceNodeId(this.workspaceId, 'active'),
    );

    let eventIds: ReturnType<typeof createSurfaceSignalId>[] = [];
    for await (const emitted of streamSignals({ workspaceId: this.workspaceId, laneId: this.#laneId }, 3)) {
      eventIds = [...eventIds, emitted.signalId as ReturnType<typeof createSurfaceSignalId>];
    }

    const inputForKind = input as Record<string, unknown> as any;
    await this.#registry.runChain(kind, inputForKind, context, signal);
    const summary = summarizeExecution(this.workspaceId, this.#registry, context);
    const manifest = buildManifest(summary);

    const replay = await replaySignals({ workspaceId: this.workspaceId, laneId: this.#laneId });
    eventIds = [...eventIds, ...replay.signalIds];

    void route;
    _scope.use({
      async [Symbol.asyncDispose]() {
        void summary.summary.total;
      },
    });

    return {
      ready: summary.score >= 0,
      score: summary.score,
      records: summary.records,
      eventIds,
    };
  }

  async debug(): Promise<RuntimeSessionDiagnostics> {
    const context: SurfaceRuntimeContext = {
      workspaceId: this.workspaceId,
      lane: this.#laneId,
      stage: 'runtime',
      metadata: {
        tenant: 'acme',
        domain: 'runtime',
        namespace: 'runtime',
        createdAt: Date.now(),
        createdBy: 'debug',
      },
      createdAt: Date.now(),
    };

    const state: ExtendedSurfaceRuntimeState = createSurfaceRuntimeState(
      this.workspaceId,
      this.#registry.ids,
    );
    const records = this.#registry.snapshots();
    const summary = summarizeExecution(this.workspaceId, this.#registry, context);

    return {
      summary,
      graphRoute: this.#graph.diagnostics(),
      events: this.#events,
      manifest: buildManifest(summary),
    };
  }
}

const asAnyPlugin = <
  TKind extends SurfaceLaneKind,
  TInput extends Record<string, unknown>,
  TOutput extends Record<string, unknown>,
>(
  plugin: SurfacePluginContract<TKind, TInput, TOutput>,
): SurfacePluginContract<SurfaceLaneKind, Record<string, unknown>, Record<string, unknown>> =>
  plugin as SurfacePluginContract<SurfaceLaneKind, Record<string, unknown>, Record<string, unknown>>;

const bootstrapWorkspaceId = createSurfaceWorkspaceId('region-1', 'acme-core');
const bootstrapLaneId = createSurfaceLaneId(bootstrapWorkspaceId, 'bootstrap');

const bootstrapIngestPlugin = asAnyPlugin(createSurfacePluginContract({
  id: createSurfacePluginId(bootstrapLaneId, 'ingest'),
  kind: 'ingest',
  lane: bootstrapLaneId,
  name: 'Bootstrap ingester',
  description: 'Bootstraps synthetic surface signals.',
  workspaceId: bootstrapWorkspaceId,
  dependencies: [],
  telemetryId: createSurfaceTelemetryId(bootstrapWorkspaceId, 'bootstrap'),
  shape: { kind: 'ingest', mode: 'event', source: 'bootstrap' },
  schemaVersion: 1,
  active: true,
  maxConcurrency: 4,
  priority: 100,
  input: { enabled: true },
  run: async (input: Record<string, unknown>) => ({ ...input, seeded: true }),
}));

const bootstrapSynthesizePlugin = asAnyPlugin(createSurfacePluginContract({
  id: createSurfacePluginId(bootstrapLaneId, 'synthesize'),
  kind: 'synthesize',
  lane: bootstrapLaneId,
  name: 'Bootstrap synthesizer',
  description: 'Builds synthetic context for runtime',
  workspaceId: bootstrapWorkspaceId,
  dependencies: [bootstrapIngestPlugin.id],
  telemetryId: createSurfaceTelemetryId(bootstrapWorkspaceId, 'bootstrap-synth'),
  shape: { kind: 'synthesize', model: 'recovery-gpt', prompt: 'derive signal projections' },
  schemaVersion: 1,
  active: true,
  maxConcurrency: 1,
  priority: 80,
  input: { seeded: true },
  run: async (input: Record<string, unknown>) => ({ ...input, synthesized: true }),
}));

const bootstrapSimulatePlugin = asAnyPlugin(createSurfacePluginContract({
  id: createSurfacePluginId(bootstrapLaneId, 'simulate'),
  kind: 'simulate',
  lane: bootstrapLaneId,
  name: 'Bootstrap simulator',
  description: 'Simulates incident paths.',
  workspaceId: bootstrapWorkspaceId,
  dependencies: [bootstrapSynthesizePlugin.id],
  telemetryId: createSurfaceTelemetryId(bootstrapWorkspaceId, 'bootstrap-sim'),
  shape: { kind: 'simulate', iterations: 12, scenarioId: 'surface:baseline' },
  schemaVersion: 1,
  active: true,
  maxConcurrency: 2,
  priority: 50,
  input: { scenario: 'baseline' },
  run: async (input: Record<string, unknown>) => ({ ...input, simulated: true }),
}));

const bootstrapScorePlugin = asAnyPlugin(createSurfacePluginContract({
  id: createSurfacePluginId(bootstrapLaneId, 'score'),
  kind: 'score',
  lane: bootstrapLaneId,
  name: 'Bootstrap scorer',
  description: 'Produces risk/readiness score.',
  workspaceId: bootstrapWorkspaceId,
  dependencies: [bootstrapSimulatePlugin.id],
  telemetryId: createSurfaceTelemetryId(bootstrapWorkspaceId, 'bootstrap-score'),
  shape: { kind: 'score', model: 'risk', benchmark: 0.85 },
  schemaVersion: 1,
  active: true,
  maxConcurrency: 1,
  priority: 60,
  input: { threshold: 0.85 },
  run: async (input: Record<string, unknown>) => ({ ...input, score: 0.88 }),
}));

const bootstrapActuatePlugin = asAnyPlugin(createSurfacePluginContract({
  id: createSurfacePluginId(bootstrapLaneId, 'actuate'),
  kind: 'actuate',
  lane: bootstrapLaneId,
  name: 'Bootstrap actuator',
  description: 'Applies recovery action recommendations.',
  workspaceId: bootstrapWorkspaceId,
  dependencies: [bootstrapScorePlugin.id],
  telemetryId: createSurfaceTelemetryId(bootstrapWorkspaceId, 'bootstrap-act'),
  shape: { kind: 'actuate', command: 'noop', dryRun: true },
  schemaVersion: 1,
  active: true,
  maxConcurrency: 1,
  priority: 30,
  input: { dryRun: true },
  run: async (input: Record<string, unknown>) => ({ ...input, enacted: false }),
}));

const bootstrapCatalogSeed = [
  bootstrapIngestPlugin,
  bootstrapSynthesizePlugin,
  bootstrapSimulatePlugin,
  bootstrapScorePlugin,
  bootstrapActuatePlugin,
] as const;

const runtimeDefaults = {
  tenant: 'acme-core',
  domain: 'recovery-surface',
  zone: 'us-east-1',
} as const satisfies Pick<RuntimeBuildOptions, 'tenant' | 'domain' | 'zone'>;

export const createSurfaceRuntime = async (
  workspaceSeed: string,
  options: Partial<RuntimeBuildOptions> = {},
): Promise<SurfaceRuntime> => {
  const workspaceId = createSurfaceWorkspaceId(options.zone ?? runtimeDefaults.zone, workspaceSeed);

  const workspaceTailLane = createSurfaceLaneId(workspaceId, 'tail');
  const workspacePlugin: PluginCatalog[number] = asAnyPlugin(
    createSurfacePluginContract({
      id: createSurfacePluginId(workspaceTailLane, 'tail'),
      kind: 'synthesize',
      lane: workspaceTailLane,
      name: 'Tenant tail synth',
      description: 'Tenant-local synthetic enrichment',
      workspaceId,
      dependencies: [bootstrapCatalogSeed[bootstrapCatalogSeed.length - 1]?.id],
      telemetryId: createSurfaceTelemetryId(workspaceId, 'tail'),
      shape: { kind: 'synthesize', model: 'tenant-gpt', prompt: 'localize surface status' },
      schemaVersion: 1,
      active: true,
      maxConcurrency: 1,
      priority: 40,
      input: { tenant: workspaceSeed, zone: runtimeDefaults.zone },
      run: async (input: Record<string, unknown>) => ({ ...input, tenantSpecific: true }),
    }),
  );

  return new SurfaceRuntime(
    workspaceId,
    [...bootstrapCatalogSeed, workspacePlugin],
    {
      tenant: options.tenant ?? runtimeDefaults.tenant,
      domain: options.domain ?? runtimeDefaults.domain,
      zone: options.zone ?? runtimeDefaults.zone,
    },
  );
};

export class SurfaceRuntime {
  readonly #plugins: PluginCatalog;
  readonly #options: RuntimeBuildOptions;

  constructor(
    private readonly workspaceId: SurfaceWorkspaceId,
    plugins: PluginCatalog,
    options: RuntimeBuildOptions,
  ) {
    this.#plugins = plugins;
    this.#options = options;
  }

  async run<TKind extends SurfaceLaneKind>(kind: TKind, input: Record<string, unknown>): Promise<RuntimeSessionResult> {
    const session = new RuntimeSession(this.workspaceId, this.#plugins);
    return session.run(kind, input, this.#options);
  }

  async getDebug(): Promise<RuntimeSessionDiagnostics> {
    const session = new RuntimeSession(this.workspaceId, this.#plugins);
    return session.debug();
  }

  async describe(): Promise<string> {
    const state = createSurfaceRuntimeState(this.workspaceId, this.#plugins.map((plugin) => plugin.id));
    return `${summarizeRuntimeState(state)}`;
  }
}

export const runBootstrapSurface = async (seed: string): Promise<RuntimeSessionResult> => {
  const runtime = await createSurfaceRuntime(seed);
  return runtime.run('synthesize', {
    tenant: seed,
    zone: runtimeDefaults.zone,
    bootstrap: true,
  });
};
