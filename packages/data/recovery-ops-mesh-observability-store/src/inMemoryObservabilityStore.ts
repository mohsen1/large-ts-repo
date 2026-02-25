import { AsyncLocalStorage } from 'node:async_hooks';
import { createPluginSession, type PluginLease } from '@shared/type-level';
import { fail, ok, type Result } from '@shared/result';
import { type Brand, withBrand } from '@shared/core';
import { buildAlertEnvelope, buildObservationEnvelope, type AlertRecord, type ObservationBatch, type ObservationRecord } from './records';
import { isAlertRecord, parseObservation, type RecordCursor, type ObservabilityEventRecord } from './types';
import type {
  MeshPayloadFor,
  MeshPlanId,
  MeshRunId,
  MeshSignalKind,
  MeshTopology,
} from '@domain/recovery-ops-mesh';

type RecordToken = Brand<string, 'obs-store-cursor'>;

interface StoreState {
  readonly topology: MeshTopology;
  readonly records: readonly ObservationRecord[];
  readonly alerts: readonly AlertRecord[];
  readonly createdAt: number;
}

export class InMemoryObservabilityStore {
  readonly #state = new Map<MeshPlanId, StoreState>();
  readonly #session: PluginLease<[]>;
  readonly #cursorStorage = new AsyncLocalStorage<number>();
  #cursorSeed = 0;

  constructor() {
    this.#session = createPluginSession([], {
      name: 'recovery-ops-mesh-observability-store',
      capacity: 8,
    });
  }

  [Symbol.dispose](): void {
    this.#session[Symbol.dispose]();
    this.#state.clear();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this[Symbol.dispose]();
  }

  private ensurePlan(topology: MeshTopology): StoreState {
    const current = this.#state.get(topology.id);
    if (current) {
      return current;
    }

    const seed: StoreState = {
      topology,
      records: [],
      alerts: [],
      createdAt: Date.now(),
    };
    this.#state.set(topology.id, seed);
    return seed;
  }

  appendRecord(
    input: {
      runId: MeshRunId;
      topology: MeshTopology;
      signal: MeshPayloadFor<MeshSignalKind>;
      planId: MeshPlanId;
      source?: string;
    },
  ): ObservationRecord {
    const plan = this.ensurePlan(input.topology);
    const envelope = buildObservationEnvelope(
      {
        runId: input.runId,
        planId: input.planId,
        topology: input.topology,
        signal: input.signal,
      },
      plan.records.length,
    );
    const next = {
      ...envelope,
      source: input.source ?? envelope.source,
    };

    this.#state.set(input.planId, {
      ...plan,
      records: [...plan.records, next],
      alerts: plan.alerts,
    });
    return next as ObservationRecord;
  }

  appendAlert(
    input: {
      runId: MeshRunId;
      plan: MeshPlanId;
      profile: {
        cycleRisk: number;
        staleNodeCount: number;
        hotPathCount: number;
      };
    },
  ): AlertRecord {
    const plan = this.#state.get(input.plan);
    if (!plan) {
      throw new Error(`plan-not-found:${input.plan}`);
    }

    const next = buildAlertEnvelope(input.runId, input.plan, {
      planId: input.plan,
      cycleRisk: input.profile.cycleRisk,
      staleNodes: input.profile.staleNodeCount,
      hotPaths: input.profile.hotPathCount,
    });

    this.#state.set(input.plan, {
      ...plan,
      alerts: [...plan.alerts, next],
    });
    return next;
  }

  async readPlanEvents(planId: MeshPlanId): Promise<Result<readonly ObservabilityEventRecord[], Error>> {
    const current = this.#state.get(planId);
    if (!current) {
      return fail(new Error(`plan-not-found:${planId}`));
    }

    const records = current.records.map((record) => parseObservation(record));
    const events: readonly ObservabilityEventRecord[] = [...records, ...current.alerts];
    return ok(events);
  }

  async snapshot(planId: MeshPlanId): Promise<Result<ObservationBatch, Error>> {
    const current = this.#state.get(planId);
    if (!current) {
      return fail(new Error(`snapshot-missing:${planId}`));
    }

    return ok({
      records: [...current.records],
      alerts: [...current.alerts],
      createdAt: current.createdAt,
    });
  }

  async streamSignals(planId: MeshPlanId): Promise<RecordCursor> {
    const current = this.#state.get(planId);
    const tokenSeed = ++this.#cursorSeed;
    const token = this.#cursorStorage.run(tokenSeed, () => {
      const active = this.#cursorStorage.getStore() ?? 0;
      return withBrand(`cursor:${planId}:${active}`, 'obs-store-cursor') as RecordToken;
    }) as RecordToken;

    if (!current) {
      return {
        token,
        records: [],
        hasMore: false,
      };
    }

    return {
      token,
      records: [...current.records, ...current.alerts],
      hasMore: false,
    };
  }

  async *watch(topologyId: MeshPlanId): AsyncGenerator<ObservabilityEventRecord, void, void> {
    const current = this.#state.get(topologyId);
    if (!current) {
      return;
    }

    const ordered = [...current.records, ...current.alerts].toSorted((left, right) => {
      const leftAt = 'signalIndex' in left ? left.at : left.emittedAt;
      const rightAt = 'signalIndex' in right ? right.at : right.emittedAt;
      return leftAt - rightAt;
    });

    for (const event of ordered) {
      if (isAlertRecord(event)) {
        yield event;
      } else {
        yield event;
      }
    }
  }
}

export interface StreamToken<T> {
  readonly token: string;
  readonly source: T;
}

export const withStoreScope = async <T>(
  store: InMemoryObservabilityStore,
  fn: (store: InMemoryObservabilityStore) => Promise<T>,
): Promise<T> => {
  try {
    return await fn(store);
  } finally {
    await store[Symbol.asyncDispose]();
  }
};
