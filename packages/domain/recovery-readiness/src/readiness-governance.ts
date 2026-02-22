import { withBrand } from '@shared/core';
import type {
  ReadinessDirective,
  ReadinessRunId,
  ReadinessSignal,
  ReadinessTarget,
  RecoveryReadinessPlan,
} from './types';
import type { ReadinessPolicy } from './policy';
import type { ReadinessSignalEnvelope } from './types';
import { foldSignals, type SignalSummary } from './signals';

export interface GovernanceSignal {
  readonly signalId: ReadinessSignal['signalId'];
  readonly source: ReadinessSignal['source'];
  readonly severity: ReadinessSignal['severity'];
  readonly ageMinutes: number;
}

export interface ReadinessPolicyDecision {
  readonly policyId: ReadinessPolicy['policyId'];
  readonly allow: boolean;
  readonly reasons: readonly string[];
  readonly score: number;
  readonly timestamp: string;
}

export interface ReadinessRunGovernanceProfile {
  readonly runId: ReadinessRunId;
  readonly policyId: ReadinessPolicy['policyId'];
  readonly directivesAtRisk: readonly ReadinessDirective['directiveId'][];
  readonly topSignals: readonly GovernanceSignal[];
  readonly summary: SignalSummary;
  readonly signalDensity: number;
  readonly healthScore: number;
  readonly decisions: readonly ReadinessPolicyDecision[];
}

export interface ReadinessGovernanceInputs {
  readonly runId: ReadinessRunId;
  readonly plan: RecoveryReadinessPlan;
  readonly signals: readonly ReadinessSignal[];
  readonly directives: readonly ReadinessDirective[];
  readonly policy: ReadinessPolicy;
}

export interface ReadinessPolicyInput {
  readonly runId: ReadinessRunId;
  readonly signals: readonly ReadinessSignal[];
  readonly directives: readonly ReadinessDirective[];
  readonly policy: ReadinessPolicy;
}

interface GovernanceBucket {
  source: ReadinessSignal['source'];
  count: number;
  latestSignalAt: string;
  uniqueTargets: Set<ReadinessTarget['id']>;
}

export function buildGovernanceProfile(input: ReadinessGovernanceInputs): ReadinessRunGovernanceProfile {
  const summary = foldSignals(input.signals);

  const ageMinutes = (capturedAt: string): number => {
    const parsed = Date.parse(capturedAt);
    if (!Number.isFinite(parsed)) {
      return Number.MAX_VALUE;
    }
    return Math.max(0, (Date.now() - parsed) / 60000);
  };

  const topSignals = input.signals
    .slice()
    .sort((left, right) => ageMinutes(left.capturedAt) - ageMinutes(right.capturedAt))
    .slice(0, 10)
    .map((signal) => ({
      signalId: signal.signalId,
      source: signal.source,
      severity: signal.severity,
      ageMinutes: ageMinutes(signal.capturedAt),
    }));

  const signalDensity = summary.weightedScore > 0 ? Number((input.signals.length / Math.max(1, summary.weightedScore)).toFixed(3)) : 0;
  const decisions = buildPolicyDecisions({
    policy: input.policy,
    signals: input.signals,
    directives: input.directives,
    runId: input.runId,
  });

  const directivesAtRisk = input.directives
    .filter((directive) => !directive.enabled || directive.retries > 4)
    .map((directive) => directive.directiveId);

  return {
    runId: input.runId,
    policyId: input.policy.policyId,
    directivesAtRisk,
    topSignals,
    summary,
    signalDensity,
    healthScore: calculateHealthScore(summary, input.signals, directivesAtRisk.length),
    decisions,
  };
}

export function buildPolicyDecisions(input: ReadinessPolicyInput): ReadinessPolicyDecision[] {
  const summary = foldSignals(input.signals);
  const decisions: ReadinessPolicyDecision[] = [];

  if (input.signals.length === 0) {
    decisions.push({
      policyId: input.policy.policyId,
      allow: false,
      reasons: ['no-signals'],
      score: 0,
      timestamp: new Date().toISOString(),
    });
  }

  if (!input.policy.constraints.forbidParallelity && summary.riskBand === 'red') {
    decisions.push({
      policyId: input.policy.policyId,
      allow: true,
      reasons: ['policy-allows-parallelity'],
      score: summary.weightedScore,
      timestamp: new Date().toISOString(),
    });
  } else if (summary.riskBand === 'red') {
    decisions.push({
      policyId: input.policy.policyId,
      allow: false,
      reasons: ['policy-forces-mitigation'],
      score: summary.weightedScore * 0.2,
      timestamp: new Date().toISOString(),
    });
  } else {
    decisions.push({
      policyId: input.policy.policyId,
      allow: true,
      reasons: ['risk-band-acceptable'],
      score: summary.weightedScore,
      timestamp: new Date().toISOString(),
    });
  }

  const signalBuckets = summarizeSignalSources(input.signals);
  for (const [source, bucket] of signalBuckets) {
    if (bucket.count > 5 && input.policy.blockedSignalSources.includes(source)) {
      decisions.push({
        policyId: input.policy.policyId,
        allow: false,
        reasons: [`blocked-source-${source}`],
        score: Math.max(0, 100 - bucket.count * 3),
        timestamp: new Date().toISOString(),
      });
    }
  }

  if (input.signals.length > 30) {
    decisions.push({
      policyId: input.policy.policyId,
      allow: false,
      reasons: ['signal-volume-overflow'],
      score: 20,
      timestamp: new Date().toISOString(),
    });
  }

  return decisions;
}

