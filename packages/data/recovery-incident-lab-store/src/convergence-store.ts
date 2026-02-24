import { withBrand, type Brand, toResult, type ResultState } from '@shared/core';
import { collectAsyncIterable } from '@shared/stress-lab-runtime';
import { mapIterable, collectIterable } from '@shared/stress-lab-runtime';
import type {
  ConvergenceConstraint,
  ConvergenceOutput,
  ConvergenceRunId,
  ConvergenceScope,
  ConvergenceStage,
} from '@domain/recovery-lab-orchestration-core';
import type { JsonValue } from '@shared/type-level';

type ConstraintGroup = Record<string, readonly ConvergenceConstraint[]>;

export type StoreRunId = Brand<string, 'ConvergenceRunStoreId'>;
export type ConstraintTraceId = Brand<string, 'ConstraintTraceId'>;

export interface ConvergenceStoreRecord {
  readonly id: StoreRunId;
  readonly runId: ConvergenceRunId;
  readonly tenantId: string;
  readonly scope: ConvergenceScope;
  readonly stage: ConvergenceStage;
  readonly output: ConvergenceOutput;
  readonly constraints: readonly ConvergenceConstraint[];
  readonly events: readonly string[];
  readonly diagnostics: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ConvergenceStoreOptions {
  readonly maxRetention?: number;
  readonly tenantFilter?: string;
  readonly includeConstraints?: boolean;
}

export interface ConvergenceStoreSnapshot {
  readonly total: number;
  readonly byStage: ConstraintGroup;
}

const asStoreRunId = (value: string): StoreRunId => withBrand(value, 'ConvergenceRunStoreId');
const asConstraintTraceId = (value: string): ConstraintTraceId => withBrand(value, 'ConstraintTraceId');

const defaultLimit = (value?: number): number => {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return 1000;
  }
  if (value < 1) return 1;
  return Math.min(5000, Math.floor(value));
};

export interface ConstraintTrace {
  readonly id: ConstraintTraceId;
  readonly runId: ConvergenceRunId;
  readonly constraints: readonly ConvergenceConstraint[];
  readonly trace: readonly string[];
  readonly generatedAt: string;
}

const classifyByScope = (constraints: readonly ConvergenceConstraint[]): ConstraintGroup => {
  const map: ConstraintGroup = {
    tenant: [],
    topology: [],
    signal: [],
    policy: [],
    fleet: [],
  };

  for (const constraint of constraints) {
    map[constraint.scope] = [...(map[constraint.scope] ?? []), constraint];
  }

  return map;
};

export interface StoreMutationResult {
  readonly inserted: number;
  readonly updated: number;
}

export class ConvergenceStore {
  readonly #records = new Map<StoreRunId, ConvergenceStoreRecord>();
  readonly #events: string[] = [];

  constructor(readonly options: ConvergenceStoreOptions = {}) {}

  private snapshotKey(runId: ConvergenceRunId): StoreRunId {
    return asStoreRunId(`${runId}:${this.options.tenantFilter ?? 'global'}:${Date.now()}`);
  }

  async save(record: Omit<ConvergenceStoreRecord, 'id' | 'updatedAt'>): Promise<ResultState<StoreMutationResult, Error>> {
    return toResult(async () => {
      const key = this.snapshotKey(record.runId);
      const next: ConvergenceStoreRecord = {
        ...record,
        id: key,
        createdAt: record.createdAt,
        updatedAt: new Date().toISOString(),
      };

      const previous = this.#records.get(key);
      this.#records.set(key, next);
      this.#events.push(`save:${key}:${record.stage}`);

      return {
        inserted: previous ? 0 : 1,
        updated: previous ? 1 : 0,
      };
    });
  }

  async list(tenantId?: string): Promise<readonly ConvergenceStoreRecord[]> {
    const rows = [...this.#records.values()]
      .filter((record) => tenantId === undefined || record.tenantId === tenantId)
      .filter((record) => this.options.tenantFilter === undefined || record.tenantId === this.options.tenantFilter)
      .toSorted((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
      .slice(0, defaultLimit(this.options.maxRetention));

    return Promise.resolve(rows);
  }

  async prune(runId: ConvergenceRunId): Promise<ResultState<boolean, Error>> {
    return toResult(async () => {
      const key = [...this.#records.keys()].find((entry) => entry.startsWith(`${runId}` as string));
      if (!key) {
        return false;
      }
      this.#records.delete(key);
      this.#events.push(`prune:${key}`);
      return true;
    });
  }

  async lookup(runId: ConvergenceRunId): Promise<ConvergenceStoreRecord | undefined> {
    for (const [key, record] of this.#records) {
      if (key.startsWith(`${runId}` as string) || record.runId === runId) {
        return record;
      }
    }
    return undefined;
  }

  async byStage(scope: ConvergenceScope, stage: ConvergenceStage): Promise<readonly ConvergenceStoreRecord[]> {
    return (await this.list()).filter((record) => record.scope === scope && record.stage === stage);
  }

  async byScope(scope: ConvergenceScope): Promise<readonly ConvergenceStoreRecord[]> {
    return (await this.list()).filter((record) => record.scope === scope);
  }

  async summarizeScope(scope: ConvergenceScope): Promise<{ readonly total: number; readonly countByStage: Record<ConvergenceStage, number> }> {
    const records = await this.byScope(scope);
    const countByStage = {
      input: 0,
      resolve: 0,
      simulate: 0,
      recommend: 0,
      report: 0,
    };
    for (const record of records) {
      countByStage[record.stage] += 1;
    }
    return {
      total: records.length,
      countByStage,
    };
  }

  async withScope<T>(scope: ConvergenceScope, run: (records: readonly ConvergenceStoreRecord[]) => Promise<T>): Promise<T> {
    const records = await this.byScope(scope);
    return run(records);
  }

  async diagnostics(): Promise<readonly string[]> {
    return Promise.resolve([...this.#events]);
  }

  async close(): Promise<void> {
    this.#records.clear();
    this.#events.length = 0;
  }

  [Symbol.dispose](): void {
    void this.close();
  }

  [Symbol.asyncDispose](): Promise<void> {
    return this.close();
  }
}

export const toConstraintTrace = (
  runId: ConvergenceRunId,
  constraints: readonly ConvergenceConstraint[],
  extras: readonly string[] = [],
): ConstraintTrace => ({
  id: asConstraintTraceId(`${runId}:${extras.join(':')}`),
  runId,
  constraints,
  trace: [
    ...extras,
    ...constraints.map((constraint) => `${constraint.scope}:${constraint.key}:${constraint.weight.toFixed(2)}`),
    ...constraints
      .flatMap((constraint) => constraint.scope.toLowerCase())
      .map((scope) => `${scope}:trace:${runId}`),
  ],
  generatedAt: new Date().toISOString(),
});

export const collectConstraintPayload = (records: readonly ConstraintTrace[]): readonly JsonValue[] => {
  return collectIterable(
    mapIterable(records, (record) => ({
      id: record.id,
      runId: record.runId,
      constraintCount: record.constraints.length,
      generatedAt: record.generatedAt,
    } satisfies JsonValue)),
  );
};

export const toArrayState = async (values: AsyncIterable<ConvergenceStoreRecord>): Promise<ConvergenceStoreRecord[]> =>
  collectAsyncIterable(values);

export const classifyConstraints = (constraints: readonly ConvergenceConstraint[]): ConvergenceStoreSnapshot => {
  const grouped = classifyByScope(constraints);
  return {
    total: constraints.length,
    byStage: grouped,
  };
};
