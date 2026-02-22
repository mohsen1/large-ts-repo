import { clampLimit, parseCursor, QueryRequest, QueryResult, buildCursor } from '@data/query-models';
import { ok, Result } from '@shared/result';
import {
  PlanDecision,
  PlanDraft,
  OperationConstraint,
  PlanEnvelope,
  OperationPlan,
  OperationSignal,
  OperationStep,
  OperationWindow,
  PlanTemplate,
  StepSelector,
} from './types';
import { isWindowOverlapping, mergeDependencies, mergeSignals, normalizeConstraint, normalizeWindow } from './types';
import { asDeploymentId, asEnvironmentId, asOperationId, asRunbookId } from './types';
import { PolicyBundle, selectSignalsForWindow, evaluatePolicy } from './policies';
import { estimatePlanMinutes } from './types';

export type BuildPlanInput = Pick<
  PlanDraft,
  'window' | 'baseSteps' | 'dependencies' | 'constraints' | 'severity'
> & {
  deploymentId: string;
  runbookId: string;
  tenantId: string;
};

export interface PlanningContext {
  tenantId: string;
  requestedBy: string;
}

export interface PlanningResult {
  plan: PlanEnvelope<unknown>;
  decision: PlanDecision;
  template: PlanTemplate;
  query: QueryResult<OperationPlan>;
}

export const normalizeWindowRange = (raw: Pick<OperationWindow, 'startsAt' | 'endsAt'> & Partial<OperationWindow>): OperationWindow =>
  normalizeWindow({
    startsAt: raw.startsAt,
    endsAt: raw.endsAt,
    kind: raw.kind ?? 'maintenance',
  });

export const buildDraft = (input: BuildPlanInput): PlanDraft => ({
  requestedAt: new Date().toISOString(),
  environmentId: asEnvironmentId(input.tenantId),
  deploymentId: asDeploymentId(input.deploymentId),
  runbookId: asRunbookId(input.runbookId),
  window: normalizeWindowRange(input),
  baseSteps: input.baseSteps,
  dependencies: input.dependencies,
  constraints: normalizeConstraint(input.constraints),
  severity: input.severity,
});

export const evaluateDraft = (planDraft: PlanDraft, template: PlanTemplate) => {
  const policy = evaluatePolicy(planDraft, template);
  return policy;
};

export const shapePlan = (
  requestId: string,
  draft: PlanDraft,
  signals: readonly OperationSignal[],
  templates: readonly PlanTemplate[],
): Result<PlanningResult, string> => {
  const template = templates[0];
  if (!template) return { ok: false, error: 'No templates supplied' };

  const selectedTemplate = template as PlanTemplate;
  const requestedWindow = normalizeWindowRange(draft.window);
  const policy = evaluateDraft(draft, selectedTemplate);
  const mergedSignals = mergeSignals(signals, selectSignalsForWindow(signals, draft.severity));
  const stepSelector = selectedTemplate.stepSelector as StepSelector<OperationStep>;
  const steps = draft.baseSteps.filter((step, index) => stepSelector(step, index));
  const dependencies = mergeDependencies(draft.dependencies, []);

  const overlap = isWindowOverlapping(requestedWindow, selectedTemplate.defaultWindow);
  const reasons: string[] = [];
  if (overlap) reasons.push('window overlaps baseline policy');
  if (!policy.allowed) reasons.push(...policy.reasons);

  const id = asOperationId(`plan-${requestId}-${Date.now()}`);
  const cursor = buildCursor(clampLimit(dependencies.length), 10);
  const queryWindow = parseCursor(cursor);

  const queryRequest: QueryRequest<{ tenant: string }> = {
    filter: { tenant: requestId },
    cursor: queryWindow.index.toString(),
    limit: clampLimit(dependencies.length),
    sortBy: 'tenant',
    direction: 'desc',
  };

  const plan: OperationPlan = {
    id,
    environmentId: draft.environmentId,
    deploymentId: draft.deploymentId,
    runbookId: draft.runbookId,
    requestedAt: draft.requestedAt,
    window: requestedWindow,
    steps,
    constraints: normalizeConstraint(draft.constraints as Partial<OperationConstraint>),
    riskSignals: mergedSignals,
    severity: draft.severity,
    labels: ['service-planned'],
  };

  const decision: PlanDecision = {
    planId: id,
    allowed: policy.allowed && reasons.length === 0,
    reasons,
    selectedAt: new Date().toISOString(),
    payload: {
      tenantId: draft.environmentId,
      templateId: selectedTemplate.id,
    } as any,
  };

  const query: QueryResult<OperationPlan> = {
    cursor: queryRequest.cursor ? queryWindow.pageSize.toString() : undefined,
    items: [plan],
    hasMore: false,
  };

  return ok({
    plan: {
      ...plan,
      metadata: {
        source: 'planner',
        version: 1,
        dependencies,
      },
    },
    decision,
    template: selectedTemplate,
    query,
  });
};

export const estimatePlanDuration = (plan: Pick<OperationPlan, 'steps'>): number => estimatePlanMinutes(plan.steps);

export const compilePolicyBundle = (tenantId: string, templates: readonly PlanTemplate[]): PolicyBundle => ({
  name: `${tenantId}-bundle`,
  owner: 'ops-runtime',
  constraints: templates.map((template) => normalizeConstraint(template.constraintOverrides)),
  labels: templates.map((template) => template.id),
});

export const prioritizeByScore = (plans: readonly { id: string; score: number }[]): readonly string[] =>
  [...plans].sort((left, right) => right.score - left.score).map((plan) => plan.id);
