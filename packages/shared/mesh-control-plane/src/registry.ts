import {
  canonicalizeNamespace,
  type PluginKind,
  type PluginId,
  collectIterable,
} from '@shared/stress-lab-runtime';
import { createPluginTelemetryStore, type PluginTelemetryStore } from '@shared/stress-lab-runtime';
import type { MeshLane, MeshRuntimeEvent, MeshRuntimeState } from '@shared/orchestration-lab-core';
import type { ControlPlaneLane, ControlPlaneRunId, ControlPlaneTenantId } from './types';

export interface MeshControlRegistryEntry {
  readonly runId: ControlPlaneRunId;
  readonly tenantId: ControlPlaneTenantId;
  readonly lane: ControlPlaneLane;
  readonly startedAt: string;
  readonly plugins: readonly PluginId[];
  readonly metrics: ReadonlyMap<string, number>;
}

export interface MeshControlRegistryOptions {
  readonly namespace: string;
  readonly enabled: boolean;
  readonly mode: 'live' | 'offline' | 'replay';
}

export type RegistryBucket<TName extends string> = `${TName}:${number}`;
export type RegistryByLane = Readonly<Record<string, ReadonlySet<PluginId>>>;

export interface MeshControlLifecycleEvent {
  readonly runId: ControlPlaneRunId;
  readonly state: MeshRuntimeState;
  readonly at: string;
  readonly lane: MeshLane;
}

const resolveLaneIndex = (lane: ControlPlaneLane): MeshLane | 'signal' => {
  return lane === 'governance' || lane === 'postmortem' ? 'signal' : lane;
};

const toRecordKey = (entry: MeshControlRegistryEntry): string => `${entry.tenantId}::${entry.runId}::${entry.lane}`;

export class MeshControlRegistry<TCatalog extends readonly PluginId[] = readonly PluginId[]> {
  readonly #namespace: string;
  readonly #tenant = new Map<string, MeshControlRegistryEntry>();
  readonly #buckets = new Map<RegistryBucket<string>, string[]>();
  readonly #events = new Set<MeshControlLifecycleEvent>();
  readonly #telemetry: PluginTelemetryStore<'mesh-control-registry'>;
  readonly #enabled: boolean;

  constructor(options: MeshControlRegistryOptions) {
    this.#namespace = canonicalizeNamespace(options.namespace);
    this.#enabled = options.enabled;
    this.#telemetry = createPluginTelemetryStore('mesh-control-registry', this.#namespace as PluginKind);
    this.#telemetry.emit('trace', this.#namespace as PluginId, 'created', [options.mode.length]);
  }

  public register(entry: MeshControlRegistryEntry): this {
    const key = toRecordKey(entry);
    if (this.#tenant.has(key)) {
      this.#events.add({
        runId: entry.runId,
        state: 'aborting',
        at: new Date().toISOString(),
        lane: resolveLaneIndex(entry.lane),
      });
      return this;
    }
    this.#tenant.set(key, {
      ...entry,
      startedAt: entry.startedAt,
      metrics: new Map(entry.metrics),
    });
    this.#events.add({
      runId: entry.runId,
      state: 'warming',
      at: new Date().toISOString(),
      lane: resolveLaneIndex(entry.lane),
    });
      this.#telemetry.emit('info', key as PluginId, 'registered', [entry.plugins.length]);
    return this;
  }

  public *entries(): IterableIterator<MeshControlRegistryEntry> {
    yield* collectIterable(this.#tenant.values());
  }

  public snapshot(): RegistryByLane {
    const buckets = new Map<string, Set<PluginId>>();
    for (const entry of this.#tenant.values()) {
      for (const plugin of entry.plugins) {
        const next = buckets.get(entry.lane) ?? new Set();
        next.add(plugin as PluginId);
        buckets.set(entry.lane, next);
      }
    }
    const snapshot: Record<string, ReadonlySet<PluginId>> = {};
    for (const [lane, pluginIds] of buckets) {
      snapshot[lane] = pluginIds;
    }
    return snapshot;
  }

  public bucket<TLabel extends string>(label: TLabel, runId: ControlPlaneRunId): RegistryBucket<TLabel> {
    const bucket = `${label}:${runId}` as RegistryBucket<TLabel>;
    const run = this.#tenant.get(String(runId));
    const values = run === undefined ? [] : run.plugins.map((entry) => String(entry));
    this.#buckets.set(bucket, values);
    return bucket;
  }

  public events(): readonly MeshControlLifecycleEvent[] {
    return [...this.#events];
  }

  public has(runId: string): boolean {
    for (const key of this.#tenant.keys()) {
      if (key.endsWith(runId)) {
        return true;
      }
    }
    return false;
  }

  public clear(): void {
    this.#tenant.clear();
    this.#buckets.clear();
    this.#events.clear();
    this.#telemetry.clear();
  }

  public [Symbol.dispose](): void {
    this.clear();
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    this.clear();
    await this.#telemetry[Symbol.asyncDispose]();
  }

  public toEventStream(): readonly MeshRuntimeEvent[] {
    return [...this.#events].map((entry) => ({
      kind: `mesh.signal.latency`,
      value: Number(new Date(entry.at)),
      at: entry.at,
      tags: [this.#namespace, entry.lane, entry.state],
    }));
  }
}
