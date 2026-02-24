import { withBrand } from '@shared/core';
import type {
  CadencePlanCandidate,
  CadencePolicyConstraint,
  CadenceRunPlan,
  CadenceSlot,
  CadenceWindow,
} from './types';
import type {
  ReadinessConstraintSet,
  ReadinessForecast,
  ReadinessPolicyEnvelope,
  ReadinessPolicyViolation,
  ReadinessReadModelEnvelope,
  ReadinessRunbook,
  ReadinessSignal,
  ReadinessSignalEnvelope,
} from '@domain/recovery-readiness';

export type CadenceSignalEnvelope = {
  readonly runId: ReadinessSignal['runId'];
  readonly signal: ReadinessSignal;
  readonly score: number;
  readonly signalEnvelope: ReadinessSignalEnvelope<Record<string, unknown>>;
};

export type CadencePolicyArtifact = {
  readonly runId: ReadinessSignal['runId'];
  readonly policy: ReadinessPolicyEnvelope;
  readonly constraintCount: number;
  readonly constraintPressure: number;
  readonly policyScore: number;
};

export type CadenceReadinessDashboard = {
  readonly runId: ReadinessSignal['runId'];
  readonly signals: readonly CadenceSignalEnvelope[];
  readonly constraints: readonly CadencePolicyConstraint[];
  readonly forecasts: readonly ReadinessForecast[];
  readonly runbookArtifact: {
    readonly runbook: ReadinessRunbook;
    readonly tags: readonly string[];
    readonly actionCount: number;
  };
  readonly policyArtifacts: readonly CadencePolicyArtifact[];
  readonly readModel: readonly ReadinessReadModelEnvelope<Record<string, unknown>>[];
};

const scoreSignal = (signal: ReadinessSignal): number => {
  const severityWeight =
    signal.severity === 'critical' ? 4 : signal.severity === 'high' ? 3 : signal.severity === 'medium' ? 2 : 1;

  const sourceWeight = signal.source === 'manual-check' ? 1.4 : signal.source === 'telemetry' ? 1.1 : 1;
  return Number((severityWeight * sourceWeight).toFixed(3));
};

const constraintPressure = (constraints: ReadonlyArray<ReadinessConstraintSet>): number =>
  constraints.reduce(
    (acc, constraint) => acc + (constraint.maxSignalsPerMinute ?? 1) + (constraint.minimumActiveTargets || 1),
    0,
  );

export const bindSignalEnvelope = (envelope: ReadinessSignalEnvelope<Record<string, unknown>>): CadenceSignalEnvelope => ({
  runId: envelope.signal.runId,
  signal: envelope.signal,
  score: scoreSignal(envelope.signal),
  signalEnvelope: {
    signal: envelope.signal,
    envelope: {
      ...envelope.envelope,
      signal: envelope.signal,
    },
    weight: Math.max(1, envelope.weight),
  },
});

export const mapSignalsToCadence = (signals: readonly ReadinessSignal[]): CadenceSignalEnvelope[] =>
  signals
    .toSorted((left, right) => scoreSignal(right) - scoreSignal(left))
    .slice(0, 200)
    .map((signal) => ({
      runId: signal.runId,
      signal,
      score: scoreSignal(signal),
      signalEnvelope: {
        signal,
        envelope: {
          score: scoreSignal(signal),
          details: signal.details,
      confidence: 1,
          runId: signal.runId,
        },
        weight: scoreSignal(signal),
      },
    }));

export const bindPolicyViolations = (
  runId: ReadinessSignal['runId'],
  violations: readonly ReadinessPolicyViolation[],
  policy: ReadinessPolicyEnvelope,
): CadencePolicyArtifact[] =>
  violations.map((violation) => ({
    runId,
    policy,
    constraintCount: violations.length,
    constraintPressure: policy.constraints.maxDirectiveRetries + policy.constraints.minimumActiveTargets,
    policyScore: Math.max(
      0,
      100 -
        (policy.constraints.maxSignalsPerMinute ?? 0) / 3 -
        violation.reason.length / 4 -
        violation.location.length / 10,
    ),
  }));

export const buildCadenceDashboardPayload = (
  runId: ReadinessSignal['runId'],
  envelopes: readonly ReadinessSignalEnvelope<Record<string, unknown>>[],
  constraints: readonly ReadinessConstraintSet[],
  forecasts: readonly ReadinessForecast[],
  violations: readonly ReadinessPolicyViolation[],
  policy: ReadinessPolicyEnvelope,
  runbook: ReadinessRunbook,
): CadenceReadinessDashboard => {
  const matched = envelopes
    .filter((envelope) => envelope.signal.runId === runId)
    .map(bindSignalEnvelope)
    .slice(0, 40);

  const policyArtifacts = bindPolicyViolations(runId, violations, policy);
  const pressure = constraintPressure(constraints) + policyArtifacts.length;

  const candidateConstraints: CadencePolicyConstraint[] = constraints.map((constraint) => ({
    id: withBrand(`${runId}-constraint-${String(constraint.policyId)}`, 'CadencePolicyConstraintId'),
    key: 'signal_density',
    expression: `signalDensity <= ${pressure}`,
    enabled: constraint.maxSignalsPerMinute === undefined || constraint.maxSignalsPerMinute > 0,
    weight: Math.min(1, (pressure + 1) / 10),
  }));

  return {
    runId,
    signals: matched,
    constraints: candidateConstraints,
    forecasts,
    runbookArtifact: {
      runbook,
      tags: [`run:${runId}`, `constraints:${constraints.length}`],
      actionCount: Object.keys(runbook.state).length,
    },
    policyArtifacts,
    readModel: [],
  };
};

export const projectCandidateSignals = (
  candidate: CadencePlanCandidate,
  signals: readonly CadenceSignalEnvelope[],
): CadencePlanCandidate => ({
  ...candidate,
  constraints: [
    ...candidate.constraints,
    ...signals.slice(0, 3).map((entry) => ({
      id: withBrand(`signal:${String(entry.signal.signalId)}`, 'CadencePolicyConstraintId'),
      key: 'signal.priority',
      expression: `score >= ${entry.score}`,
      enabled: entry.score >= 2,
      weight: Math.min(1, entry.score / 4),
    })),
  ],
  notes: [
    ...candidate.notes,
    ...signals
      .slice(0, 3)
      .map((entry) => `signal-${String(entry.signal.signalId)}-${entry.signal.severity}-${entry.score}`),
  ],
});

export const projectPlanDensity = (plan: CadenceRunPlan): number => {
  const coverage = plan.windows.length === 0 ? 0 : plan.slots.length / plan.windows.length;
  const signalWeight = plan.slots.reduce((acc, slot) => acc + slot.weight, 0);
  const capacity = plan.windows.reduce((acc, window) => acc + estimateWindowParallelism(window), 0);
  return Number((coverage + signalWeight + capacity).toFixed(3));
};

export const projectSlotsByWindow = (plan: CadenceRunPlan): ReadonlyMap<CadenceWindow['id'], CadenceSlot[]> => {
  const buckets = new Map<CadenceWindow['id'], CadenceSlot[]>();

  for (const slot of plan.slots) {
    const list = buckets.get(slot.windowId) ?? [];
    buckets.set(slot.windowId, [...list, slot]);
  }

  return buckets;
};

const estimateWindowParallelism = (window: CadenceWindow): number =>
  Number((window.maxRetries * (window.requiredApprovals || 1)) / Math.max(1, window.maxParallelism));
