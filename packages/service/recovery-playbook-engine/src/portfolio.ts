import { fail, ok, type Result } from '@shared/result';
import { withBrand } from '@shared/core';
import {
  type RecoveryPlaybook,
  type RecoveryPlaybookContext,
  type RecoveryPlaybookQuery,
  type RecoveryPlanExecution,
  type RecoveryPlanId,
  type RecoveryPlaybookId,
  type PlaybookSelectionPolicy,
  buildRecommendations,
  buildPlaybookPortfolio,
  comparePortfolio,
  type PortfolioRecommendation,
  type PortfolioQuery,
  type PlaybookPortfolio,
  type PortfolioDiff,
} from '@domain/recovery-playbooks';
import type { RecoveryPlaybookRepository } from '@data/recovery-playbook-store';
import { RecoveryPlaybookCatalog } from './selection';
import { buildExecution } from '@domain/recovery-playbooks';

interface QuerySummary {
  readonly query: RecoveryPlaybookQuery;
  readonly hitCount: number;
}

interface ExecutionSummary {
  readonly runId: RecoveryPlanExecution['id'];
  readonly selectedPlaybookId: RecoveryPlaybookId;
  readonly warnings: readonly string[];
  readonly estimatedMinutes: number;
}

export interface PlaybookPortfolioManagerDeps {
  readonly repository: RecoveryPlaybookRepository;
  readonly policy: PlaybookSelectionPolicy;
}

export interface PreparedPortfolio {
  readonly portfolio: PlaybookPortfolio;
  readonly summary: QuerySummary;
  readonly recommendationsCount: number;
}

export interface PortfolioExecutionPlan {
  readonly id: string;
  readonly context: RecoveryPlaybookContext;
  readonly execution: RecoveryPlanExecution;
  readonly recommendations: readonly string[];
  readonly summary: {
    readonly selections: readonly string[];
    readonly warnings: readonly string[];
    readonly portfolioDiff?: PortfolioDiff;
  };
}

export interface PortfolioServiceState {
  readonly portfolios: Map<string, PlaybookPortfolio>;
  readonly runs: Map<string, RecoveryPlanExecution>;
}

const resolveQuery = (context: RecoveryPlaybookContext, policy: PlaybookSelectionPolicy): RecoveryPlaybookQuery => ({
  tenantId: withBrand(context.tenantId, 'TenantId'),
  serviceId: withBrand(context.serviceId, 'ServiceId'),
  status: policy.allowedStatuses[0] ?? 'published',
  labels: policy.requiredLabels,
  categories: ['recovery'],
  severityBands: ['p0', 'p1'],
  limit: Math.min(200, Math.max(5, policy.maxStepsPerRun)),
});

const executionWarnings = (run: RecoveryPlanExecution): readonly string[] => {
  const warnings: string[] = [];
  if (run.telemetry.failures > 0) warnings.push(`${run.telemetry.failures} failures`);
  if (run.status === 'failed') warnings.push('run-failed');
  if (run.telemetry.recoveredStepIds.length === 0 && run.selectedStepIds.length > 0) warnings.push('no-recovered-steps');
  return warnings;
};

export class PlaybookPortfolioManager {
  private readonly catalog: RecoveryPlaybookCatalog;
  private readonly state: PortfolioServiceState = {
    portfolios: new Map<string, PlaybookPortfolio>(),
    runs: new Map<string, RecoveryPlanExecution>(),
  };

  constructor(private readonly deps: PlaybookPortfolioManagerDeps) {
    this.catalog = new RecoveryPlaybookCatalog(deps.repository);
  }

