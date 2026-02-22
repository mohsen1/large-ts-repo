import { fail, ok, type Result } from '@shared/result';
import { neverFail, withRetry } from '@shared/util';
import { InMemoryBus } from '@platform/messaging';
import { rankPlaybooks, type RecoveryPlaybook, type RecoveryPlaybookContext, type RecoveryPlaybookId, type RecoveryPlaybookQuery, type PlaybookSelectionPolicy } from '@domain/recovery-playbooks';
import type { RecoveryPlaybookRepository, PaginatedPage } from '@data/recovery-playbook-store';
import {
  type OrchestratorState,
  type PlaybookSelectionResult,
  type PlaybookSelectorInput,
  type RunId,
  type StageName,
  type ServiceQueryPlan,
  type PlanId,
  type ServiceEnvelope,
  type RunPlan,
  type StageExecution,
} from './model';
import { RecoveryPlaybookCatalog } from './selection';
import { PolicyRuntime, createConstraintSet } from './policy';
import { Scheduler, type PlanSchedule, type PlanStage } from './scheduler';
import {
  BusAdapter,
  MemoryOrchestratorStateAdapter,
  MemoryPlanAdapter,
  type OrchestratorStateAdapter,
  NoopMetricsAdapter,
} from './adapter';
import { Reporter } from './reporting';

export interface OrchestratorOptions {
  catalog: RecoveryPlaybookCatalog;
  repository: RecoveryPlaybookRepository;
  profiles?: readonly string[];
  bus?: InMemoryBus;
  policy: PlaybookSelectionPolicy;
  tenantPriority?: number;
}

const defaultQuery: RecoveryPlaybookQuery = {
  status: 'published',
  limit: 75,
};

