import type { Brand } from '@shared/core';
import type { SessionDecision, RecoverySignal, RunPlanSnapshot, OrchestrationPlan } from '@domain/recovery-operations-models';
import {
  buildRhythmProfile,
  type RhythmSummary,
} from '@domain/recovery-operations-models/incident-rhythm';
import { withBrand } from '@shared/core';

export interface CascadeImpact {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly planId: string;
  readonly impactedServices: readonly string[];
  readonly blastRadius: number;
  readonly confidence: number;
  readonly summary: string;
}

export interface CascadeWindow {
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly zone: string;
}

export interface CascadeEvaluation {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly planId: string;
  readonly impact: CascadeImpact;
  readonly rhythm: RhythmSummary;
  readonly affectedSignals: readonly RecoverySignal[];
  readonly decisions: readonly SessionDecision[];
  readonly window: CascadeWindow;
}

const impactedByPlan = (plan: RunPlanSnapshot): string[] =>
  plan.program.steps.map((step) => `${plan.fingerprint.serviceFamily}:${step.command}`).slice(0, 6);

const pickSignals = (signals: readonly RecoverySignal[]): readonly RecoverySignal[] =>
  [...signals].sort((left, right) => right.severity - left.severity).slice(0, 12);

const confidenceFromSignals = (signals: readonly RecoverySignal[]): number => {
  if (signals.length === 0) return 0;
  const average = signals.reduce((acc, signal) => acc + signal.confidence, 0) / signals.length;
  return Number(average.toFixed(2));
};

export const evaluateCascade = (
  tenant: Brand<string, 'TenantId'>,
  plan: OrchestrationPlan,
  signals: readonly RecoverySignal[],
): CascadeEvaluation => {
  const impactedServices = impactedByPlan(plan.candidate);
  const summary = buildRhythmProfile(tenant, signals, 'hour');
  const rhythm = {
    tenant: summary.tenant,
    totalSignals: summary.rhythm.reduce((acc, point) => acc + point.signalCount, 0),
    bucketCount: summary.rhythm.length,
    weightedAverageSeverity: Number((summary.rhythm.reduce((acc, point) => acc + point.weightedSeverity, 0) /
      Math.max(1, summary.rhythm.length)).toFixed(3)),
    peakIndex: summary.peakBucket,
    peakWeight: summary.rhythm[summary.peakBucket]?.weightedSeverity ?? 0,
    trendScore: summary.rhythm.reduce((acc, point) => acc + point.weightedSeverity, 0) / Math.max(1, summary.rhythm.length),
  };

  const topSignals = pickSignals(signals);
  const blastRadius = Math.max(1, Math.round((rhythm.weightedAverageSeverity / 10) * impactedServices.length));
  const decisions: SessionDecision[] = topSignals.map((signal, index) => ({
    runId: withBrand(String(plan.candidate.id), 'RecoveryRunId'),
    ticketId: `cascade-${signal.id}:${index}`,
    accepted: signal.severity < 8,
    reasonCodes: [signal.source, String(signal.severity)],
    score: rhythm.weightedAverageSeverity + index,
    createdAt: signal.detectedAt,
  }));

  return {
    tenant,
    planId: String(plan.candidate.id),
    impact: {
      tenant,
      planId: String(plan.candidate.id),
      impactedServices,
      blastRadius,
      confidence: confidenceFromSignals(topSignals),
      summary: `${blastRadius} services, ${topSignals.length} signals`,
    },
    rhythm,
    affectedSignals: topSignals,
    decisions,
    window: {
      windowStart: plan.window.windowStart,
      windowEnd: plan.window.windowEnd,
      zone: plan.window.timezone,
    },
  };
};

export const collapseDecisions = (evaluations: readonly CascadeEvaluation[]): readonly SessionDecision[] => {
  const decisions = evaluations.flatMap((evaluation) => evaluation.decisions);
  const dedup = new Map<string, SessionDecision>();

  for (const decision of decisions) {
    const key = `${decision.runId}:${decision.ticketId}`;
    const existing = dedup.get(key);
    if (existing) {
      const merged: SessionDecision = {
        ...existing,
        reasonCodes: [...new Set([...existing.reasonCodes, ...decision.reasonCodes])],
        score: (existing.score + decision.score) / 2,
      };
      dedup.set(key, merged);
      continue;
    }
    dedup.set(key, decision);
  }

  return [...dedup.values()];
};

export const formatCascade = (evaluation: CascadeEvaluation): string => {
  const impact = evaluation.impact;
  return [
    `tenant=${evaluation.tenant}`,
    `plan=${evaluation.planId}`,
    `services=${impact.impactedServices.length}`,
    `radius=${impact.blastRadius}`,
    `decisionCount=${evaluation.decisions.length}`,
    `confidence=${impact.confidence}`,
  ].join(' | ');
};
