import { normalizeLimit, withBrand } from '@shared/core';
import type { NoInfer } from '@shared/type-level';
import type { DesignPlanId, DesignRunState, DesignStage, PlanSignal } from './contracts';

export type PlanEventKind = 'created' | 'queued' | 'started' | 'completed' | 'paused' | 'failed';

export type PlanEventRecord = {
  readonly eventId: string;
  readonly at: number;
  readonly kind: PlanEventKind;
  readonly payload: Readonly<Record<string, unknown>>;
};

export interface StoredPlanRow<TSignal = unknown, TMeta extends Record<string, unknown> = Record<string, unknown>> {
  readonly planId: DesignPlanId;
  readonly tenant: string;
  readonly workspace: string;
  readonly scenario: string;
  readonly state: DesignRunState;
  readonly stage: DesignStage;
  readonly priority: number;
  readonly tags: readonly string[];
  readonly signals: readonly TSignal[];
  readonly events: readonly PlanEventRecord[];
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly metadata: TMeta;
}

export interface PlanQuery {
  readonly tenant?: string;
  readonly workspace?: string;
  readonly state?: DesignRunState;
  readonly stage?: DesignStage;
}

export interface PlanWindow<TPlan> {
  readonly records: readonly TPlan[];
  readonly cursor: string | null;
}

export const createPlanEvent = (kind: PlanEventKind, payload: Readonly<Record<string, unknown>>): PlanEventRecord => ({
  eventId: withBrand(`${kind}:${Date.now()}`, 'DesignPlanEvent'),
  at: Date.now(),
  kind,
  payload,
});

const eventComparator = (left: PlanEventRecord, right: PlanEventRecord): number => right.at - left.at;

export class DesignPlanStore<TSignal = unknown, TMeta extends Record<string, unknown> = Record<string, unknown>> {
  #rows = new Map<string, StoredPlanRow<TSignal, TMeta>>();

  upsert(
    plan: Omit<StoredPlanRow<TSignal, TMeta>, 'createdAt' | 'updatedAt'> & {
      readonly createdAt?: number;
      readonly updatedAt?: number;
    },
  ): StoredPlanRow<TSignal, TMeta> {
    const now = Date.now();
    const current = this.#rows.get(plan.planId);
    const row: StoredPlanRow<TSignal, TMeta> = {
      ...plan,
      createdAt: current?.createdAt ?? plan.createdAt ?? now,
      updatedAt: plan.updatedAt ?? now,
    } as StoredPlanRow<TSignal, TMeta>;
    this.#rows.set(plan.planId, row);
    return row;
  }

  get(planId: NoInfer<DesignPlanId>): StoredPlanRow<TSignal, TMeta> | undefined {
    return this.#rows.get(planId);
  }

  remove(planId: NoInfer<DesignPlanId>): void {
    this.#rows.delete(planId);
  }

  async appendEvent(planId: NoInfer<DesignPlanId>, kind: PlanEventKind, payload: Readonly<Record<string, unknown>>): Promise<void> {
    const row = this.#rows.get(planId);
    if (!row) {
      return;
    }
    const event = createPlanEvent(kind, payload);
    this.#rows.set(planId, {
      ...row,
      events: [event, ...row.events].toSorted(eventComparator),
      updatedAt: event.at,
    });
  }

  async appendSignal(planId: NoInfer<DesignPlanId>, signal: NoInfer<PlanSignal>): Promise<void> {
    const row = this.#rows.get(planId);
    if (!row) {
      return;
    }
    this.#rows.set(planId, {
      ...row,
      signals: [...row.signals, signal] as readonly TSignal[],
      updatedAt: Date.now(),
    });
  }

  async query(query: PlanQuery = {}): Promise<readonly StoredPlanRow<TSignal, TMeta>[]> {
    return [...this.#rows.values()]
      .filter((row) => !query.tenant || row.tenant === query.tenant)
      .filter((row) => !query.workspace || row.workspace === query.workspace)
      .filter((row) => !query.state || row.state === query.state)
      .filter((row) => !query.stage || row.stage === query.stage)
      .toSorted((left, right) => right.updatedAt - left.updatedAt);
  }

  async queryWindow(query: PlanQuery = {}, limit = 25): Promise<PlanWindow<StoredPlanRow<TSignal, TMeta>>> {
    const records = await this.query(query);
    const capped = records.slice(0, normalizeLimit(limit));
    return {
      records: capped,
      cursor: capped.at(-1)?.updatedAt.toString() ?? null,
    };
  }

  async queryByStage(stage: DesignStage): Promise<readonly StoredPlanRow<TSignal, TMeta>[]> {
    return this.query({ stage });
  }

  async *stream(planId: NoInfer<DesignPlanId>): AsyncGenerator<StoredPlanRow<TSignal, TMeta>> {
    const row = this.#rows.get(planId);
    if (!row) {
      return;
    }
    yield row;
    await Promise.resolve();
    yield {
      ...row,
      updatedAt: Date.now(),
    };
  }

  [Symbol.dispose](): void {
    this.#rows.clear();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#rows.clear();
  }
}
