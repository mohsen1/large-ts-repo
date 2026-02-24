import {
  type NoInfer,
  type PluginContextState,
  type PluginInvocation,
  type PluginKindOf,
  type PluginResult,
  type Recommendation,
  type RecommendationCode,
  type StageAttempt,
  type StageSignal,
  type StressLabPluginId,
  type StageAttemptId,
  type StressPhase,
  type TenantId,
  type StageSignal as TStageSignal,
  type SignalEnvelopeId,
  createRecommendationCode,
  createSignalId,
  createPluginId,
  createStageAttemptId,
} from './models';

export type RegistryKind = PluginKindOf<PluginInvocation<any, any, any, any>>;

export interface RegistryEvent {
  readonly tenantId: TenantId;
  readonly pluginId: StressLabPluginId;
  readonly stageKind: RegistryKind;
  readonly startedAt: number;
  readonly kind: 'queued' | 'running' | 'finished' | 'failed';
}

export interface PluginCatalogItem {
  readonly plugin: PluginInvocation<any, any, PluginContextState, RegistryKind>;
  readonly registeredAt: number;
}

export interface PluginRegistryTelemetry {
  readonly tenantId: TenantId;
  readonly events: ReadonlyArray<RegistryEvent>;
  readonly attempts: ReadonlyArray<StageAttempt<TStageSignal>>;
}

class RegistryScope {
  #closed = false;

  constructor(
    readonly tenantId: TenantId,
    readonly pluginId: StressLabPluginId,
  ) {}

  [Symbol.dispose](): void {
    this.#closed = true;
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#closed = true;
    return Promise.resolve();
  }
}

export type PluginInput<TCatalog extends readonly PluginInvocation<any, any, any, any>[], TKind extends RegistryKind> =
  Extract<TCatalog[number], { kind: TKind }> extends PluginInvocation<infer Input, any, any, any>
    ? Input
    : never;

export type PluginOutput<TCatalog extends readonly PluginInvocation<any, any, any, any>[], TKind extends RegistryKind> =
  Extract<TCatalog[number], { kind: TKind }> extends PluginInvocation<any, infer Output, any, any>
    ? Output
    : never;

export type PluginCatalogShape<TCatalog extends readonly PluginInvocation<any, any, any, any>[]> = {
  readonly [K in TCatalog[number] as K['kind']]: K[];
};

export type RegisterResult<TCatalog extends readonly PluginInvocation<any, any, any, any>[], TKind extends RegistryKind> = {
  readonly plugin: Extract<TCatalog[number], { kind: TKind }>;
  readonly result: PluginResult<PluginOutput<TCatalog, TKind>>;
};

export class PluginRegistry<
  TCatalog extends readonly PluginInvocation<any, any, PluginContextState, RegistryKind>[]
