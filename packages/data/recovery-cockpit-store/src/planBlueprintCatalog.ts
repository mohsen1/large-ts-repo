import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import {
  RecoveryBlueprint,
  BlueprintArtifact,
  BlueprintDigest,
  buildBlueprintFromPlan,
  summarizeBlueprint,
  nextBlueprintRiskBand,
} from '@domain/recovery-cockpit-models';
import { PlanId, toTimestamp } from '@domain/recovery-cockpit-models';
import { Result, fail, ok } from '@shared/result';

export type BlueprintCatalogQuery = {
  readonly namespace?: string;
  readonly status?: RecoveryBlueprint['status'];
  readonly planId?: PlanId;
  readonly minRisk?: number;
  readonly maxRisk?: number;
  readonly limit?: number;
};

export type BlueprintCatalogSnapshot = {
  readonly total: number;
  readonly byStatus: Record<string, number>;
  readonly byRiskBand: Record<string, number>;
  readonly updatedAt: string;
  readonly digest: BlueprintDigest[];
};

export interface BlueprintCatalogRepository {
  upsert(blueprint: RecoveryBlueprint): Promise<Result<RecoveryBlueprint, string>>;
  remove(planId: PlanId): Promise<Result<boolean, string>>;
  get(planId: PlanId): Promise<Result<RecoveryBlueprint | undefined, string>>;
  find(query?: BlueprintCatalogQuery): Promise<Result<readonly RecoveryBlueprint[], string>>;
  stream(planId: PlanId): AsyncGenerator<RecoveryBlueprint | undefined, void, void>;
  snapshot(): BlueprintCatalogSnapshot;
}

const defaultSeed: ReadonlyArray<{
  planId: PlanId;
  namespace: string;
  risk: number;
}> = [];

const parseRiskBand = (value: number): 'low' | 'medium' | 'high' | 'critical' => {
  if (value < 25) return 'low';
  if (value < 50) return 'medium';
  if (value < 75) return 'high';
  return 'critical';
};

const toBlueprint = (seed: { planId: PlanId; namespace: string; risk: number }): RecoveryBlueprint => {
  const emptyPlan: RecoveryPlan = {
    planId: seed.planId,
    labels: { short: 'Seeded', long: 'Seeded blueprint', emoji: '🧩', labels: ['seed', parseRiskBand(seed.risk)] },
    mode: 'automated',
    title: `Seeded ${seed.planId}`,
    description: 'Repository seed blueprint',
    actions: [],
    audit: [],
    slaMinutes: 5,
    isSafe: true,
    version: 1 as unknown as RecoveryPlan['version'],
    effectiveAt: toTimestamp(new Date()),
  };
  return buildBlueprintFromPlan(emptyPlan, seed.namespace);
};

export class InMemoryBlueprintCatalog implements BlueprintCatalogRepository {
  readonly #store = new Map<PlanId, RecoveryBlueprint>();
  readonly #artifacts = new Map<RecoveryBlueprint['blueprintId'], BlueprintArtifact[]>();
  readonly #seed: ReadonlyArray<RecoveryBlueprint>;

  public constructor(seed: ReadonlyArray<{ planId: PlanId; namespace: string; risk: number }> = defaultSeed) {
    this.#seed = seed.map((entry) => toBlueprint(entry));
    for (const blueprint of this.#seed) {
      this.#store.set(blueprint.planId, blueprint);
    }
  }

  public async upsert(blueprint: RecoveryBlueprint): Promise<Result<RecoveryBlueprint, string>> {
    this.#store.set(blueprint.planId, blueprint);
    this.trackArtifacts(blueprint);
    return ok(blueprint);
  }

  public async remove(planId: PlanId): Promise<Result<boolean, string>> {
    const existing = this.#store.delete(planId);
    for (const blueprint of this.#store.values()) {
      for (const artifact of blueprint.steps) {
        if (artifact.stepId.startsWith(`step:${planId}`)) {
          this.#artifacts.delete(blueprint.blueprintId);
          break;
        }
      }
    }
    return ok(existing);
  }

