import type { RecursivePath } from '@shared/type-level';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  type HorizonSignal,
  type PluginConfig,
  type PluginContract,
  type PluginStage,
  type JsonLike,
  type TimeMs,
  horizonBrand,
} from '@domain/recovery-horizon-engine';
import type { AdapterManifest, AdapterEvent, AdapterRecord, AdapterRegistry, AdapterRegistryKey } from './adapter-registry.js';

export type AdapterKey<TKind extends PluginStage = PluginStage> = `${TKind}:${string}`;

export type TelemetryRoute<TKind extends PluginStage = PluginStage> = {
  readonly kind: TKind;
  readonly tenantId: string;
  readonly stage: TKind;
  readonly trace: RecursivePath<{ route: string; stage: string; tenantId: string }>;
};

export interface AdapterMetric<TPayload = JsonLike> {
  readonly tenantId: string;
  readonly stage: PluginStage;
  readonly route: string;
  readonly signalCount: number;
  readonly emitted: number;
  readonly lastAt: TimeMs;
  readonly payload: TPayload;
}

export interface RegistryTelemetrySnapshot<TPayload = JsonLike> {
  readonly tenantId: string;
  readonly total: number;
  readonly byStage: Record<PluginStage, number>;
  readonly byRoute: Record<string, number>;
  readonly top: readonly AdapterMetric<TPayload>[];
}

export interface TelemetryWindow {
  readonly tenantId: string;
  readonly from: TimeMs;
  readonly to: TimeMs;
  readonly windowMs: number;
}

type MetricRow<TPayload = JsonLike> = {
  readonly key: AdapterRegistryKey;
  readonly metric: AdapterMetric<TPayload>;
};

const now = (): TimeMs => horizonBrand.fromTime(Date.now()) as TimeMs;

const asWindowRows = <TPayload>(tenantId: string, rows: readonly MetricRow<TPayload>[]): readonly MetricRow<TPayload>[] =>
  rows.filter((row) => row.metric.tenantId === tenantId && row.metric.stage.length > 0);

const byWindow = <TPayload>(
  rows: readonly MetricRow<TPayload>[],
  window?: TelemetryWindow,
): readonly MetricRow<TPayload>[] => {
  if (!window) {
    return rows;
  }
  return rows.filter((row) => row.metric.lastAt >= window.from && row.metric.lastAt <= window.to);
};

const deriveKey = (tenantId: string, stage: PluginStage, route: string): AdapterRegistryKey =>
  `${tenantId}:${stage}:${route}` as AdapterRegistryKey;

const buildRoute = (contract: PluginContract<PluginStage, PluginConfig<PluginStage, JsonLike>, JsonLike>): string =>
  `adapter.${contract.id}.${contract.kind}`;

