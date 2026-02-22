import { AdaptiveAction, AdaptivePolicy, AdaptiveDecision, SignalSample, SignalContext } from './types';
import { evaluatePolicies } from './policy';

export interface AdaptationInput {
  tenantId: string;
  signals: readonly SignalSample[];
  policies: readonly AdaptivePolicy[];
  context: SignalContext;
}

export interface AdaptationPlan {
  tenantId: string;
  actions: readonly AdaptiveAction[];
  decisions: readonly AdaptiveDecision[];
  topAction: AdaptiveAction | null;
  recommendedWindowSeconds: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

export const createAdaptationPlan = ({ tenantId, signals, policies, context }: AdaptationInput): AdaptationPlan => {
  const decisions = evaluatePolicies(policies, signals, context);
  const actions = decisions.flatMap((decision) => decision.selectedActions);
  const scores = decisions.map((decision) => decision.confidence);
  const topRisk = Math.max(...scores, 0);
  const topAction = actions[0] ?? null;

  if (actions.length === 0) {
    return {
      tenantId,
      actions: [],
      decisions,
      topAction,
      recommendedWindowSeconds: 0,
    };
  }

  const recommendedWindowSeconds = Math.round(60 * 10 * clamp(topRisk, 0.1, 4));

  return {
    tenantId,
    actions,
    decisions,
    topAction,
    recommendedWindowSeconds,
  };
};

export const pickTopByConfidence = (decisions: readonly AdaptiveDecision[]): AdaptiveDecision | null => {
  return decisions.reduce<AdaptiveDecision | null>((selected, current) => {
    if (!selected) return current;
    return current.confidence > selected.confidence ? current : selected;
  }, null);
};

export const mergeActions = (...actionGroups: readonly (AdaptiveAction[])[]): readonly AdaptiveAction[] => {
  const merged = new Map<string, AdaptiveAction>();
  for (const action of actionGroups.flat()) {
    const key = `${action.type}:${action.targets[0]}`;
    const existing = merged.get(key);
    merged.set(key, existing
      ? {
          ...existing,
          intensity: Math.max(existing.intensity, action.intensity),
          justification: `${existing.justification}; ${action.justification}`,
        }
      : action);
  }
  return [...merged.values()];
};
