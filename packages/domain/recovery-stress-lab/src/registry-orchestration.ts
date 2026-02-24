import { NoInfer, type Prettify } from '@shared/type-level';
import {
  createRunbookId,
  createStageAttemptId,
  createTenantId,
  type CommandRunbook,
  type CommandRunbookId,
  type PluginContextState,
  type PluginResult,
  type RecoverySignal,
  type RecoverySignalId,
  type StressPhase,
  type TenantId,
  type WorkloadTarget,
  type WorkloadTopology,
  type RecoverySimulationResult,
  type OrchestrationPlan,
} from './models';
import {
  buildLatticeIntent,
  buildLatticeRun,
  type LatticeIntent,
  type LatticeRun,
  type LatticeSummary,
} from './orchestration-lattice';

export type LatticePluginKind =
  | 'signal-scan'
  | 'topology-inspect'
  | 'forecast-sim'
  | 'recommendation-sweep'
  | 'lifecycle-validate';

export interface LatticePlugin<TInput = unknown, TOutput = unknown, TKind extends LatticePluginKind = LatticePluginKind> {
  readonly pluginId: `plugin-${TKind}-${string}`;
  readonly tenantId: TenantId;
  readonly kind: TKind;
  readonly runbook: readonly StressPhase[];
  readonly config: Readonly<Record<string, unknown>>;
  execute(input: NoInfer<TInput>, context: PluginContextState): Promise<PluginResult<TOutput>>;
}

type RegistryBucket<TCatalog extends readonly LatticePlugin[]> = {
  [K in PluginCatalogKind<TCatalog>]: {
    readonly plugin: Extract<TCatalog[number], { kind: K }>;
    readonly lastRunAt: string;
    readonly runCount: number;
  }[];
};

export type PluginCatalogKind<TCatalog extends readonly LatticePlugin[]> = TCatalog[number]['kind'];
export type PluginInputFor<
  TCatalog extends readonly LatticePlugin[],
  TKind extends PluginCatalogKind<TCatalog>,
> = Extract<TCatalog[number], { kind: TKind }> extends LatticePlugin<infer TInput, any, TKind> ? TInput : never;
export type PluginOutputFor<
  TCatalog extends readonly LatticePlugin[],
  TKind extends PluginCatalogKind<TCatalog>,
> = Extract<TCatalog[number], { kind: TKind }> extends LatticePlugin<any, infer TOutput, TKind> ? TOutput : never;

export type PluginManifest<TCatalog extends readonly LatticePlugin[]> = {
  [K in PluginCatalogKind<TCatalog>]: readonly Extract<TCatalog[number], { kind: K }>[];
};

export interface PluginTelemetryRecord<TCatalog extends readonly LatticePlugin[]> {
  readonly tenantId: TenantId;
  readonly pluginId: TCatalog[number]['pluginId'];
  readonly kind: PluginCatalogKind<TCatalog>;
  readonly at: string;
  readonly status: 'queued' | 'running' | 'completed' | 'failed';
}

const iteratorFrom =
  (globalThis as { readonly Iterator?: { from?: <T>(value: Iterable<T>) => { map<U>(transform: (value: T) => U): { toArray(): U[] } } } }).Iterator?.from;

export class LatticeRegistry<TCatalog extends readonly LatticePlugin[]> {
  readonly #tenantId: TenantId;
  readonly #manifest: PluginManifest<TCatalog>;
  readonly #buckets: RegistryBucket<TCatalog>;
  readonly #telemetry: PluginTelemetryRecord<TCatalog>[];

  public constructor(tenantId: string, plugins: NoInfer<TCatalog>) {
    this.#tenantId = createTenantId(tenantId);
    this.#telemetry = [];

    const manifest = Object.create(null) as PluginManifest<TCatalog>;
    const buckets = Object.create(null) as RegistryBucket<TCatalog>;

    for (const plugin of plugins) {
      const kind = plugin.kind as PluginCatalogKind<TCatalog>;
      manifest[kind] = [
        ...((manifest[kind] ?? []) as PluginManifest<TCatalog>[typeof kind]),
        plugin as PluginManifest<TCatalog>[typeof kind][number],
      ] as PluginManifest<TCatalog>[typeof kind];
      buckets[kind] = [
        ...((buckets[kind] ?? []) as RegistryBucket<TCatalog>[typeof kind]),
        { plugin, lastRunAt: new Date(0).toISOString(), runCount: 0 } as RegistryBucket<TCatalog>[typeof kind][number],
      ] as RegistryBucket<TCatalog>[typeof kind];
    }

    this.#manifest = manifest;
    this.#buckets = buckets;
  }

