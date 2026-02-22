import { Brand } from '@shared/core';
import {
  ControlPolicySettings,
  ControlRunPlan,
  ControlSignal,
  ControlStep,
  ControlTemplate,
  DependencyEdge,
  PlanEnvelope,
  WindowState,
  normalizeControlWindow,
  estimateRiskBand,
} from './types';

export interface PlannerInput {
  tenantId: string;
  requestId: string;
  template: ControlTemplate;
  steps: readonly ControlStep[];
  signals: readonly ControlSignal[];
  settings: ControlPolicySettings;
  spanStart: string;
  spanEnd: string;
}

export interface PreparedPlan {
  plan: PlanEnvelope<Record<string, unknown>, { preparedAt: string; selectedSteps: number; diagnostics: readonly string[] }>;
  diagnostics: readonly string[];
}

export const resolveEdges = (steps: readonly ControlStep[]): readonly DependencyEdge[] => {
  const edges: DependencyEdge[] = [];
  for (const step of steps) {
    for (const dependency of step.dependencies) {
      edges.push({
        from: step.key as any,
        to: dependency as any,
        criticality: Math.max(1, step.timeoutMs / 1000),
      });
    }
  }
  return edges;
};

const hasCycle = (steps: readonly ControlStep[]): boolean => {
  const seen = new Set<string>();
  const visiting = new Set<string>();
  const stepByKey = new Map<string, ControlStep>();

  for (const step of steps) {
    stepByKey.set(step.key as string, step);
  }

  const walk = (key: string): boolean => {
    if (visiting.has(key)) return true;
    if (seen.has(key)) return false;
    const step = stepByKey.get(key);
    if (!step) return false;
    visiting.add(key);
    for (const dependency of step.dependencies) {
      if (walk(dependency as string)) return true;
    }
    visiting.delete(key);
    seen.add(key);
    return false;
  };

  for (const key of stepByKey.keys()) {
    if (walk(key)) return true;
  }
  return false;
};

export const buildEnvelope = (input: PlannerInput): PreparedPlan => {
  const diagnostics: string[] = [];
  const validWindow = normalizeControlWindow({
    from: input.spanStart,
    to: input.spanEnd,
    owner: 'planner',
    region: 'global',
  });

  const edges = resolveEdges(input.steps);
  if (hasCycle(input.steps)) {
    diagnostics.push('dependency graph has cycle');
  }

  const riskBand = estimateRiskBand(input.signals, input.settings.maxRetries);
  if (riskBand === 'critical') {
    diagnostics.push('critical risk band; extra guardrails required');
  }

  const ranked = [...input.steps].sort((left, right) => right.timeoutMs - left.timeoutMs);
  const state: WindowState = input.settings.allowedModes.includes('active') ? 'active' : 'draft';

  const plan: PlanEnvelope<Record<string, unknown>, { preparedAt: string; selectedSteps: number; diagnostics: readonly string[] }> = {
    id: `${input.requestId}:run` as Brand<string, 'ControlRunId'>,
    policyId: input.template.id as any,
    tenantId: input.tenantId as Brand<string, 'TenantId'>,
    requestId: input.requestId as Brand<string, 'OperationsRequestId'>,
    state,
    effectiveWindow: validWindow,
    steps: ranked,
    edges,
    signals: input.signals,
    metadata: { templateId: input.template.id },
    overrides: {
      preparedAt: new Date().toISOString(),
      selectedSteps: ranked.length,
      diagnostics,
    },
  };

  return {
    plan,
    diagnostics,
  };
};

export const normalizePlanState = (state: WindowState): WindowState => state;
