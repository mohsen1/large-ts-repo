import { simulateStrategy } from '@domain/recovery-orchestration-planning';
import type {
  StrategyTemplate,
  StrategyDraft,
  StrategyPlan,
  StrategyRun,
  StrategyRunId,
  StrategyPolicy,
  RiskPosture,
} from '@domain/recovery-orchestration-planning';
import type { StrategyStore, StrategyStoreRecord } from '@data/recovery-strategy-store';
import type { Result } from '@shared/result';

const ok = <T>(value: T): Result<T, string> => ({ ok: true, value });

const policy: StrategyPolicy = {
  maxParallelism: 4,
  allowedPosture: ['low', 'medium', 'high', 'critical'],
  commandCostPenalty: 0.25,
  minimumRunbookTokens: 1,
};

export interface PlanAndDraft {
  readonly draft: StrategyDraft;
  readonly plan: StrategyPlan;
}

const postureFromStep = (step: StrategyTemplate['steps'][number]): RiskPosture => {
  if (step.phase === 'release' || step.expectedRiskReduction < 0.3) {
    return 'high';
  }
  if (step.maxParallelism > 1) {
    return 'medium';
  }
  return 'low';
};

export const buildDraftFromTemplate = (tenantId: string, template: StrategyTemplate): PlanAndDraft => {
  const windows = template.steps.map((step, index) => ({
    minuteOffset: index * 4,
    riskPosture: postureFromStep(step),
    expectedRto: Math.max(10, 120 - step.expectedRiskReduction * 20 + index),
    commandCount: step.command.estimatedMinutes,
    signalDensity: 0.2 + (index + 1) * 0.03,
  }));

  const draft: StrategyDraft = {
    draftId: `draft-${tenantId}-${template.templateId}-${Date.now()}`,
    owner: template.createdBy,
    template,
    requestedAt: new Date().toISOString(),
    priority: template.steps.length > 3 ? 'high' : 'medium',
    budgetMinutes: windows.reduce((sum, window) => sum + window.expectedRto, 0),
    stepsWindow: windows,
  };

  const plan: StrategyPlan = {
    strategyId: template.templateId,
    templateId: template.templateId,
    draftId: draft.draftId,
    runbookTokens: template.steps.map((step) => step.command.token),
    windows,
    dependencies: template.dependencies,
    executionPriority: template.steps.map((step) => step.stepId),
  };

  return { draft, plan };
};

export const persistPlan = async (
  store: StrategyStore,
  tenantId: string,
  draft: StrategyDraft,
  plan: StrategyPlan,
): Promise<Result<void, string>> => {
  const record: StrategyStoreRecord = {
    tenantId,
    plan,
    draft,
    template: draft.template,
    windows: plan.windows,
    commandLog: [],
    updatedAt: new Date().toISOString(),
  };
  return store.upsertPlan(tenantId, record);
};

export const runSimulationSummary = (template: StrategyTemplate): { score: number; summary: string } => {
  const simulation = simulateStrategy(template, {
    run: {
      runId: `run-${template.templateId}` as StrategyRunId,
      templateId: template.templateId,
      draftId: `draft-${template.templateId}`,
      tenantId: 'tenant',
      startedAt: new Date().toISOString(),
      status: 'planned',
      targetIds: template.targets.map((target) => target.targetId),
      score: 0,
      riskPosture: 'low',
      plan: {
        strategyId: template.templateId,
        templateId: template.templateId,
        draftId: `draft-${template.templateId}`,
        runbookTokens: template.steps.map((step) => step.command.token),
        windows: [],
        dependencies: template.dependencies,
        executionPriority: template.steps.map((step) => step.stepId),
      },
    },
    stepWindowMinutes: 5,
    includeWaiting: false,
    riskSamples: [0.1, 0.2, 0.3],
    policy,
  });

  return {
    score: simulation.score,
    summary: `${simulation.summary.scenarioCount} windows | top=${simulation.summary.topRiskSteps.join(',')}`,
  };
};

export const makeRunFromDraft = (tenantId: string, draft: StrategyDraft): StrategyRun => ({
  runId: `run-${tenantId}-${draft.draftId}` as StrategyRunId,
  templateId: draft.template.templateId,
  draftId: draft.draftId,
  tenantId,
  startedAt: new Date().toISOString(),
  status: 'running',
  targetIds: draft.template.targets.map((target) => target.targetId),
  score: 0,
  riskPosture: draft.priority,
  plan: {
    strategyId: draft.template.templateId,
    templateId: draft.template.templateId,
    draftId: draft.draftId,
    runbookTokens: draft.template.steps.map((step) => step.command.token),
    windows: draft.stepsWindow,
    dependencies: draft.template.dependencies,
    executionPriority: draft.template.steps.map((step) => step.stepId),
  },
});

export const buildWorkspaceFromTemplate = async (
  store: StrategyStore,
  tenantId: string,
  template: StrategyTemplate,
): Promise<Result<{ plan: StrategyPlan; run: StrategyRun }, string>> => {
  const built = buildDraftFromTemplate(tenantId, template);
  const stored = await persistPlan(store, tenantId, built.draft, built.plan);
  if (!stored.ok) {
    return { ok: false, error: stored.error };
  }

  return ok({
    plan: built.plan,
    run: makeRunFromDraft(tenantId, built.draft),
  });
};
