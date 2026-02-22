import type { ReadinessPolicy, ReadinessSignal, ReadinessRunId, RecoveryReadinessPlanDraft, RecoveryReadinessPlan } from '@domain/recovery-readiness';
import type { ReadinessReadModel, ReadinessRepository } from '@data/recovery-readiness-store';
import { MemoryReadinessRepository, readModelHealths, summarizeByOwner, buildReadinessDigest } from '@data/recovery-readiness-store';
import { ReadinessCommandAnalytics, type FleetSearchInput } from './readiness-command-analytics';
import { ReadinessStrategyEngine, type EngineSummary, type StrategyCommand } from './readiness-strategy-engine';
import { buildGovernanceProfile, buildPolicyDecisions, readModelGovernanceState, summarizeGovernanceByRun } from '@domain/recovery-readiness';
import { buildContextGraph, topologicalSignalPaths, summarizeContext } from '@domain/recovery-readiness';

export interface CommandMatrixRow {
  readonly runId: ReadinessRunId;
  readonly owner: string;
  readonly healthScore: number;
  readonly directivesAtRisk: number;
  readonly trend: ReturnType<typeof summarizeContext>['criticality'];
}

export interface CommandMatrixSummary {
  readonly total: number;
  readonly avgHealth: number;
  readonly topOwner: string | undefined;
  readonly criticalRuns: number;
  readonly rows: readonly CommandMatrixRow[];
}

export interface CommandMatrixOptions {
  readonly repo?: ReadinessRepository;
  readonly policy: ReadinessPolicy;
}

export class ReadinessCommandMatrix {
  private readonly repo: ReadinessRepository;
  private readonly policy: ReadinessPolicy;
  private readonly analytics: ReadinessCommandAnalytics;
  private readonly engine: ReadinessStrategyEngine;

  constructor(options: CommandMatrixOptions) {
    this.repo = options.repo ?? new MemoryReadinessRepository();
    this.policy = options.policy;
    this.analytics = new ReadinessCommandAnalytics({ policy: options.policy, repo: this.repo });
    this.engine = new ReadinessStrategyEngine(options.policy, this.repo, { policy: options.policy });
  }

  async healthMatrix(input: FleetSearchInput = {}): Promise<CommandMatrixSummary> {
    const active = await this.repo.listActive();
    const metrics = readModelHealths(active);
    const owners = summarizeByOwner(active);
    const digest = buildReadinessDigest(active);
    const healthByRun = new Map(metrics.map((metric) => [metric.runId, metric.score] as const));
    const rows = this.rankByRun(active, healthByRun, {});
    const topOwner = owners.entries ? owners.entries().next().value?.[0] : undefined;
    const avgHealth = rows.length ? rows.reduce((sum, row) => sum + row.healthScore, 0) / rows.length : 0;

    return {
      total: active.length,
      avgHealth: Number(avgHealth.toFixed(2)),
      topOwner,
      criticalRuns: rows.filter((row) => row.healthScore < 40).length,
      rows,
    };
  }

  async synthesize(
    input: ReadonlyArray<{ draft: RecoveryReadinessPlanDraft; signals: readonly ReadinessSignal[] }>,
  ): Promise<readonly RecoveryReadinessPlan[]> {
    const outputs: RecoveryReadinessPlan[] = [];
    const created: RecoveryReadinessPlan[] = [];

    for (const pair of input) {
      const result = await this.engine.execute({
        type: 'bootstrap',
        draft: pair.draft,
        signals: pair.signals,
      });
      if (!result.ok) {
        continue;
      }
      const model = await this.repo.byRun(pair.draft.runId);
      if (model) {
        created.push(model.plan);
      }
      outputs.push(...created);
      created.length = 0;
    }

    return outputs;
  }