> {
  #plugins = new Map<RegistryKind, PluginCatalogItem[]>();
  #events: RegistryEvent[] = [];

  constructor(private readonly tenantId: TenantId) {}

  register<TPlugin extends TCatalog[number]>(plugin: TPlugin): TPlugin {
    const bucket = this.#plugins.get(plugin.kind) ?? [];
    this.#plugins.set(plugin.kind, [...bucket, { plugin, registeredAt: Date.now() }]);

    this.#events.push({
      tenantId: this.tenantId,
      pluginId: plugin.id,
      stageKind: plugin.kind,
      startedAt: Date.now(),
      kind: 'queued',
    });

    return plugin;
  }

  manifest(): Readonly<PluginCatalogShape<TCatalog>> {
    const result = {} as Record<string, readonly StressLabPluginId[]>;

    for (const [kind, entries] of this.#plugins.entries()) {
      result[kind] = entries.map((entry) => entry.plugin.id);
    }

    return result as unknown as PluginCatalogShape<TCatalog>;
  }

  async execute<TKind extends RegistryKind>(
    kind: TKind,
    input: PluginInput<TCatalog, TKind>,
    context: NoInfer<PluginContextState>,
    requestId: string,
  ): Promise<PluginOutput<TCatalog, TKind>> {
    const candidates = this.#plugins.get(kind) ?? [];
    if (candidates.length === 0) {
      throw new Error(`No registered plugin for kind ${String(kind)} in ${requestId}`);
    }

    const stack = new AsyncDisposableStack();
    try {
      const item = candidates[0] as PluginCatalogItem;
      const plugin = item.plugin;
      using _scope = new RegistryScope(this.tenantId, plugin.id);

      this.#events.push({
        tenantId: this.tenantId,
        pluginId: plugin.id,
        stageKind: kind,
        startedAt: Date.now(),
        kind: 'running',
      });

      const result = await plugin.run(input, context as never);

      this.#events.push({
        tenantId: this.tenantId,
        pluginId: plugin.id,
        stageKind: kind,
        startedAt: Date.now(),
        kind: result.ok ? 'finished' : 'failed',
      });

      if (!result.ok) {
        throw new Error(result.error?.message ?? 'plugin execution failed');
      }

      stack.defer(() => {
        this.#events.push({
          tenantId: this.tenantId,
          pluginId: plugin.id,
          stageKind: kind,
          startedAt: Date.now(),
          kind: 'queued',
        });
      });

      return result.value as PluginOutput<TCatalog, TKind>;
    } finally {
      await stack.disposeAsync();
    }
  }

  telemetrySnapshot(): PluginRegistryTelemetry {
    return {
      tenantId: this.tenantId,
      events: [...this.#events],
      attempts: this.toAttempts(),
    };
  }

  recommendations(topK = 5): readonly Recommendation[] {
    const severityByIndex = ['critical', 'high', 'medium', 'low'] as const;

    const recommendations = this.#events
      .filter((event) => event.kind === 'finished')
      .map((event, index) => ({
        code: toPluginCode(event.pluginId, index),
        severity: severityByIndex[index % severityByIndex.length],
        phase: this.inferPhaseFromKind(event.stageKind),
        rationale: `${event.pluginId} in ${event.stageKind}`,
        affectedSignals: this.affectFromKind(event.stageKind),
        estimatedMitigationMinutes: 8 + index,
      }));

    return recommendations
      .toSorted((left, right) => right.estimatedMitigationMinutes - left.estimatedMitigationMinutes)
      .slice(0, Math.max(1, topK));
  }

  private inferPhaseFromKind(kind: RegistryKind): StressPhase {
    if (kind.includes('simulate')) return 'simulate';
    if (kind.includes('score')) return 'score';
    if (kind.includes('recommend')) return 'recommend';
    if (kind.includes('diagnose')) return 'diagnose';
    return 'ingest';
  }

  private affectFromKind(kind: RegistryKind): readonly SignalEnvelopeId[] {
    if (!kind) {
      return [];
    }

    const source = createSignalId(`${kind}:signal`);
    return [source];
  }

  private toAttempts(): readonly StageAttempt<TStageSignal>[] {
    const total = Math.max(1, this.#events.length);
    const window = `${this.tenantId}-${Date.now() - total * 1000}-${Date.now()}`;

    return this.#events.map((event, index) => ({
      id: createStageAttemptId(`${this.tenantId}:attempt:${window}:${index}`),
      source: createSignalId(`${event.pluginId}:${index}`),
      phaseClass: index % 2 === 0 ? 'raw' : 'derived',
      severityBand: index % 4 === 0 ? 'critical' : index % 4 === 1 ? 'high' : index % 4 === 2 ? 'medium' : 'low',
      normalizedScore: this.computeRiskIndex(index, total),
    }));
  }

  private computeRiskIndex(index: number, total: number): number {
    return total === 0 ? 0 : Math.max(0, Math.min(1, 1 - index / total));
  }
}

const toPluginCode = (value: string, index: number): RecommendationCode =>
  createRecommendationCode(`rec:${value}:${index}`);
