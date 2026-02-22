import type { ReadinessPolicy, ReadinessSignal, ReadinessRunId, RecoveryReadinessPlan, RecoveryReadinessPlanDraft } from '@domain/recovery-readiness';
import type { ReadinessReadModel, ReadinessRepository } from '@data/recovery-readiness-store';
import { MemoryReadinessRepository, summarizeByOwner, readModelHealths, buildReadinessMetricsSnapshot } from '@data/recovery-readiness-store';
import { ReadinessStrategyEngine } from './readiness-strategy-engine';
import { ReadinessCommandMatrix } from './readiness-command-matrix';
import type { EngineSummary, StrategyCommand } from './readiness-strategy-engine';

export interface PortfolioRoute {
  readonly routeId: string;
  readonly planId: RecoveryReadinessPlan['planId'];
  readonly runId: ReadinessRunId;
  readonly state: ReadinessReadModel['plan']['state'];
  readonly score: number;
  readonly severity: 'low' | 'medium' | 'high';
}

export interface PortfolioRouterOptions {
  readonly policy: ReadinessPolicy;
  readonly repo?: ReadinessRepository;
}

export class ReadinessPortfolioRouter {
  private readonly repo: ReadinessRepository;
  private readonly policy: ReadinessPolicy;
  private readonly engine: ReadinessStrategyEngine;
  private readonly matrix: ReadinessCommandMatrix;

  constructor(options: PortfolioRouterOptions) {
    this.repo = options.repo ?? new MemoryReadinessRepository();
    this.policy = options.policy;
    this.engine = new ReadinessStrategyEngine(options.policy, this.repo, { policy: options.policy });
    this.matrix = new ReadinessCommandMatrix({ policy: options.policy, repo: this.repo });
  }

  async route(): Promise<readonly PortfolioRoute[]> {
    const active = await this.repo.listActive();
    const health = readModelHealths(active);
    const owners = summarizeByOwner(active);
    const healthMap = new Map(health.map((entry) => [entry.runId, entry.score] as const));
    const plans = this.prioritize(active);
    const rows: PortfolioRoute[] = [];

    let index = 0;
    for (const plan of plans) {
      rows.push({
        routeId: `route-${index}:${plan.plan.planId}`,
        planId: plan.plan.planId,
        runId: plan.plan.runId,
        state: plan.plan.state,
        score: healthMap.get(plan.plan.runId) ?? 0,
        severity: this.classifySeverity(owners.get(plan.plan.metadata.owner) ?? 0, healthMap.get(plan.plan.runId) ?? 0),
      });
      index += 1;
    }

    return rows;
  }

  async bootstrapDrafts(input: readonly { draft: RecoveryReadinessPlanDraft; signals: readonly ReadinessSignal[] }[]): Promise<
    readonly RecoveryReadinessPlan['planId'][]
  > {
    const runs = await Promise.all(
      input.map(async ({ draft, signals }) => {
        const command: StrategyCommand = { type: 'bootstrap', draft, signals };
        const result = await this.engine.execute(command);
        if (!result.ok) {
          return undefined;
        }
        return result.value.planId;
      }),
    );

    return runs.filter((run): run is RecoveryReadinessPlan['planId'] => run !== undefined);
  }

  async summarize(): Promise<EngineSummary> {
    return this.engine.summarize();
  }

  async refreshMatrix() {
    const matrix = await this.matrix.healthMatrix();
    return {
      total: matrix.total,
      criticalRuns: matrix.criticalRuns,
      topOwner: matrix.topOwner,
      avgHealth: matrix.avgHealth,
    };
  }

  async inspectByPolicy(policy: ReadinessPolicy): Promise<readonly PortfolioRoute[]> {
    const ranked = await this.engine.rankByPolicy(policy);
    return ranked.map((row, index) => ({
      routeId: `policy:${policy.policyId}:${index}`,
      planId: row.planId,
      runId: row.runId,
      state: row.state,
      score: 0,
      severity: index % 3 === 0 ? 'high' : index % 2 === 0 ? 'medium' : 'low',
    }));
  }

  private prioritize(models: readonly ReadinessReadModel[]): ReadonlyArray<ReadinessReadModel & { priority: number }> {
    const snapshot = buildReadinessMetricsSnapshot(models);
    return models
      .map((model, index) => ({
        ...model,
        priority: (snapshot.totalTracked + index) / Math.max(1, model.signals.length + 1),
      }))
      .sort((left, right) => right.priority - left.priority);
  }

  private classifySeverity(ownerRunCount: number, score: number): 'low' | 'medium' | 'high' {
    if (ownerRunCount > 2 && score < 40) {
      return 'high';
    }
    if (score < 55) {
      return 'medium';
    }
    return 'low';
  }
}