  async auditRun(runId: ReadinessRunId): Promise<{ commandAccepted: boolean; runbook: ReturnType<typeof buildReadinessRunbook> }> {
    const model = await this.repo.byRun(runId);
    if (!model) {
      return {
        commandAccepted: false,
        runbook: buildReadinessRunbook({
          runId,
          status: 'not-found',
          warnings: ['missing model'],
          actions: [],
        }),
      };
    }

    const governance = buildGovernanceProfile({
      runId,
      plan: model.plan,
      signals: model.signals,
      directives: model.directives,
      policy: this.policy,
    });
    const graph = buildContextGraph({ runId, plan: model.plan, signals: model.signals, directives: model.directives });
    const summary = summarizeContext(graph);
    const criticality = summary.criticality;
    const path = topologicalSignalPaths(graph);
    const decisions = buildPolicyDecisions({
      runId,
      signals: model.signals,
      directives: model.directives,
      policy: this.policy,
    });

    const commandAccepted = decisions.every((decision) => decision.allow) && criticality < 250 && path.length > 0;
    const runbook = buildReadinessRunbook({
      runId,
      status: commandAccepted ? 'approved' : 'blocked',
      warnings: decisions.filter((decision) => !decision.allow).flatMap((decision) => decision.reasons),
      actions: decisions.map((decision) => `${decision.allow ? 'allow' : 'deny'}:${decision.policyId}:${decision.score}`),
      summary,
      governanceCount: governance.directivesAtRisk.length,
      directiveRisk: governance.summary.weightedScore,
    });

    return {
      commandAccepted,
      runbook,
    };
  }

  async runbook(
    runId: ReadinessRunId,
  ): Promise<{ commandAccepted: boolean; runbook: ReturnType<typeof buildReadinessRunbook> }> {
    return this.auditRun(runId);
  }

  private rankByRun(
    models: readonly ReadinessReadModel[],
    healthByRun: Map<ReadinessRunId, number>,
    baseline: Record<string, number>,
  ): readonly CommandMatrixRow[] {
    const governance = readModelGovernanceState(
      models.map((model) => ({
        runId: model.plan.runId,
        plan: model.plan,
        signals: model.signals,
        directives: model.directives,
        policy: this.policy,
      })),
    );
    const byRun = summarizeGovernanceByRun(governance);

    const rows: CommandMatrixRow[] = [];
    for (const model of models) {
      const healthScore = healthByRun.get(model.plan.runId) ?? 0;
      const governanceState = byRun.get(model.plan.runId);
      rows.push({
        runId: model.plan.runId,
        owner: model.plan.metadata.owner,
        healthScore,
        directivesAtRisk: governanceState?.directiveRisk ?? 0,
        trend: governanceState ? governanceState.riskScore : 0,
      });
    }
    rows.sort((left, right) => right.healthScore - left.healthScore);
    return rows.map((row, index) => ({
      ...row,
      trend: baseline[`row:${index}`] ?? row.trend,
    }));
  }

  async replay(runId: ReadinessRunId): Promise<boolean> {
    const summary = await this.analytics.run('replay', runId);
    return summary.ok;
  }

  async summarize(): Promise<EngineSummary> {
    return this.engine.summarize();
  }

  async analyzeDensity(): Promise<readonly { runId: string; ratio: number }[]> {
    return this.engine.analyzeWindowDensity();
  }

  async rank(commandPolicies: readonly ReadinessPolicy[]): Promise<readonly CommandMatrixRow[]> {
    const runs = await this.repo.listActive();
    const ranked = await Promise.all(commandPolicies.map((policy) => this.engine.rankByPolicy(policy)));
    return ranked.flat().map((run) => ({
      runId: run.runId,
      owner: run.owner,
      healthScore: 0,
      directivesAtRisk: run.tags.length,
      trend: run.tags.length * 0,
    }));
  }
}

type RunbookSeverity = 'approved' | 'blocked' | 'not-found';

type ReadinessRunbook = {
  runId: ReadinessRunId;
  issuedAt: string;
  severity: RunbookSeverity;
  warnings: readonly string[];
  actions: readonly string[];
  summary?: {
    readonly criticality: number;
  };
  directiveRisk?: number;
  governanceCount?: number;
};

function buildReadinessRunbook(input: {
  runId: ReadinessRunId;
  status: RunbookSeverity;
  warnings: readonly string[];
  actions: readonly string[];
  summary?: ReturnType<typeof summarizeContext>;
  directiveRisk?: number;
  governanceCount?: number;
}): ReadinessRunbook {
  return {
    runId: input.runId,
    issuedAt: new Date().toISOString(),
    severity: input.status,
    warnings: input.warnings,
    actions: input.actions,
    summary: input.summary ? { criticality: input.summary.criticality } : undefined,
    directiveRisk: input.directiveRisk,
    governanceCount: input.governanceCount,
  };
}
