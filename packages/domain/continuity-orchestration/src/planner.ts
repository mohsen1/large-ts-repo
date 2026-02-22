import { Brand, Edge, NodeId } from '@shared/core';
import {
  ContinuityPhase,
  ContinuityPlanTemplate,
  ContinuityRuntimePlan,
  ContinuityRuntimeStep,
  ContinuityRunState,
  ContinuityStepId,
  DependencyMap,
  NonEmptyArray,
  isAllowedStepSequence,
  phaseCompare,
} from './types';

export interface PlanDraftOptions {
  runId: Brand<string, 'ContinuityRunId'>;
  now: string;
  tenantTimeZone?: string;
}

export interface PlanDraft<C extends Record<string, unknown> = Record<string, unknown>> {
  runId: Brand<string, 'ContinuityRunId'>;
  templateId: ContinuityPlanTemplate<C>['id'];
  tenantId: ContinuityPlanTemplate<C>['tenantId'];
  createdAt: string;
  updatedAt: string;
  correlationId: ContinuityPlanTemplate<C>['context']['correlationId'];
  state: ContinuityRunState;
  steps: readonly ContinuityRuntimeStep<C>[];
  metadata: {
    totalEstimatedMinutes: number;
    phaseFlow: NonEmptyArray<ContinuityPhase>;
    dependencyCount: number;
    tenantZone: string;
  };
}

export interface PlanValidationError {
  code:
    | 'missing-step'
    | 'cyclic-dependency'
    | 'unknown-dependency'
    | 'phase-order'
    | 'no-steps';
  message: string;
  stepId?: string;
}

export interface PlanValidationResult {
  ok: boolean;
  errors: readonly PlanValidationError[];
}

export const buildDependencyGraph = <C extends Record<string, unknown> = Record<string, unknown>>(template: ContinuityPlanTemplate<C>): DependencyMap<string> => {
  const dependencyMap = {} as Record<string, string[]>;
  for (const step of template.steps) {
    dependencyMap[step.id] = [...step.dependsOn];
  }
  return dependencyMap;
};

const toPhaseOrder = <C extends Record<string, unknown> = Record<string, unknown>>(template: ContinuityPlanTemplate<C>): ContinuityPhase[] =>
  template.steps
    .map((step) => step.phase)
    .sort(phaseCompare)
    .filter((phase, index, all) => index === all.indexOf(phase));

const estimateMinutesByPhase = <C extends Record<string, unknown> = Record<string, unknown>>(
  template: ContinuityPlanTemplate<C>,
): Record<string, number> =>
  template.steps.reduce((acc, step) => {
    const baseline = Math.max(1, Math.ceil(step.action.timeoutSeconds / 60));
    acc[step.phase] = (acc[step.phase] ?? 0) + baseline;
    return acc;
  }, {} as Record<string, number>);

const topologicalSort = (dependencies: DependencyMap<string>): string[] => {
  const inDegree = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  const nodes = Object.keys(dependencies);

  for (const node of nodes) {
    inDegree.set(node, 0);
    outgoing.set(node, []);
  }

  for (const [node, deps] of Object.entries(dependencies)) {
    for (const dep of deps) {
      inDegree.set(node, (inDegree.get(node) ?? 0) + 1);
      const bucket = outgoing.get(dep) ?? [];
      bucket.push(node);
      outgoing.set(dep, bucket);
    }
  }

  const queue = nodes.filter((node) => (inDegree.get(node) ?? 0) === 0);
  const ordered: string[] = [];

  for (let i = 0; i < queue.length; i += 1) {
    const current = queue[i]!;
    ordered.push(current);

    for (const next of outgoing.get(current) ?? []) {
    const remaining = (inDegree.get(next) ?? 0) - 1;
    inDegree.set(next, remaining);
    if (remaining === 0) queue.push(next);
    }
  }

  return ordered;
};

