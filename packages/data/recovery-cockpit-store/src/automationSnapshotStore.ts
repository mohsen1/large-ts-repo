import { Brand, type NoInfer } from '@shared/type-level';
import { type Result, fail, ok } from '@shared/result';
import { type RecoveryPlan, type RuntimeRun } from '@domain/recovery-cockpit-models';
import { type AutomationBlueprint, type BlueprintId, type StepId } from '@domain/recovery-cockpit-orchestration-core';

export type SnapshotId = Brand<string, 'AutomationSnapshot'>;
export type SnapshotArtifactId = Brand<string, 'SnapshotArtifact'>;

export type SnapshotPoint = {
  readonly id: SnapshotArtifactId;
  readonly blueprintId: BlueprintId;
  readonly stepId: StepId;
  readonly value: unknown;
  readonly sequence: number;
  readonly capturedAt: string;
};

export type SnapshotRecord = {
  readonly snapshotId: SnapshotId;
  readonly tenant: Brand<string, 'Tenant'>;
  readonly blueprintId: BlueprintId;
  readonly planId: RecoveryPlan['planId'];
  readonly runId: RuntimeRun['runId'];
  readonly header: AutomationBlueprint['header'];
  readonly points: readonly SnapshotPoint[];
  readonly createdAt: string;
};

export type SnapshotQuery = {
  readonly tenant: Brand<string, 'Tenant'>;
  readonly planId?: RecoveryPlan['planId'];
  readonly runId?: RuntimeRun['runId'];
  readonly limit?: number;
};

const iteratorFrom =
  (globalThis as {
    readonly Iterator?: {
      readonly from?: <T>(value: Iterable<T>) => { toArray(): T[] };
    };
  }).Iterator?.from;

const toArray = <T>(value: Iterable<T>): T[] => iteratorFrom?.(value)?.toArray() ?? [...value];

const buildId = (tenant: Brand<string, 'Tenant'>, planId: RecoveryPlan['planId'], runId: RuntimeRun['runId']): SnapshotId =>
  `${tenant}:${planId}:${runId}` as SnapshotId;

export class AutomationSnapshotStore {
  readonly #records = new Map<SnapshotId, SnapshotRecord[]>();

  async save(record: {
    tenant: Brand<string, 'Tenant'>;
    blueprint: AutomationBlueprint;
    plan: RecoveryPlan;
    run: RuntimeRun;
    points: readonly SnapshotPoint[];
  }): Promise<Result<SnapshotId, Error>> {
    const snapshotId = buildId(record.tenant, record.plan.planId, record.run.runId);
    const item: SnapshotRecord = {
      snapshotId,
      tenant: record.tenant,
      blueprintId: record.blueprint.header.blueprintId,
      planId: record.plan.planId,
      runId: record.run.runId,
      header: record.blueprint.header,
      points: toArray(record.points),
      createdAt: new Date().toISOString(),
    };

    const current = this.#records.get(snapshotId) ?? [];
    this.#records.set(snapshotId, [...current, item]);
    return ok(snapshotId);
  }

  async list(query: SnapshotQuery): Promise<Result<readonly SnapshotRecord[], Error>> {
    try {
      const all = toArray(this.#records.values()).flat();
      const filtered = all.filter((entry) => {
        if (entry.tenant !== query.tenant) return false;
        if (query.planId !== undefined && entry.planId !== query.planId) return false;
        if (query.runId !== undefined && entry.runId !== query.runId) return false;
        return true;
      });

      const sorted = filtered.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
      const limit = query.limit ?? sorted.length;
      return ok(sorted.slice(0, limit));
    } catch (error) {
      return fail(error as Error);
    }
  }

  async snapshotFor(plan: RecoveryPlan['planId'], tenant: Brand<string, 'Tenant'>): Promise<Result<SnapshotRecord | undefined, Error>> {
    try {
      const list = await this.list({ tenant, planId: plan, limit: 1 });
      if (!list.ok) {
        return fail(list.error, list.code);
      }
      return ok(list.value[0]);
    } catch (error) {
      return fail(error as Error);
    }
  }

  async prune(tenant: Brand<string, 'Tenant'>, keepLatest = 10): Promise<Result<number, Error>> {
    try {
      let removed = 0;
      for (const [key, values] of this.#records.entries()) {
        const selected = values.filter((value) => value.tenant === tenant);
        if (selected.length <= keepLatest) {
          continue;
        }

        const kept = selected.slice(-keepLatest);
        removed += selected.length - kept.length;
        this.#records.set(key, kept);
      }
      return ok(removed);
    } catch (error) {
      return fail(error as Error);
    }
  }

  countByTenant(): Readonly<Record<string, number>> {
    const totals = new Map<string, number>();
    for (const record of toArray(this.#records.values()).flat()) {
      totals.set(record.tenant, (totals.get(record.tenant) ?? 0) + 1);
    }

    return [...totals.entries()].reduce(
      (acc, [tenant, count]) => ({
        ...acc,
        [tenant]: count,
      }),
      {} as Record<string, number>,
    );
  }

  async hydrate(snapshotId: SnapshotId): Promise<Result<SnapshotRecord | undefined, Error>> {
    const records = this.#records.get(snapshotId);
    return ok(records?.[records.length - 1]);
  }
}

export const createAutomationSnapshotStore = (): AutomationSnapshotStore => new AutomationSnapshotStore();

export const buildPoint = <const TBlueprint extends AutomationBlueprint>(blueprint: TBlueprint, stepId: StepId, value: unknown): SnapshotPoint => ({
  id: `artifact:${blueprint.header.blueprintId}:${stepId}` as SnapshotArtifactId,
  blueprintId: blueprint.header.blueprintId,
  stepId,
  value,
  sequence: Number.isFinite(Date.now()) ? Date.now() % 1024 : 0,
  capturedAt: new Date().toISOString(),
});

export const mapSnapshotCount = (points: readonly SnapshotPoint[]): Readonly<Record<string, number>> =>
  points.reduce((acc, point) => ({
    ...acc,
    [point.id]: (acc[point.id] ?? 0) + 1,
  }), {} as Record<string, number>);

export const pointsByRange = (
  points: readonly SnapshotPoint[],
  from: string,
  to: string,
): readonly SnapshotPoint[] => {
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  return points.filter((point) => {
    const time = new Date(point.capturedAt).getTime();
    return Number.isFinite(time) && time >= start && time <= end;
  });
};

export type SnapshotEnvelope<TBlueprint extends AutomationBlueprint> = {
  readonly blueprint: TBlueprint;
  readonly snapshots: readonly SnapshotPoint[];
  readonly sequence: readonly NoInfer<number>[];
};

export const envelopeFromQuery = <TBlueprint extends AutomationBlueprint>(
  blueprint: TBlueprint,
  snapshots: readonly SnapshotPoint[],
): SnapshotEnvelope<TBlueprint> => {
  const sequence = snapshots.map((snapshot) => snapshot.sequence as NoInfer<number>);
  return { blueprint, snapshots, sequence };
};

export const createDefaultPoint = <TBlueprint extends AutomationBlueprint>(
  blueprint: TBlueprint,
  stepId: StepId,
  value: unknown,
): SnapshotPoint => buildPoint(blueprint, stepId, value);
