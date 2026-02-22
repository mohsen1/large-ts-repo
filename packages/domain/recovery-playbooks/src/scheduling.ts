import type { RecoveryPlaybook, RecoveryPlaybookContext, PlaybookPolicyInput } from './models';

export interface WindowEvaluation {
  score: number;
  reasons: readonly string[];
  allow: boolean;
}

export interface ContextEvaluator {
  readonly tenantRisk: number;
  readonly tenantTier: 'standard' | 'premium' | 'critical';
  readonly serviceCriticality: number;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const isBetween = (target: number, min: number, max: number): boolean => target >= min && target <= max;

const parseWindowCoverage = (playbook: RecoveryPlaybook, context: RecoveryPlaybookContext): number => {
  const channelMatchCount = playbook.windows.length === 0
    ? 1
    : playbook.windows.filter((window) => {
      if (window.channel === 'global') return true;
      return context.affectedRegions.some((region) => region.toLowerCase().includes(window.channel.toLowerCase()))
        || context.incidentType.toLowerCase().includes(window.channel.toLowerCase());
    }).length;
  return clamp(channelMatchCount / Math.max(playbook.windows.length, 1), 0, 1);
};

const scoreByScope = (steps: RecoveryPlaybook['steps'], context: RecoveryPlaybookContext): number => {
  let regionHits = 0;
  let serviceHits = 0;
  let tenantHits = 0;
  let globalHits = 0;

  for (const step of steps) {
    switch (step.scope) {
      case 'region':
        regionHits += 1;
        break;
      case 'service':
        serviceHits += 1;
        break;
      case 'tenant':
        tenantHits += 1;
        break;
      case 'global':
      default:
        globalHits += 1;
        break;
    }
  }

  const total = Math.max(steps.length, 1);
  const ratio = (context.affectedRegions.length > 0 ? serviceHits / total : tenantHits / total) * 0.4;
  return clamp(ratio + (globalHits / total) * 0.1 + (regionHits / total) * 0.2 + (tenantHits / total) * 0.2, 0, 1);
};

const evaluateSignals = (signals: readonly PlaybookPolicyInput['signals']): number => {
  if (signals.length === 0) return 0.5;
  const weighted = signals.reduce((acc, signal) => {
    const normalized = typeof signal.value === 'number'
      ? clamp(signal.value / 100, 0, 1)
      : signal.value ? 0.8 : 0.2;
    return acc + normalized * signal.weight;
  }, 0);
  return clamp(weighted / Math.max(signals.length, 1), 0, 1);
};

const riskPenalty = (riskScore: number): number => {
  if (riskScore >= 0.8) return 0.2;
  if (riskScore >= 0.5) return 0.5;
  return 1;
};

const slaPenalty = (acceptedMinutes: number, objectiveMinutes: number): number => {
  if (isBetween(acceptedMinutes, 0, objectiveMinutes)) return 1;
  if (acceptedMinutes <= objectiveMinutes * 1.2) return 0.7;
  return 0.35;
};

export const evaluatePlaybookContext = (
  playbook: RecoveryPlaybook,
  context: RecoveryPlaybookContext,
  evaluator: ContextEvaluator,
): WindowEvaluation => {
  const reasons: string[] = [];
  const windowCoverage = parseWindowCoverage(playbook, context);
  const scopeScore = scoreByScope(playbook.steps, context);
  const signalScore = evaluateSignals(context as PlaybookPolicyInput['signals']);
  const slaScore = slaPenalty(playbook.objective.acceptedSlaMinutes, context ? 120 : 60);
  const riskBoost = riskPenalty(evaluator.tenantRisk);
  const tierBoost = evaluator.tenantTier === 'critical' ? 1.2 : evaluator.tenantTier === 'premium' ? 1.1 : 1;

  if (windowCoverage >= 0.7) reasons.push('strong channel coverage');
  if (scopeScore >= 0.6) reasons.push('scope fits incident footprint');
  if (signalScore >= 0.5) reasons.push('signals align with policy');
  if (evaluator.serviceCriticality > 8) reasons.push('high criticality services covered');

  const rawScore = (windowCoverage * 0.45 + scopeScore * 0.25 + signalScore * 0.2 + slaScore * 0.1) * riskBoost * tierBoost;
  const bounded = clamp(rawScore, 0, 1);
  return {
    score: bounded,
    reasons,
    allow: bounded >= 0.35,
  };
};