  public async get(planId: PlanId): Promise<Result<RecoveryBlueprint | undefined, string>> {
    return ok(this.#store.get(planId));
  }

  public async find(query: BlueprintCatalogQuery = {}): Promise<Result<readonly RecoveryBlueprint[], string>> {
    const normalized = this.resolveQuery(query);
    const values = normalized
      .map((entry) => entry.blueprint)
      .toSorted((left, right) => left.createdAt.localeCompare(right.createdAt));
    return ok(values);
  }

  public async *stream(planId: PlanId): AsyncGenerator<RecoveryBlueprint | undefined, void, void> {
    const snapshot = await this.get(planId);
    if (!snapshot.ok) {
      return;
    }
    if (!snapshot.value) {
      yield undefined;
      return;
    }
    yield snapshot.value;
    await Promise.resolve();
    yield { ...snapshot.value, status: 'completed' };
  }

  public snapshot(): BlueprintCatalogSnapshot {
    const values = Array.from(this.#store.values());
    const digest = values.map((blueprint) => summarizeBlueprint(blueprint).digest);
    return {
      total: values.length,
      byStatus: this.byField(values, (blueprint) => blueprint.status),
      byRiskBand: this.byField(values, (blueprint) => nextBlueprintRiskBand(blueprint.riskScore)),
      updatedAt: toTimestamp(new Date()),
      digest,
    };
  }

  public listRecent(limit = 10): readonly RecoveryBlueprint[] {
    return Array.from(this.#store.values())
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, Math.max(1, Math.min(limit, 100)));
  }

  public attachArtifacts(blueprintId: RecoveryBlueprint['blueprintId'], artifacts: ReadonlyArray<BlueprintArtifact>): void {
    const list = this.#artifacts.get(blueprintId) ?? [];
    this.#artifacts.set(blueprintId, [...list, ...artifacts]);
  }

  public findArtifacts(blueprintId: RecoveryBlueprint['blueprintId']): readonly BlueprintArtifact[] {
    return this.#artifacts.get(blueprintId) ?? [];
  }

  private resolveQuery(query: BlueprintCatalogQuery): readonly { blueprint: RecoveryBlueprint; risk: number; namespace: string }[] {
    const values = Array.from(this.#store.values());
    const matches = values.filter((blueprint) => {
      if (query.planId !== undefined && blueprint.planId !== query.planId) {
        return false;
      }
      if (query.status !== undefined && blueprint.status !== query.status) {
        return false;
      }
      if (query.namespace !== undefined && blueprint.namespace !== `namespace:${query.namespace}`) {
        return false;
      }
      const risk = Number(blueprint.riskScore);
      if (query.minRisk !== undefined && risk < query.minRisk) {
        return false;
      }
      if (query.maxRisk !== undefined && risk > query.maxRisk) {
        return false;
      }
      return true;
    });
    const withNamespace = matches.map((blueprint) => ({
      blueprint,
      risk: Number(blueprint.riskScore),
      namespace: blueprint.namespace.replace('namespace:', ''),
    }));
    return withNamespace.slice(0, Math.max(1, Math.min(withNamespace.length, query.limit ?? withNamespace.length)));
  }

  private byField<T>(values: readonly RecoveryBlueprint[], selector: (blueprint: RecoveryBlueprint) => T): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const value of values) {
      const key = String(selector(value));
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }

  private trackArtifacts(blueprint: RecoveryBlueprint): void {
    const artifacts = blueprint.steps.map((step) => ({
      artifactId: `artifact:${blueprint.blueprintId}:${step.stepId}` as unknown as BlueprintArtifact['artifactId'],
      source: step.name,
      createdAt: toTimestamp(new Date()),
      payload: {
        action: step.requiredArtifacts,
        stage: step.stage,
      },
      score: step.expectedDurationMinutes,
    }));
    this.attachArtifacts(blueprint.blueprintId, artifacts);
  }
}
