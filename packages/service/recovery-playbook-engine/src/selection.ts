import { fail, ok, type Result } from '@shared/result';
import {
  type RankedPlaybook,
  type RecoveryPlaybook,
  type RecoveryPlaybookQuery,
  type RecoveryPlaybookContext,
  type RecoveryPlanExecution,
  type RecoveryPlaybookId,
  type RecoveryStepId,
  type PlaybookSelectionPolicy,
  type PlaybookRuntimeError,
  rankPlaybooks,
  pickTopSteps,
  buildExecution,
  matchesQuery,
  evaluatePlaybookContext,
} from '@domain/recovery-playbooks';
import type {
  PlaybookEnvelope,
  RecoveryPlaybookRepository,
} from '@data/recovery-playbook-store';

export interface PlaybookServiceDeps {
  repository: RecoveryPlaybookRepository;
  policy: PlaybookSelectionPolicy;
}

interface EnginePolicy {
  minScore: number;
  maxDurationMinutes: number;
  maxSelectionsPerService: number;
}

export interface ExecutionPlan {
  candidateCount: number;
  selectedSteps: readonly RecoveryStepId[];
  reasons: readonly string[];
  riskWarnings: readonly string[];
  estimatedMinutes: number;
}

const defaultPolicy: EnginePolicy = {
  minScore: 0.35,
  maxDurationMinutes: 600,
  maxSelectionsPerService: 3,
};

const tenantTierFromContext = (tenantId: string, context: RecoveryPlaybookContext): 'critical' | 'premium' | 'standard' => {
  if (tenantId === context.triggeredBy) return 'critical';
  if (context.tenantId.includes('premium')) return 'premium';
  return 'standard';
};

const scoreToDuration = (count: number, score: number): number => count * 12 + score;

export class RecoveryPlaybookCatalog {
  constructor(private readonly repository: RecoveryPlaybookRepository) {}

  async list(query: RecoveryPlaybookQuery): Promise<Result<readonly RecoveryPlaybook[], string>> {
    const result = await this.repository.query(query);
    if (!result.ok) return fail(result.error, result.code);

    const payload = result.value.items.map((item: PlaybookEnvelope) => item.playbook);
    return ok(payload.filter((playbook) => matchesQuery(playbook, query)));
  }

  async get(id: RecoveryPlaybookId): Promise<RecoveryPlaybook | undefined> {
    const item = await this.repository.getById(id);
    return item.ok ? item.value?.playbook : undefined;
  }
}

export class PlaybookSelectionEngine {
  constructor(
    private readonly catalog: RecoveryPlaybookCatalog,
    private readonly policy: EnginePolicy = defaultPolicy,
  ) {}

  async select(
    context: RecoveryPlaybookContext,
    tenantRiskScore: number,
  ): Promise<Result<ExecutionPlan, string>> {
    const candidateResult = await this.catalog.list({
      status: 'published',
      limit: 100,
      severityBands: ['p0', 'p1', 'p2'],
      labels: ['automated'],
    });
    if (!candidateResult.ok) return fail(candidateResult.error);

    const riskPolicy = this.selectionPolicyFromRisk(tenantRiskScore);
    const ranked = rankPlaybooks(candidateResult.value, riskPolicy);
    const shortlisted = pickTopSteps(ranked, riskPolicy, this.policy.maxSelectionsPerService);
    if (shortlisted.length === 0) return fail('no-playbooks-match-selection-policy');

    const evaluator = {
      tenantRisk: tenantRiskScore,
      tenantTier: tenantTierFromContext(context.triggeredBy, context),
      serviceCriticality: Math.min(10, context.affectedRegions.length * 2 + 1),
    };

    const warnings: string[] = [];
    let best: RankedPlaybook | undefined;
    for (const candidate of shortlisted) {
      const evalResult = evaluatePlaybookContext(candidate.playbook, context, evaluator);
      if (!evalResult.allow) {
        warnings.push(`playbook ${candidate.playbook.title} rejected: ${evalResult.reasons.join(', ')}`);
        continue;
      }
      if (!best || evalResult.score > evaluatePlaybookContext(best.playbook, context, evaluator).score) {
        best = candidate;
      }
    }

    if (!best) return fail('no-playbook-context-pass');

    const selectedSteps = best.playbook.steps.map((step) => step.id as RecoveryStepId);
    if (selectedSteps.length === 0) return fail('playbook-has-no-steps');

    const estimatedMinutes = scoreToDuration(selectedSteps.length, best.score);
    if (estimatedMinutes < this.policy.minScore || estimatedMinutes > this.policy.maxDurationMinutes) {
      return fail('selected-playbook-duration-out-of-range');
    }

    return ok({
      candidateCount: candidateResult.value.length,
      selectedSteps,
      reasons: best.rationale,
      riskWarnings: warnings,
      estimatedMinutes,
    });
  }

  private selectionPolicyFromRisk(score: number): PlaybookSelectionPolicy {
    return {
      maxStepsPerRun: score >= 0.8 ? 16 : score >= 0.5 ? 10 : 6,
      allowedStatuses: ['published', 'deprecated'],
      requiredLabels: ['automated'],
      forbiddenChannels: score > 0.8 ? [] : ['unsafe-window'],
    };
  }
}

export class PlaybookExecutionSession {
  private readonly runMap = new Map<string, RecoveryPlanExecution>();
  private readonly errors: PlaybookRuntimeError[] = [];

  constructor(
    private readonly selectionEngine: PlaybookSelectionEngine,
    private readonly catalog: RecoveryPlaybookCatalog,
  ) {}

  async prepareRun(tenantId: string, context: RecoveryPlaybookContext): Promise<Result<RecoveryPlanExecution, string>> {
    const selection = await this.selectionEngine.select(context, this.computeTenantRisk(tenantId, context));
    if (!selection.ok) return fail(selection.error);

    const candidatePlaybooks = await this.catalog.list({
      status: 'published',
      limit: 1,
      labels: ['automated'],
    });
    if (!candidatePlaybooks.ok) return fail(candidatePlaybooks.error);
    const chosenPlaybook = candidatePlaybooks.value.at(0);
    if (!chosenPlaybook) return fail('no-playbook-available');

    const execution = buildExecution(chosenPlaybook.id, `${tenantId}:run:${Date.now()}`, [
      { playbook: chosenPlaybook, score: selection.value.estimatedMinutes, rationale: selection.value.rationale },
    ]);
    execution.status = 'running';
    execution.startedAt = new Date().toISOString();

    this.runMap.set(execution.id, execution);
    return ok(execution);
  }

  getRun(runId: string): RecoveryPlanExecution | undefined {
    return this.runMap.get(runId);
  }

  async finishRun(runId: string, status: RecoveryPlanExecution['status']): Promise<void> {
    const run = this.runMap.get(runId);
    if (!run) return;
    run.status = status;
    run.completedAt = new Date().toISOString();
  }

  addError(runId: string, error: PlaybookRuntimeError): void {
    this.errors.push(error);
    const run = this.runMap.get(runId);
    if (!run) return;
    run.telemetry.failures += 1;
    run.telemetry.recoveredStepIds = run.telemetry.recoveredStepIds.filter((id) => id !== error.stepId);
  }

  getErrors(): readonly PlaybookRuntimeError[] {
    return [...this.errors];
  }

  private computeTenantRisk(tenantId: string, context: RecoveryPlaybookContext): number {
    return tenantId === context.triggeredBy ? 0.85 : 0.4;
  }
}