  public get tenantId(): TenantId {
    return this.#tenantId;
  }

  public get manifest(): Prettify<PluginManifest<TCatalog>> {
    return this.#manifest as Prettify<PluginManifest<TCatalog>>;
  }

  public async execute<TKind extends PluginCatalogKind<TCatalog>>(
    kind: NoInfer<TKind>,
    input: PluginInputFor<TCatalog, TKind>,
    context: PluginContextState,
  ): Promise<PluginOutputFor<TCatalog, TKind>> {
    const candidates = this.#buckets[kind] ?? [];
    if (candidates.length === 0) {
      throw new Error(`no plugin for kind ${String(kind)} on ${String(this.#tenantId)}`);
    }

    const selected = candidates[0]!;
    const event: PluginTelemetryRecord<TCatalog> = {
      tenantId: this.#tenantId,
      pluginId: selected.plugin.pluginId,
      kind,
      at: new Date().toISOString(),
      status: 'running',
    };

    try {
      this.#telemetry.push(event);
      const payload = await selected.plugin.execute(input, context);
      if (!payload.ok) {
        this.#telemetry.push({ ...event, status: 'failed' });
        throw new Error(payload.error?.message ?? 'plugin failed');
      }

      this.#telemetry.push({ ...event, status: 'completed' });
      this.#bump(kind, selected.plugin.pluginId);
      return payload.value as PluginOutputFor<TCatalog, TKind>;
    } catch (cause) {
      this.#telemetry.push({ ...event, status: 'failed' });
      throw cause;
    }
  }

  public telemetry(kind?: PluginCatalogKind<TCatalog>): readonly PluginTelemetryRecord<TCatalog>[] {
    return kind ? this.#telemetry.filter((entry) => entry.kind === kind) : [...this.#telemetry];
  }

