import { fail, ok, type Result } from '@shared/result';
import { withBrand } from '@shared/core';
import type { ReadinessPolicy, RecoveryReadinessPlan, RecoveryReadinessPlanDraft, ReadinessSignal, ReadinessRunId } from '@domain/recovery-readiness';
import type { ReadinessReadModel, ReadinessRepository, ReadinessRepositoryMetrics, RunIndex } from '@data/recovery-readiness-store';
import { MemoryReadinessRepository, summarizeByOwner, buildReadinessDigest, buildReadinessMetricsSnapshot } from '@data/recovery-readiness-store';
import { RecoveryReadinessOrchestrator, type RecoveryRunnerOptions } from './orchestrator';
import { projectReadinessStrategies } from '@domain/recovery-readiness';
import { buildWindowDigest } from '@data/recovery-readiness-store';
import { detectAnomalies } from '@domain/recovery-readiness';

export interface StrategyExecution {
  runId: ReadinessRunId;
  planId: RecoveryReadinessPlan['planId'];
  createdAt: string;
  profiles: number;
}

export interface StrategyCommand {
  type: 'bootstrap' | 'rehearse' | 'summary';
  runId?: ReadinessRunId;
  draft?: RecoveryReadinessPlanDraft;
  signals?: readonly ReadinessSignal[];
}

export interface EngineSummary {
  total: number;
  averageSignals: number;
  topRun?: ReadinessRunId;
  riskScore: number;
  topOwner?: string;
}

export class ReadinessStrategyEngine {
  private readonly orchestrator: RecoveryReadinessOrchestrator;
  private readonly policy: ReadinessPolicy;
  private readonly repo: ReadinessRepository;
  private readonly history = new Map<ReadinessRunId, StrategyExecution>();

  constructor(
    policy: ReadinessPolicy,
    repo?: ReadinessRepository,
    options?: RecoveryRunnerOptions,
  ) {
    this.policy = policy;
    this.repo = repo ?? new MemoryReadinessRepository();
    this.orchestrator = new RecoveryReadinessOrchestrator({
      ...options,
      repo: this.repo,
      policy,
    });
  }

  async execute(command: StrategyCommand): Promise<Result<StrategyExecution, Error>> {
    switch (command.type) {
      case 'bootstrap': {
        if (!command.draft || !command.signals) {
          return fail(new Error('missing-bootstrap-payload'));
        }
        const bootstrap = await this.orchestrator.bootstrap(command.draft, [...command.signals]);
        if (!bootstrap.ok) {
          return fail(bootstrap.error);
        }
        const createdAt = new Date().toISOString();
        const execution: StrategyExecution = {
          runId: command.draft.runId,
          planId: (bootstrap.value as string) as RecoveryReadinessPlan['planId'],
          createdAt,
          profiles: command.signals.length,
        };
        this.history.set(command.draft.runId, execution);
        return ok(execution);
      }
      case 'rehearse': {
        if (!command.runId) {
          return fail(new Error('missing-run-id'));
        }
        const existing = await this.repo.byRun(command.runId);
        if (!existing) {
          return fail(new Error('run-not-found'));
        }
        const reconcile = await this.orchestrator.reconcile(command.runId);
        if (!reconcile.ok) {
          return fail(reconcile.error);
        }
        const execution: StrategyExecution = {
          runId: existing.plan.runId,
          planId: existing.plan.planId,
          createdAt: new Date().toISOString(),
          profiles: existing.signals.length,
        };
        return ok(execution);
      }
      case 'summary': {
        const status = await this.orchestrator.status({
          command: 'list',
          requestedBy: 'readiness-strategy-engine',
          correlationId: 'summary',
        });
        const planRuns = status.runs.length;
        const digest = buildReadinessDigest(status.runs);
        const topOwner = Object.entries(summarizeByOwner(status.runs))[0]?.[0];
        const riskScore = Number(
          (status.runs.reduce((sum, run) => sum + (run.signals.length + run.directives.length), 0) / Math.max(1, planRuns)).toFixed(2),
        );
    return ok({
      runId: withBrand(`summary:${status.trace}`, 'ReadinessRunId'),
      planId: `plan:${status.trace}` as RecoveryReadinessPlan['planId'],
      createdAt: new Date().toISOString(),
      profiles: riskScore,
        });
      }
      default:
        return fail(new Error(`unsupported-command:${command.type}`));
    }
  }

  async summarize(runIds?: readonly ReadinessRunId[]): Promise<EngineSummary> {
    const runs = await this.repo.listActive();
    const filtered = runIds ? runs.filter((run) => runIds.includes(run.plan.runId)) : runs;
    const state = buildReadinessMetricsSnapshot(filtered);
    const digest = buildReadinessDigest(filtered);
    const owners = summarizeByOwner(filtered);
    const topOwner = owners.entries ? owners.entries().next().value?.[0] : undefined;
    const averageSignals = filtered.length
      ? filtered.reduce((sum, run) => sum + run.signals.length, 0) / filtered.length
      : 0;
    return {
      total: filtered.length,
      averageSignals: Number(averageSignals.toFixed(2)),
      topRun: digest.topRunId ? withBrand(digest.topRunId, 'ReadinessRunId') : undefined,
      riskScore: state.totalTracked + state.activeSignals + state.activeRuns,
      topOwner: topOwner ?? undefined,
    };
  }

  async analyzeWindowDensity(): Promise<readonly { runId: string; ratio: number }[]> {
    const runs = await this.repo.listActive();
    const digest = buildWindowDigest(runs);
    return digest.map((entry) => ({
      runId: entry.runId,
      ratio: entry.criticality / Math.max(1, entry.activeDirectives),
    }));
  }

  async rankByPolicy(policy: ReadinessPolicy): Promise<readonly RunIndex[]> {
    const runs = await this.repo.listActive();
    const bundles = projectReadinessStrategies(
      runs.map((model) => ({ plan: model.plan, targets: model.plan.targets, signals: model.signals, directives: model.directives })),
      policy,
    );
    return runs
      .filter((run) => bundles.some((bundle) => bundle.runId === run.plan.runId))
      .map((run) => ({
        runId: run.plan.runId,
        planId: run.plan.planId,
        state: run.plan.state,
        riskBand: run.plan.riskBand,
        owner: run.plan.metadata.owner,
        tags: run.plan.metadata.tags,
      }));
  }

  getPolicyId(): string {
    return this.policy.policyId;
  }

  getRepository(): ReadinessRepository {
    return this.repo;
  }
}
