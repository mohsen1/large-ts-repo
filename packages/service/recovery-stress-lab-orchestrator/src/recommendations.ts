import {
  CommandRunbook,
  RecoverySignal,
  OrchestrationPlan,
  RecoverySimulationResult,
  SeverityBand,
  TenantId,
  simulateThroughput,
  summarizeSignals,
} from '@domain/recovery-stress-lab';

export interface Recommendation {
  readonly code: string;
  readonly title: string;
  readonly details: string;
  readonly impact: 'high' | 'medium' | 'low';
}

export interface RecommendationInput {
  readonly tenantId: TenantId;
  readonly band: SeverityBand;
  readonly signals: readonly RecoverySignal[];
  readonly runbooks: readonly CommandRunbook[];
  readonly plan: OrchestrationPlan | null;
  readonly simulation: RecoverySimulationResult | null;
}

export interface RecommendationBundle {
  readonly tenantId: TenantId;
  readonly topPriority: ReadonlyArray<Recommendation>;
  readonly optional: ReadonlyArray<Recommendation>;
  readonly rationale: ReadonlyArray<string>;
}

const pickImpact = (value: number): 'high' | 'medium' | 'low' => {
  if (value >= 0.66) return 'high';
  if (value >= 0.33) return 'medium';
  return 'low';
};

const summarize = (value: number): string => {
  if (value >= 0.75) return 'near optimal';
  if (value >= 0.5) return 'improving';
  if (value >= 0.25) return 'degraded';
  return 'critical';
};

export const buildRecommendations = (input: RecommendationInput): RecommendationBundle => {
  const signalDigest = summarizeSignals(input.tenantId, input.signals);
  const throughput = simulateThroughput(input.simulation?.ticks.at(-1)?.activeWorkloads ?? 0, input.runbooks.length);
  const signalUrgency = signalDigest.totalSignals > 0 ? signalDigest.criticalSignals / signalDigest.totalSignals : 0;
  const planExists = Boolean(input.plan);
  const planCoverage = input.plan ? input.plan.schedule.length / 10 : 0;
  const rationale: string[] = [];

  const topPriority: Recommendation[] = [];
  const optional: Recommendation[] = [];

  if (signalUrgency > 0.5 || input.band === 'critical') {
    topPriority.push({
      code: 'critical-signal-first',
      title: 'Prioritize critical-path runbooks',
      details: 'Enable high-priority runbooks first to reduce risk propagation',
      impact: 'high',
    });
    rationale.push('Critical signal dominance detected');
  }

  if (signalDigest.totalSignals === 0) {
    optional.push({
      code: 'seed-signal-set',
      title: 'Seed simulation with synthetic baseline',
      details: 'Inject synthetic signal set when no live observations exist',
      impact: 'medium',
    });
  }

  if (!planExists) {
    topPriority.push({
      code: 'build-plan-now',
      title: 'Build explicit orchestration plan',
      details: 'Create deterministic readiness windows before simulation',
      impact: 'high',
    });
    rationale.push('Plan missing for selected signals');
  } else {
    if (planCoverage < 0.2) {
      optional.push({
        code: 'expand-coverage',
        title: 'Increase window coverage',
        details: 'Add alternate windows to reduce scheduling collisions',
        impact: 'medium',
      });
    }
  }

  const runbookCountBand = input.runbooks.length;
  if (runbookCountBand < 2) {
    topPriority.push({
      code: 'insufficient-runbooks',
      title: 'Add recovery runbooks',
      details: 'At least 2 runbooks recommended for coordinated fallback',
      impact: 'high',
    });
  } else if (runbookCountBand > 4 && input.band === 'low') {
    optional.push({
      code: 'band-bandwidth',
      title: 'Reduce parallel plan surface',
      details: 'Low band can run with fewer concurrent paths',
      impact: 'low',
    });
  }

  const throughputImpact = simulateThroughput(throughput, input.runbooks.length);
  if (throughputImpact > 0) {
    optional.push({
      code: 'throughput-tuning',
      title: 'Tune throughput controls',
      details: `Current throughput estimate ${throughputImpact}`,
      impact: pickImpact(throughputImpact / 1000),
    });
  }

  if (input.simulation) {
    if (input.simulation.riskScore > 0.5) {
      topPriority.push({
        code: 'risk-mitigation',
        title: 'Risk mitigation cycle',
        details: `Risk score ${input.simulation.riskScore.toFixed(2)} exceeds target`,
        impact: 'high',
      });
    }
    if (input.simulation.slaCompliance < 0.75) {
      optional.push({
        code: 'sla-adjust',
        title: 'Improve SLA posture',
        details: `Current SLA ${input.simulation.slaCompliance.toFixed(2)} is low`,
        impact: 'medium',
      });
    }
  }

  const bandSignal = signalDigest.totalSignals > 0 ? input.band : 'low';
  const signalHealth = signalUrgency * (signalUrgency === 0 ? 0 : 1);
  const performanceReadiness = 0.5 * (runbookCountBand === 0 ? 0 : Math.min(1, throughput / 1000));

  const top = [...topPriority].sort((left, right) => {
    const leftImpact = left.impact === 'high' ? 3 : left.impact === 'medium' ? 2 : 1;
    const rightImpact = right.impact === 'high' ? 3 : right.impact === 'medium' ? 2 : 1;
    return rightImpact - leftImpact;
  });

  const optionalRanked = [...optional].sort((left, right) => left.code.localeCompare(right.code));
  rationale.push(`Signal band ${bandSignal} with readiness ${summarize(Math.max(0, signalHealth + performanceReadiness))}`);
  rationale.push(`Signals=${signalDigest.totalSignals}, critical=${signalDigest.criticalSignals}`);

  return {
    tenantId: input.tenantId,
    topPriority: top,
    optional: optionalRanked,
    rationale,
  };
};
