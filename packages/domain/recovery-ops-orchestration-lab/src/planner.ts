import { scorePlan } from './policy';
import { buildFabricWorkspace, pickFirstPlan } from './fabric';
import type {
  LabPlan,
  LabPlanDraft,
  OrchestrationLab,
  OrchestrationPolicy,
  PlanScore,
  OrchestrationLabEnvelope,
} from './types';

interface BrandedPlanId {
  readonly __brand: 'LabPlanId';
}
const toPlanId = (value: string): string & BrandedPlanId => value as string & BrandedPlanId;
const toEnvelopeId = (value: string): string & { readonly __brand: 'SurfaceEnvelopeId' } => value as string & { readonly __brand: 'SurfaceEnvelopeId' };
const toPlan = (value: string): LabPlan['id'] => value as LabPlan['id'];

export interface PlannerInput {
  readonly lab: OrchestrationLab;
  readonly policy: OrchestrationPolicy;
}

export interface PlannerOutput {
  readonly envelope: OrchestrationLabEnvelope;
  readonly selectedPlan?: LabPlan;
  readonly scores: readonly PlanScore[];
}

export const generatePlansFromDrafts = (drafts: readonly LabPlanDraft[]): readonly LabPlan[] =>
  [...drafts].map((draft, index) => ({
    id: toPlan(draft.id),
    labId: draft.labId,
    title: draft.title,
    description: draft.description,
    steps: draft.steps,
    state: index === 0 ? 'armed' : draft.state,
    score: draft.score,
    confidence: draft.confidence,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

const normalizeDraftSource = (lab: OrchestrationLab): readonly LabPlanDraft[] =>
  lab.plans.map((plan, index) => ({
    id: `${plan.id}`,
    labId: lab.id,
    draftName: `${plan.title}-draft-${index + 1}`,
    title: plan.title,
    description: plan.description,
    steps: [...plan.steps],
    state: plan.state,
    score: plan.score,
    confidence: plan.confidence,
  }));

export const enrichPlans = (plans: readonly LabPlan[], policy: OrchestrationPolicy): readonly { readonly plan: LabPlan; readonly score: PlanScore; readonly allowed: boolean }[] =>
  plans.map((plan) => {
    const score = scorePlan(plan, policy);
    return {
      plan,
      score,
      allowed: score.readiness > 0,
    };
  });

export const buildLabWorkspace = ({ lab, policy }: PlannerInput): PlannerOutput => {
  const normalized = normalizeDraftSource(lab);
  const plans = generatePlansFromDrafts(normalized);
  const workbench = buildFabricWorkspace([{ ...lab, plans }]);
  const rebuilt = workbench[0] ?? lab;

  const scores = enrichPlans(rebuilt.plans, policy);
  const byReadiness = [...scores].sort((left, right) => right.score.readiness - left.score.readiness);
  const best = pickFirstPlan({
    id: toEnvelopeId(`${lab.id}:envelope`),
    state: rebuilt.plans.length > 0 ? rebuilt.plans[0]?.state : 'draft',
    lab: rebuilt,
    intent: {
      tenantId: rebuilt.tenantId,
      siteId: 'site-main',
      urgency: rebuilt.signals.some((signal) => signal.tier === 'critical') ? 'critical' : 'normal',
      rationale: 'auto-built',
      owner: rebuilt.tenantId,
      requestedAt: new Date().toISOString(),
      tags: ['auto', 'planner'],
    },
    plans: rebuilt.plans,
    windows: rebuilt.windows,
    metadata: { source: 'planner', reason: 'workspace-build' },
    revision: rebuilt.signals.length,
  });

  return {
    envelope: {
      id: toEnvelopeId(`${lab.id}:envelope:${Date.now()}`),
      state: best?.state ?? 'draft',
      lab: rebuilt,
      intent: {
        tenantId: rebuilt.tenantId,
        siteId: 'site-main',
        urgency: rebuilt.signals.some((signal) => signal.tier === 'critical') ? 'critical' : 'normal',
        rationale: 'planner-output',
        owner: rebuilt.tenantId,
        requestedAt: new Date().toISOString(),
        tags: ['planner', 'auto'],
      },
      plans: rebuilt.plans,
      windows: rebuilt.windows,
      metadata: {
        builtAt: new Date().toISOString(),
        policyRevision: policy.id,
      },
      revision: rebuilt.plans.length,
    },
    selectedPlan: pickFirstPlan({
      id: toEnvelopeId(`${lab.id}:envelope`),
      state: best?.state ?? 'draft',
      lab: rebuilt,
      intent: {
        tenantId: rebuilt.tenantId,
        siteId: 'site-main',
        urgency: 'normal',
        rationale: 'selected',
        owner: rebuilt.tenantId,
        requestedAt: new Date().toISOString(),
        tags: ['selected'],
      },
      plans: rebuilt.plans,
      windows: rebuilt.windows,
      metadata: {},
      revision: rebuilt.plans.length,
    }) ?? rebuilt.plans[0],
    scores: byReadiness.map((entry) => entry.score),
  };
};