  public manifestIds(): Record<string, string[]> {
    const entries =
      iteratorFrom?.(
        Object.entries(this.#manifest) as Iterable<[string, PluginManifest<TCatalog>[PluginCatalogKind<TCatalog>] | undefined]>,
      )?.map((entry) => entry)?.toArray() ??
      Object.entries(this.#manifest);
    const map = Object.create(null) as Record<string, string[]>;

    for (const [kind, plugins] of entries) {
      const bucket = (plugins ?? []) as unknown as PluginManifest<TCatalog>[PluginCatalogKind<TCatalog>];
      map[kind] = bucket.map((plugin) => plugin.pluginId);
    }

    return map;
  }

  public buildSummary(): {
    readonly tenantId: TenantId;
    readonly pluginKinds: number;
    readonly pluginRuns: number;
    readonly statusCounts: Record<PluginTelemetryRecord<TCatalog>['status'], number>;
  } {
    const statusCounts: Record<PluginTelemetryRecord<TCatalog>['status'], number> = {
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
    };

    for (const event of this.#telemetry) {
      statusCounts[event.status] += 1;
    }

    return {
      tenantId: this.#tenantId,
      pluginKinds: Object.keys(this.#manifest).length,
      pluginRuns: this.#telemetry.length,
      statusCounts,
    };
  }

  #bump(kind: PluginCatalogKind<TCatalog>, pluginId: string): void {
    const entries = this.#buckets[kind] ?? [];
    this.#buckets[kind] = entries.map((entry) =>
      entry.plugin.pluginId === pluginId ? { ...entry, runCount: entry.runCount + 1, lastRunAt: new Date().toISOString() } : entry,
    ) as RegistryBucket<TCatalog>[typeof kind];
  }
}

interface LatticeIntentInput {
  readonly tenantId: TenantId;
  readonly run: LatticeRun;
  readonly simulation: RecoverySimulationResult;
  readonly signals: readonly RecoverySignal[];
  readonly targets: readonly WorkloadTarget[];
}

export const resolveSignalPath = async (
  input: LatticeIntentInput,
): Promise<{
  readonly bundle: ReturnType<typeof buildLatticeIntent>;
  readonly signals: readonly RecoverySignalId[];
  readonly metadata: { readonly signalCount: number; readonly runbookCount: number };
}> => {
  const attempts = buildAttemptMap(input.signals);
  const bundle = buildLatticeIntent(
    {
      tenantId: input.tenantId,
      plan: input.run.plan,
      simulation: input.simulation,
      signals: input.signals,
      targets: input.targets,
    },
    {
      tenantId: input.tenantId,
      nodes: [],
      edges: [],
    },
  );

  const _prepared = await Promise.all(
    iteratorFrom?.([...input.signals].values())?.map((signal) => createStageAttemptId(`${input.tenantId}::signal-${signal.id}`))?.toArray() ??
      input.signals.map((signal) => createStageAttemptId(`${input.tenantId}::signal-${signal.id}`)),
  );

      const uniqueSignalIds = Object.keys(attempts) as unknown as readonly RecoverySignalId[];

  return {
    bundle,
    signals: uniqueSignalIds,
    metadata: {
      signalCount: input.signals.length,
      runbookCount: input.run.plan.runbooks.length,
    },
  };
};

const buildAttemptMap = (signals: readonly RecoverySignal[]) =>
  signals.reduce<Record<RecoverySignalId, RecoverySignal>>((acc, signal) => {
    acc[signal.id] = signal;
    return acc;
  }, Object.create(null) as Record<RecoverySignalId, RecoverySignal>);

export const buildBundle = (
  tenantId: TenantId,
  runbook: CommandRunbookId,
  targets: readonly WorkloadTarget[],
): OrchestrationPlan => ({
  tenantId,
  scenarioName: String(runbook),
  schedule: [],
  runbooks: [],
  dependencies: {
    nodes: targets.map((target) => target.workloadId),
    edges: [],
  },
  estimatedCompletionMinutes: targets.length,
});

export interface LatticePlanEnvelope {
  readonly tenantId: TenantId;
  readonly intent: LatticeIntent;
  readonly summary: LatticeSummary;
  readonly run: LatticeRun;
  readonly signature: string;
}

export interface LatticePlanRequest {
  readonly tenantId: TenantId;
  readonly runbook: CommandRunbookId;
  readonly simulation: RecoverySimulationResult;
  readonly targets: readonly WorkloadTarget[];
  readonly signals: readonly RecoverySignal[];
  readonly runbooks: readonly CommandRunbook[];
  readonly topology: WorkloadTopology;
}

const normalizeRunbook = (tenantId: TenantId, runbook: CommandRunbookId): CommandRunbook => ({
  id: runbook,
  tenantId,
  name: String(runbook),
  description: `Recovery runbook ${String(runbook)}`,
  steps: [],
  ownerTeam: 'stress-lab',
  cadence: {
    weekday: 1,
    windowStartMinute: 0,
    windowEndMinute: 120,
  },
});

export const buildLatticePlanEnvelope = async (input: LatticePlanRequest): Promise<LatticePlanEnvelope> => {
  const plan: OrchestrationPlan = {
    tenantId: input.tenantId,
    scenarioName: String(input.runbook),
    schedule: [],
    runbooks:
      input.runbooks.length > 0
        ? input.runbooks
        : [normalizeRunbook(input.tenantId, input.runbook)],
    dependencies: {
      nodes: input.targets.map((target) => target.workloadId),
      edges: [],
    },
    estimatedCompletionMinutes: Math.max(1, input.targets.length),
  };

  const run = buildLatticeRun(input.tenantId, plan, input.simulation, input.signals);
  const intent = buildLatticeIntent(
    {
      tenantId: input.tenantId,
      plan,
      simulation: input.simulation,
      signals: input.signals,
      targets: [...input.targets],
    },
    input.topology,
  );

  return {
    tenantId: input.tenantId,
    run,
    intent,
    summary: intent.summary,
    signature: `${input.tenantId}::${input.simulation.selectedRunbooks.length}::${intent.summary.signalCount}`,
  };
};

export const buildRunbookIndex = (
  tenantId: TenantId,
  runbooks: readonly { readonly id: string; readonly target: readonly WorkloadTarget[] }[],
): readonly CommandRunbookId[] =>
  runbooks
    .toSorted((left, right) => right.target.length - left.target.length)
    .map((runbook, index) => createRunbookId(`${tenantId}::bundle::${index}::${runbook.id}`));

export const boundedSignals = <TSignals extends readonly RecoverySignal[]>(
  signals: NoInfer<TSignals>,
  max: number,
): TSignals => {
  const safeMax = Number.isFinite(max) ? Math.max(0, Math.min(signals.length, Math.trunc(max))) : signals.length;
  return signals.slice(0, safeMax) as unknown as TSignals;
};