const sumBy = <T>(entries: Iterable<T>, groupBy: (value: T) => string): Record<string, number> =>
  Array.from(entries).reduce<Record<string, number>>((acc, value) => {
    const key = groupBy(value);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

const makeMetric = <TPayload>(
  tenantId: string,
  stage: PluginStage,
  event: AdapterEvent<PluginStage, TPayload>,
  count = 1,
): AdapterMetric<TPayload> => ({
  tenantId,
  stage,
  route: event.contractId,
  signalCount: count,
  emitted: 1,
  lastAt: now(),
  payload: event.payload,
});

export class AdapterTelemetryLedger<TPayload = JsonLike> implements AsyncDisposable {
  #rows = new Map<AdapterRegistryKey, AdapterMetric<TPayload>>();
  #routes = new Map<string, number>();
  #stack = new AsyncLocalStorage<string>();
  readonly #createdAt: TimeMs;

  constructor() {
    this.#createdAt = now();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#rows.clear();
    this.#routes.clear();
    this.#stack.disable();
  }

  [Symbol.dispose](): void {
    this.#rows.clear();
    this.#routes.clear();
    this.#stack.disable();
  }

  snapshot(tenantId: string): RegistryTelemetrySnapshot<TPayload> {
    const records = Array.from(this.#rows.values()).filter((entry) => entry.tenantId === tenantId);
    const byStage = this.groupByStage(records);
    const byRoute = this.groupByRoute(records);
    const sorted = [...records]
      .sort((left, right) => right.signalCount - left.signalCount)
      .slice(0, 5);

    return {
      tenantId,
      total: records.length,
      byStage,
      byRoute,
      top: sorted,
    };
  }

  recordFromRegistry(
    tenantId: string,
    stage: PluginStage,
    event: AdapterEvent<PluginStage, TPayload>,
  ): void {
    const route = this.#resolveRoute(stage, event.contractId);
    const key = deriveKey(tenantId, stage, route);
    const current = this.#rows.get(key) ?? makeMetric(tenantId, stage, event);
    this.#rows.set(key, {
      ...current,
      signalCount: current.signalCount + 1,
      emitted: current.emitted + 1,
      lastAt: now(),
      payload: event.payload,
    });
    this.#routes.set(route, (this.#routes.get(route) ?? 0) + 1);
  }

  collect(
    tenantId: string,
    eventLog: readonly AdapterEvent<PluginStage, TPayload>[],
  ): readonly AdapterMetric<TPayload>[] {
    const grouped = new Map<PluginStage, AdapterMetric<TPayload>>();
    for (const event of eventLog) {
      const route = this.#resolveRoute(event.stage, event.contractId);
      const previous = grouped.get(event.stage) ?? makeMetric(tenantId, event.stage, event);
      grouped.set(event.stage, {
        ...previous,
        emitted: previous.emitted + 1,
        signalCount: previous.signalCount + 1,
        lastAt: now(),
      });
      this.#routes.set(route, (this.#routes.get(route) ?? 0) + 1);
    }
    return [...grouped.values()];
  }

  project(
    tenantId: string,
    manifest: AdapterManifest<PluginStage, TPayload>,
    window?: TelemetryWindow,
  ): RegistryTelemetrySnapshot<TPayload> {
    const rows = this.snapshot(tenantId)
      .top
      .filter((entry) => entry.stage === manifest.kind)
      .map((entry) => ({ ...entry, stage: manifest.kind }));

    const filtered = byWindow(
      asWindowRows(tenantId, rows.map((entry) => ({ key: deriveKey(tenantId, entry.stage, entry.route), metric: entry }))),
      window,
    );

    return {
      tenantId,
      total: filtered.length,
      byStage: this.groupByStage(filtered.map((entry) => entry.metric)),
      byRoute: this.groupByRoute(filtered.map((entry) => entry.metric)),
      top: filtered.map((entry) => entry.metric),
    };
  }

  private groupByStage(rows: readonly AdapterMetric<TPayload>[]): Record<PluginStage, number> {
    const counts = {} as Record<PluginStage, number>;
    for (const row of rows) {
      counts[row.stage] = (counts[row.stage] ?? 0) + row.emitted;
    }
    return counts;
  }

  private groupByRoute(rows: readonly AdapterMetric<TPayload>[]): Record<string, number> {
    return sumBy(rows, (entry) => entry.route);
  }

  #resolveRoute(stage: PluginStage, contractId: string): string {
    const scope = this.#stack.getStore();
    const suffix = scope ? `:${scope}` : '';
    return `${stage}:${contractId}${suffix}`;
  }

  get createdAt(): TimeMs {
    return this.#createdAt;
  }
}

export const recordAdapterEvents = async <
  TKind extends PluginStage,
  TPayload = JsonLike,
>(
  registry: AdapterRegistry<TKind, TPayload>,
  tenantId: string,
): Promise<readonly AdapterEvent<TKind, TPayload>[]> => {
  const records = registry.all();
  const events: AdapterEvent<TKind, TPayload>[] = [];
  for (const record of records) {
    const next = registry.eventLog(tenantId) as readonly AdapterEvent<TKind, TPayload>[];
    events.push(...next);
  }
  return events as readonly AdapterEvent<TKind, TPayload>[];
};

export const collectRegistryTrace = async <
  TKind extends PluginStage,
  TPayload extends JsonLike,
>(
  registry: AdapterRegistry<TKind, TPayload>,
  tenantId: string,
  window: Partial<TelemetryWindow> = {},
): Promise<RegistryTelemetrySnapshot<TPayload>> => {
  const ledger = new AdapterTelemetryLedger<TPayload>();
  const tenantWindow: TelemetryWindow = {
    tenantId,
    from: window.from ?? horizonBrand.fromTime(0),
    to: window.to ?? now(),
    windowMs: window.to && window.from ? Number(window.to) - Number(window.from) : 0,
  };

  const rows = await recordAdapterEvents(registry, tenantId);
  const grouped = ledger.collect(tenantId, rows);
  const sample = grouped[0];
  const manifest: AdapterManifest<PluginStage, TPayload> = {
    key: 'collect:route' as AdapterRegistryKey,
    kind: sample?.stage ?? 'ingest',
    tags: [],
    route: `collect:${tenantId}` as RecursivePath<{ key: string; tenantId: string; contract: string }>,
    install: async () => [],
    run: async (signal) => [signal],
    remove: async () => [],
  };
  return ledger.project(tenantId, manifest, tenantWindow);
};