const defaultTenantPriority = 50;
const nowIso = () => new Date().toISOString();
const nowRandomId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export class RecoveryPlaybookOrchestrator {
  private readonly options: OrchestratorOptions;
  private readonly policyEngine: PolicyRuntime;
  private readonly scheduler: Scheduler;
  private readonly reporter: Reporter;
  private readonly bus: BusAdapter;
  private readonly stateAdapter: OrchestratorStateAdapter;
  private readonly planAdapter = new MemoryPlanAdapter();
  private readonly metrics = new NoopMetricsAdapter();
  private readonly profiles: readonly string[];

  constructor(options: OrchestratorOptions) {
    this.options = options;
    this.profiles = options.profiles ?? [];
    this.policyEngine = new PolicyRuntime(options.policy);
    this.scheduler = new Scheduler(4);
    this.reporter = new Reporter();
    this.bus = new BusAdapter(options.bus ?? new InMemoryBus());
    this.stateAdapter = new MemoryOrchestratorStateAdapter();
  }

  get id(): string {
    return 'recovery-playbook-orchestrator';
  }

  async queueRun(
    tenantId: string,
    context: RecoveryPlaybookContext,
    policyOverrides?: PlaybookSelectionPolicy,
  ): Promise<Result<RunId, string>> {
    const query = this.buildRecoveryQuery(context, 50);
    const candidates = await this.options.catalog.list(query);
    if (!candidates.ok) return fail(candidates.error, candidates.code);
    if (candidates.value.length === 0) return fail('no-playbook-candidates');

    const selectorInput: PlaybookSelectorInput = {
      context,
      tenantRiskScore: Math.min(1, Math.max(0.05, context.serviceId.length / 20)),
      tenantPriority: this.options.tenantPriority ?? defaultTenantPriority,
      now: nowIso(),
    };

    const ranked = this.policyEngine.rank(candidates.value, selectorInput);
    const selection = this.selectCandidate(ranked, policyOverrides ?? this.options.policy, selectorInput, context);
    if (!selection.ok) return fail(selection.error);

    const schedule = this.scheduler.createSchedule(selection.value.playbook, selection.value);
    if (!schedule.ok) return fail(schedule.error);

    const runId = nowRandomId('run') as RunId;
    const planId = nowRandomId('plan') as PlanId;
    const state: OrchestratorState = {
      status: 'queued',
      run: {
        runId,
        tenantId,
        playbookId: selection.value.playbook.id,
        triggeredBy: context.triggeredBy,
        context,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      latestPlanId: planId,
      stages: [],
      error: undefined,
    };

    const planSaved = await this.savePlanArtifact(planId, selection.value, schedule.value);
    if (!planSaved.ok) return fail(planSaved.error);
    const stateSaved = await this.stateAdapter.save(state);
    if (!stateSaved.ok) return fail(stateSaved.error);

    await this.publish('run.queued', {
      runId,
      tenantId,
      playbookId: selection.value.playbook.id,
      score: selection.value.score,
      reasons: selection.value.rationale,
    });
    this.metrics.increment('playbook-runs-queued');

    return ok(runId);
  }

  async runScheduled(runId: RunId): Promise<Result<string, string>> {
    const stateResult = await this.stateAdapter.load(runId);
    if (!stateResult.ok) return fail(stateResult.error);
    const state = stateResult.value;
    if (!state) return fail('run-not-found');

    const catalogResult = await this.options.catalog.get(state.run.playbookId);
    if (!catalogResult) return fail('playbook-not-found');
    const candidates = await this.options.catalog.list(defaultQuery);
    if (!candidates.ok) return fail(candidates.error);
    if (candidates.value.length === 0) return fail('catalog-has-no-playbooks');

    const best = rankPlaybooks(candidates.value, this.options.policy).at(0);
    if (!best) return fail('ranking-produced-empty-set');

    const executionPlan = await this.createExecutionTrace(catalogResult, runId);
    if (!executionPlan.ok) return fail(executionPlan.error);

    for (const stage of executionPlan.value.stages) {
      await this.markStageStarted(state, stage);
    }

    const updated: OrchestratorState = { ...state, status: 'running', run: { ...state.run, updatedAt: nowIso() } };
    const saved = await this.stateAdapter.save(updated);
    if (!saved.ok) return fail(saved.error);

    const reportCandidate = {
      candidateScore: best.score,
      selectedPlaybook: best.playbook.title,
      rationale: best.rationale.join(','),
      selectedStepsCount: best.playbook.steps.length,
    };
    await this.publish('run.started', buildEnvelope('RunStarted', reportCandidate));
    this.metrics.observeDuration('run-startup-ms', 42);

    void best;
    return ok(updated.run.runId);
  }

  async finalizeRun(runId: RunId, status: OrchestratorState['status']): Promise<Result<void, string>> {
    const stateResult = await this.stateAdapter.load(runId);
    if (!stateResult.ok) return fail(stateResult.error);
    const state = stateResult.value;
    if (!state) return fail('run-not-found');

    const transition = this.policyEngine.applyStatusTransition(state.status, status);
    if (!transition.ok) return fail(transition.error);

    const updated: OrchestratorState = { ...state, status: transition.value, run: { ...state.run, updatedAt: nowIso() } };
    const saved = await this.stateAdapter.save(updated);
    if (!saved.ok) return fail(saved.error);

    await this.publish('run.finalized', { runId, status });
    this.metrics.increment('playbook-runs-finalized', 1);
    return ok(undefined);
  }

  async summarize(windowStart: string, windowEnd: string): Promise<Result<ReturnType<Reporter['summarize']>, string>> {
    const statesResult = await this.stateAdapter.snapshot();
    if (!statesResult.ok) return fail(statesResult.error);
    const since = Date.parse(windowStart);
    const until = Date.parse(windowEnd);
    const inRange = statesResult.value.filter((state) => {
      const started = Date.parse(state.run.createdAt);
      return Number.isFinite(started) && started >= since && started <= until;
    });
    const summary = this.reporter.summarize(inRange);
    return ok(summary);
  }

  async buildQuery(plan: ServiceQueryPlan): Promise<Result<RecoveryPlaybookQuery, string>> {
    if (plan.pageSize > 250) return fail('playbook-query-limit-exceeded');
    return ok({
      ...plan.query,
      limit: plan.pageSize,
      labels: plan.labels.length > 0 ? plan.labels : undefined,
    });
  }

  async findByTenant(tenantId: string): Promise<Result<readonly RunId[], string>> {
    const snapshot = await this.stateAdapter.snapshot();
    if (!snapshot.ok) return fail(snapshot.error);
    const filtered = snapshot.value
      .filter((state) => state.run.tenantId === tenantId)
      .map((state) => state.run.runId);
    return ok(filtered);
  }

  async healthCheck(): Promise<'ok' | 'degraded'> {
    const check = await neverFail(async () => {
      const listIds = this.options.repository.listIds;
      if (!listIds) return 'degraded';
      const repositoryIds = await listIds.call(this.options.repository);
      if (!Array.isArray(repositoryIds)) return 'degraded';
      if (repositoryIds.length < 0) return 'degraded';
      return 'ok';
    }, 'degraded');
    return check;
  }

  private selectCandidate(
    ranked: readonly PlaybookSelectionResult[],
    policy: PlaybookSelectionPolicy,
    selectorInput: PlaybookSelectorInput,
    context: RecoveryPlaybookContext,
  ): Result<PlaybookSelectionResult, string> {
    const policyResult = this.policyEngine.evaluateForSelection(policy, {
      context,
      input: selectorInput,
      selectedLabels: [...this.profiles, ...context.affectedRegions, context.serviceId, context.incidentType],
    });
    if (!policyResult.ok) return fail(policyResult.error);

    const filtered = ranked.filter((candidate) => candidate.plan.expectedMinutes <= policyResult.value.maxStepsPerRun * 7);
    if (filtered.length === 0) return fail('no-candidates-after-policy-filter');
    return ok(filtered[0]);
  }

  private buildRecoveryQuery(context: RecoveryPlaybookContext, limit: number): RecoveryPlaybookQuery {
    const labels = new Set([...context.affectedRegions, ...context.incidentType.split('-'), context.serviceId]);
    return {
      ...defaultQuery,
      status: 'published',
      limit,
      labels: [...labels],
      categories: ['recovery', 'continuity'],
    };
  }

  private async savePlanArtifact(
    planId: PlanId,
    selection: PlaybookSelectionResult,
    schedule: PlanSchedule,
  ): Promise<Result<void, string>> {
    const artifact = await this.planAdapter.savePlan({
      id: planId,
      hash: `hash-${selection.playbook.id}-${selection.score}`,
      source: 'recovery-playbook-orchestrator',
      createdAt: nowIso(),
    });
    if (!artifact.ok) return fail(artifact.error);

    const loadback = await this.planAdapter.loadPlan(planId);
    if (!loadback.ok) return ok(undefined);
    void loadback.value;
    void schedule;
    return ok(undefined);
  }

  private async createExecutionTrace(
    playbook: RecoveryPlaybook,
    runId: RunId,
  ): Promise<Result<PlanSchedule, string>> {
    const constraints = createConstraintSet(
      {
        tenantId: runId,
        serviceId: runId,
        incidentType: 'scheduled-run',
        affectedRegions: [],
        triggeredBy: 'orchestrator',
      },
      ['scheduled', 'internal'],
    );
    const selection: PlaybookSelectionResult = {
      playbook,
      score: 0.75,
      rationale: ['scheduled-trace'],
      warnings: ['best-effort'],
      plan: {
        constraints,
        riskBucket: 'low',
        expectedMinutes: playbook.steps.length * 8,
      },
    };

    return withRetry(async () => {
      const schedule = this.scheduler.createSchedule(playbook, selection);
      if (!schedule.ok) return fail(schedule.error);
      const ordered = [...schedule.value.stages].sort((a, b) => a.windowMinutes - b.windowMinutes);
      return ok({ ...schedule.value, stages: ordered });
    }, { times: 3, delayMs: 25, factor: 2 }).then((value) => {
      return value ?? fail('execution-trace-generation-failed');
    });
  }

  private async markStageStarted(state: OrchestratorState, stage: PlanStage): Promise<void> {
    const stageExecution: StageExecution = {
      stage: `${state.run.runId}-${stage.id}` as StageName,
      startedAt: nowIso(),
      endedAt: undefined,
      failedSteps: [],
      completedSteps: [],
    };
    state.stages = [...state.stages, stageExecution];
    await this.stateAdapter.save(state);
    await this.publish('run.stage.started', {
      runId: state.run.runId,
      stage: stage.id,
      budget: stage.windowMinutes,
    });
  }

  private async publish(eventName: string, payload: unknown): Promise<void> {
    const envelope = buildEnvelope(eventName, payload);
    await this.bus.publish(eventName, envelope);
  }
}

const buildEnvelope = <TPayload>(name: string, payload: TPayload): ServiceEnvelope<TPayload> => ({
  name,
  version: 1,
  payload,
});

export const loadPlaybooksFromStore = async (
  repository: RecoveryPlaybookRepository,
  query: RecoveryPlaybookQuery,
): Promise<Result<PaginatedPage<RecoveryPlaybook>, string>> => {
  const page = await repository.query(query);
  if (!page.ok) return fail(page.error);
  return ok({
    total: page.value.total,
    hasMore: page.value.hasMore,
    cursor: page.value.cursor,
    items: page.value.items.map((item) => item.playbook),
  });
};