  async buildPortfolio(
    context: RecoveryPlaybookContext,
    policyOverrides?: Partial<PlaybookSelectionPolicy>,
  ): Promise<Result<PreparedPortfolio, string>> {
    const policy = { ...this.deps.policy, ...policyOverrides };
    const query = resolveQuery(context, policy);
    const catalogResult = await this.catalog.list(query);
    if (!catalogResult.ok) return fail(catalogResult.error);

    const portfolio = buildPlaybookPortfolio(catalogResult.value, context, {
      tenantId: context.tenantId,
      horizonHours: 6,
      weights: {
        severity: 0.5,
        urgency: 0.2,
        blastRadius: 0.1,
        tenantValue: 0.15,
        automationCoverage: 0.05,
      },
      maxCount: Math.min(80, policy.maxStepsPerRun * 2),
    });

    this.state.portfolios.set(portfolio.portfolioId, portfolio);

    const recommendations = buildRecommendations(portfolio, catalogResult.value, {
      tenantId: context.tenantId,
      clusters: ['greenfield', 'steady-state', 'incident-heavy'],
      minScore: 0.2,
      maxCount: 12,
    });

    return ok({
      portfolio,
      summary: {
        query,
        hitCount: catalogResult.value.length,
      },
      recommendationsCount: recommendations.length,
    });
  }

  async prepareRun(
    tenantId: string,
    context: RecoveryPlaybookContext,
  ): Promise<Result<PortfolioExecutionPlan, string>> {
    const built = await this.buildPortfolio(context);
    if (!built.ok) return fail(built.error);

    const catalogResult = await this.catalog.list(resolveQuery(context, this.deps.policy));
    if (!catalogResult.ok) return fail(catalogResult.error);
    const selected = catalogResult.value.at(0);
    if (!selected) return fail('no-playbook-selected');

    const execution = buildExecution(selected.id, `${tenantId}:run:${Date.now()}` as RecoveryPlanId, [
      {
        playbook: selected,
        score: 1,
        rationale: ['prepared-by-manager'],
      },
    ]);
    execution.status = 'pending';
    this.state.runs.set(execution.id, execution);

    const previous = [...this.state.portfolios.values()].at(-2);
    const comparison = previous ? comparePortfolio(built.value.portfolio, previous) : undefined;
    const recommendations: readonly PortfolioRecommendation[] = buildRecommendations(
      built.value.portfolio,
      catalogResult.value,
      {
        tenantId,
        clusters: ['greenfield'],
        maxCount: 6,
      },
    );

    return ok({
      id: execution.id,
      context,
      execution,
      recommendations: recommendations.map((recommendation) => recommendation.playbookId),
      summary: {
        selections: recommendations.map((recommendation) => recommendation.playbookId),
        warnings: executionWarnings(execution),
        portfolioDiff: comparison,
      },
    });
  }

  async finalizeRun(
    runId: RecoveryPlanExecution['id'],
    status: RecoveryPlanExecution['status'],
  ): Promise<Result<PortfolioExecutionPlan | undefined, string>> {
    const run = this.state.runs.get(runId);
    if (!run) return ok(undefined);
    run.status = status;
    run.completedAt = new Date().toISOString();
    const recommendations: readonly string[] = [];
    const portfolio = [...this.state.portfolios.values()].at(-1);
    const summary = {
      selections: run.selectedStepIds.map((stepId) => `${stepId}`),
      warnings: executionWarnings(run),
      portfolioDiff: portfolio ? comparePortfolio(portfolio, undefined) : undefined,
    };
    return ok({
      id: run.id,
      context: {
        tenantId: run.id.split(':')[0] ?? 'tenant-default',
        serviceId: 'service-default',
        incidentType: 'finalized',
        affectedRegions: ['global'],
        triggeredBy: run.operator,
      },
      execution: run,
      recommendations,
      summary,
    });
  }

  getPortfolio(portfolioId: string): PlaybookPortfolio | undefined {
    return this.state.portfolios.get(portfolioId);
  }

  listPortfolios(): readonly PlaybookPortfolio[] {
    return [...this.state.portfolios.values()];
  }

  listRuns(): readonly RecoveryPlanExecution[] {
    return [...this.state.runs.values()];
  }
}

export const createPortfolioManager = (repository: RecoveryPlaybookRepository): PlaybookPortfolioManager => {
  const policy: PlaybookSelectionPolicy = {
    maxStepsPerRun: 18,
    allowedStatuses: ['published'],
    requiredLabels: ['automated'],
    forbiddenChannels: ['manual-window'],
  };
  return new PlaybookPortfolioManager({ repository, policy });
};