export function buildGovernanceSignalEnvelope(
  model: ReadinessGovernanceInputs,
): readonly ReadinessSignalEnvelope<Record<string, unknown>>[] {
  return model.signals.map((signal, index) => {
    return {
      signal,
      envelope: {
        signalId: signal.signalId,
        runId: signal.runId,
        source: signal.source,
        weight: signal.signalId.length + signal.targetId.length,
        policy: model.policy.policyId,
      },
      weight: signal.signalId.length + model.policy.constraints.key.length,
    };
  });
}

export function readModelGovernanceState(input: ReadonlyArray<ReadinessGovernanceInputs>): readonly ReadinessRunGovernanceProfile[] {
  return input.map((model) => buildGovernanceProfile(model));
}

export function topGovernanceSignals(
  models: readonly ReadinessGovernanceInputs[],
  limit = 10,
): readonly GovernanceSignal[] {
  const allSignals = models.flatMap((model) => buildGovernanceSignalEnvelope(model));
  const top = allSignals
    .sort((left, right) => right.weight - left.weight)
    .slice(0, limit)
    .map((enveloped) => {
      const raw = enveloped.signal;
      return {
        signalId: raw.signalId,
        source: raw.source,
        severity: raw.severity,
        ageMinutes: Number((Date.now() - Date.parse(raw.capturedAt)) / 60000),
      };
    });
  return top;
}

export function summarizeGovernanceByRun(
  models: readonly ReadinessRunGovernanceProfile[],
): Map<ReadinessRunId, { riskScore: number; allowed: number; denied: number; directiveRisk: number }> {
  const summary = new Map<
    ReadinessRunId,
    { riskScore: number; allowed: number; denied: number; directiveRisk: number }
  >();

  for (const model of models) {
    const allowed = model.decisions.filter((entry) => entry.allow).length;
    const denied = model.decisions.length - allowed;
    summary.set(model.runId, {
      riskScore: model.healthScore,
      allowed,
      denied,
      directiveRisk: model.directivesAtRisk.length,
    });
  }

  return summary;
}

export function computeRegionHealthSignal(plan: RecoveryReadinessPlan): ReadonlyMap<string, number> {
  const healthByRegion = new Map<string, number>();
  for (const target of plan.targets) {
    const current = healthByRegion.get(target.region) ?? 100;
    const criticalityScore = targetCriticalityScore(target);
    healthByRegion.set(target.region, Math.max(0, current - criticalityScore / 10));
  }
  return healthByRegion;
}

function summarizeSignalSources(signals: readonly ReadinessSignal[]): ReadonlyMap<ReadinessSignal['source'], GovernanceBucket> {
  const buckets = new Map<ReadinessSignal['source'], GovernanceBucket>();
  for (const signal of signals) {
    const existing = buckets.get(signal.source) ?? {
      source: signal.source,
      count: 0,
      latestSignalAt: signal.capturedAt,
      uniqueTargets: new Set<ReadinessTarget['id']>(),
    };
    buckets.set(signal.source, {
      source: signal.source,
      count: existing.count + 1,
      latestSignalAt: signal.capturedAt > existing.latestSignalAt ? signal.capturedAt : existing.latestSignalAt,
      uniqueTargets: existing.uniqueTargets,
    });
    existing.uniqueTargets.add(signal.targetId);
  }
  return buckets;
}

function calculateHealthScore(summary: SignalSummary, signals: readonly ReadinessSignal[], directivesAtRisk: number): number {
  const riskComponent = summary.weightedScore ?? 0;
  const signalComponent = signals.reduce((acc, signal) => acc + signal.signalId.length, 0);
  const directivePenalty = directivesAtRisk * 5;
  return Number((Math.max(0, riskComponent - signalComponent * 0.01 - directivePenalty)).toFixed(2));
}

function targetCriticalityScore(target: ReadinessTarget): number {
  switch (target.criticality) {
    case 'critical':
      return 100;
    case 'high':
      return 75;
    case 'medium':
      return 50;
    case 'low':
      return 20;
    default:
      return 0;
  }
}

export function normalizeGovernorKey(input: string): ReadinessRunId {
  return withBrand(`governor:${input}`, 'ReadinessRunId');
}