export const validatePlanTemplate = <C extends Record<string, unknown> = Record<string, unknown>>(
  template: ContinuityPlanTemplate<C>,
): PlanValidationResult => {
  if (!template.steps.length) return { ok: false, errors: [{ code: 'no-steps', message: 'Plan must include at least one step' }] };

  const phaseFlow = toPhaseOrder(template);
  if (phaseFlow.length > 1 && !isAllowedStepSequence(phaseFlow)) {
    return { ok: false, errors: [{ code: 'phase-order', message: 'Phase progression is not monotonic' }] };
  }

  const ids = new Set(template.steps.map((step) => step.id));
  const dependencies = buildDependencyGraph(template);
  const sorted = topologicalSort(dependencies);

  if (sorted.length !== template.steps.length) {
    return { ok: false, errors: [{ code: 'cyclic-dependency', message: 'Plan has dependency cycle or unresolved dependency' }] };
  }

  const unknownDependency = template.steps.find((step) => step.dependsOn.some((dependency) => !ids.has(dependency)));
  if (unknownDependency) {
    return {
      ok: false,
      errors: [
        {
          code: 'unknown-dependency',
          message: 'Unknown dependency referenced by step',
          stepId: unknownDependency.id,
        },
      ],
    };
  }

  return { ok: true, errors: [] };
};

export const buildPlanDraft = <C extends Record<string, unknown>>(
  template: ContinuityPlanTemplate<C>,
  options: PlanDraftOptions,
): PlanDraft<C> | null => {
  const result = validatePlanTemplate(template);
  if (!result.ok) return null;

  const deps = buildDependencyGraph(template);
  const ordered = topologicalSort(deps);
  const estimates = estimateMinutesByPhase(template);
  const totalMinutes = Object.values(estimates).reduce((sum, minutes) => sum + minutes, 0);
  const now = options.now || new Date().toISOString();
  const indexById = new Map(template.steps.map((step) => [step.id, step] as const));
  const runtimeSteps: ContinuityRuntimeStep<C>[] = ordered.map((stepId, order) => {
    const step = indexById.get(stepId as ContinuityStepId);
    if (!step) throw new Error(`Missing step ${stepId}`);
    return {
      id: step.id,
      phase: step.phase,
      action: { ...step.action },
      retryCount: 0,
      order,
      serviceIds: [...step.serviceIds],
      estimatedMinutes: step.action.timeoutSeconds > 0 ? Math.max(1, Math.ceil(step.action.timeoutSeconds / 60)) : 1,
      dependencies: [...step.dependsOn],
    };
  });

  const flow = toPhaseOrder(template);
  const phaseFlow: NonEmptyArray<ContinuityPhase> = flow.length
    ? [flow[0], ...flow.slice(1)]
    : ['assess'];

  return {
    runId: options.runId,
    templateId: template.id,
    tenantId: template.tenantId,
    createdAt: now,
    updatedAt: now,
    correlationId: template.context.correlationId,
    state: 'pending',
    steps: runtimeSteps,
    metadata: {
      totalEstimatedMinutes: totalMinutes,
      phaseFlow,
      dependencyCount: Object.values(deps).reduce((sum, list) => sum + list.length, 0),
      tenantZone: options.tenantTimeZone ?? 'UTC',
    },
  };
};

export const phaseBuckets = (plan: Pick<ContinuityRuntimePlan, 'steps'>): Record<ContinuityPhase, string[]> => {
  const buckets: Record<ContinuityPhase, string[]> = {
    assess: [],
    lockdown: [],
    drain: [],
    migrate: [],
    restore: [],
    verify: [],
    close: [],
  };

  for (const step of plan.steps) {
    buckets[step.phase].push(step.id);
  }

  return buckets;
};

export const dependencyPaths = (dependencies: DependencyMap<string>): Edge<NodeId, number>[] => {
  const edges: Edge<NodeId, number>[] = [];
  for (const [node, parents] of Object.entries(dependencies)) {
    for (const parent of parents) {
      edges.push({ from: parent as unknown as NodeId, to: node as unknown as NodeId, weight: 1 });
    }
  }
  return edges;
};
