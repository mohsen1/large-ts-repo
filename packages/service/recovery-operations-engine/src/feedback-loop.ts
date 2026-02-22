import type { Brand } from '@shared/core';
import type {
  OrchestrationPlan,
  OrchestrationSnapshot,
  OrchestrationSignalDigest,
} from '@domain/recovery-operations-models/simulation-orchestration';
import type { SessionDecision } from '@domain/recovery-operations-models';
import { estimateSlaBreachMinutes, buildSlaProfile, compareSlaProfiles, type SlaProfile } from '@domain/recovery-operations-models/sla-profile';
import {
  summarizeRhythmProfile,
  detectAnomalies,
  type RhythmProfile,
  type RhythmSummary,
} from '@domain/recovery-operations-models/incident-rhythm';
import type { RecoverySignal } from '@domain/recovery-operations-models';
import type { StoreTelemetryIndex } from '@data/recovery-operations-store/telemetry-index';
import type { IncidentFingerprint } from '@domain/recovery-operations-models';
import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';

export interface FeedbackInput {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly plans: readonly OrchestrationPlan[];
  readonly snapshots: readonly OrchestrationSnapshot[];
  readonly signals: readonly RecoverySignal[];
  readonly telemetry: StoreTelemetryIndex;
}

export interface FeedbackWindow {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly adjustments: readonly FeedbackAdjustment[];
  readonly summaries: readonly RhythmSummary[];
  readonly nextPlan?: OrchestrationPlan;
}

export interface FeedbackAdjustment {
  readonly planId: string;
  readonly kind: 'throttle' | 'retry' | 'pause' | 'boost';
  readonly detail: string;
  readonly score: number;
}

export interface LoopState {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly signalDigest: OrchestrationSignalDigest;
  readonly slaRisk: boolean;
  readonly anomalyCount: number;
}

const summarizeSignalDigest = (signals: readonly RecoverySignal[]): OrchestrationSignalDigest => {
  const high = signals.filter((signal) => signal.severity >= 7);
  const top = signals.slice(0, 5);

  if (high.length > 2) {
    return {
      category: 'high',
      score: Math.min(1, high.length / (signals.length || 1)),
      topSignals: top,
    };
  }

  if (signals.length > 0) {
    return {
      category: 'normal',
      score: signals.reduce((acc, signal) => acc + signal.severity, 0) / (signals.length * 10),
      topSignals: top,
    };
  }

  return {
    category: 'low',
    score: 0,
    topSignals: [],
  };
};

const toScore = (count: number, max: number): number => {
  if (max === 0) return 0;
  return Math.max(0, Math.min(1, count / max));
};

export const evaluateFeedbackLoop = (input: FeedbackInput, repository: RecoveryOperationsRepository): FeedbackWindow => {
  const rhythmProfile: RhythmProfile = buildRhythmSummary(input.tenant, input.signals);
  const rhythmSummary = summarizeRhythmProfile(rhythmProfile);
  const anomalies = detectAnomalies(rhythmProfile);

  const loop: LoopState = {
    tenant: input.tenant,
    signalDigest: summarizeSignalDigest(input.signals),
    slaRisk: false,
    anomalyCount: anomalies.length,
  };

  const summaryByPlan = input.plans.map((plan) => {
    const decisions = makeDecisions(plan, rhythmSummary, loop.signalDigest);
    return {
      planId: String(plan.candidate.id),
      summary: plan,
      decisions,
    };
  });

  const allAdjustments = summaryByPlan.flatMap((entry) => entry.decisions);

  void repository.loadLatestSnapshot(String(input.tenant));

  return {
    tenant: input.tenant,
    adjustments: allAdjustments,
    summaries: [rhythmSummary],
    nextPlan: summaryByPlan[0]?.summary,
  };
};

const makeDecisions = (
  plan: OrchestrationPlan,
  rhythmSummary: RhythmSummary,
  digest: OrchestrationSignalDigest,
): FeedbackAdjustment[] => {
  const adjustments: FeedbackAdjustment[] = [];

  if (digest.category === 'high') {
    adjustments.push({
      planId: String(plan.candidate.id),
      kind: 'throttle',
      detail: `High signal volume ${digest.score.toFixed(2)}`,
      score: 0.95,
    });
  }

  if (rhythmSummary.trendScore > 50) {
    adjustments.push({
      planId: String(plan.candidate.id),
      kind: 'pause',
      detail: `High trend score ${rhythmSummary.trendScore}`,
      score: toScore(rhythmSummary.totalSignals, 200),
    });
  }

  if (!plan.candidate.constraints.operatorApprovalRequired && rhythmSummary.bucketCount < 5) {
    adjustments.push({
      planId: String(plan.candidate.id),
      kind: 'boost',
      detail: 'Low activity trend, increase parallelism',
      score: 0.55,
    });
  }

  if (plan.state === 'blocked') {
    adjustments.push({
      planId: String(plan.candidate.id),
      kind: 'retry',
      detail: 'Plan blocked previously, resubmitting with elevated confidence',
      score: 0.77,
    });
  }

  return adjustments;
};

const buildRhythmSummary = (tenant: Brand<string, 'TenantId'>, signals: readonly RecoverySignal[]): RhythmProfile => {
  return {
    tenant,
    rhythm: signals.map((signal, index) => ({
      bucket: 'minute',
      index,
      signalCount: 1,
      weightedSeverity: signal.severity * signal.confidence,
      averageConfidence: signal.confidence,
    })),
    generatedAt: new Date().toISOString(),
    trend: 'stable',
    peakBucket: 0,
  };
};

export const applySlaAwareAdjustments = (
  tenant: Brand<string, 'TenantId'>,
  profile: SlaProfile,
  decision: SessionDecision,
  observedMinutes: number,
): FeedbackAdjustment[] => {
  const breaches = estimateSlaBreachMinutes(profile, observedMinutes);
  const sortedProfiles = [profile, ...[buildSlaProfile(profileToFingerprint(profile), tenant, [])]].sort(compareSlaProfiles);
  const best = sortedProfiles[0];

  if (breaches.length === 0) {
    return [{
      planId: decision.ticketId,
      kind: 'boost',
      detail: `No SLA breach for ${best.bands[0]?.name ?? 'gold'} band`,
      score: 0.4,
    }];
  }

  return breaches.map((violation) => ({
    planId: decision.ticketId,
    kind: 'pause',
    detail: `SLA ${violation.band} breach ${violation.breachMinutes}m`,
    score: violation.confidence,
  }));
};

const profileToFingerprint = (profile: SlaProfile): IncidentFingerprint => {
  const first = profile.bands[0];
  return {
    tenant: profile.tenant,
    region: 'global',
    serviceFamily: 'recovery-operations',
    impactClass: first ? (first.name === 'critical' ? 'infrastructure' : 'application') : 'application',
    estimatedRecoveryMinutes: Math.max(1, Math.round((first?.recoveryMinutesTarget ?? 120) * 1.2)),
  };
};
