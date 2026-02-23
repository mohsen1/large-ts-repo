import { withBrand, type Brand } from '@shared/core';

export type SignalId = Brand<string, 'SignalId'>;
export type SignalSourceId = Brand<string, 'SignalSourceId'>;
export type ScenarioId = Brand<string, 'ScenarioId'>;
export type ActionId = Brand<string, 'ActionId'>;
export type PriorityBand = 'critical' | 'high' | 'medium' | 'low';
export type SignalState = 'fresh' | 'aging' | 'stale' | 'resolved';
export type ScenarioState = 'draft' | 'active' | 'suppressed' | 'completed' | 'archived';

export interface SignalEvidence {
  readonly id: SignalId;
  readonly type: string;
  readonly sourceId: SignalSourceId;
  readonly confidence: number;
  readonly details: Record<string, unknown>;
  readonly capturedAt: string;
}

export interface RecoverySignal {
  readonly id: SignalId;
  readonly tenant: string;
  readonly title: string;
  readonly summary: string;
  readonly severity: number;
  readonly state: SignalState;
  readonly priority: PriorityBand;
  readonly region: string;
  readonly tags: readonly string[];
  readonly evidence: readonly SignalEvidence[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt?: string;
}

export interface RecoveryScenario {
  readonly id: ScenarioId;
  readonly tenant: string;
  readonly name: string;
  readonly owner: string;
  readonly state: ScenarioState;
  readonly riskScore: number;
  readonly confidence: number;
  readonly signalIds: readonly SignalId[];
  readonly affectedSystems: readonly string[];
  readonly expectedEndAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RecoveryAction {
  readonly id: ActionId;
  readonly tenant: string;
  readonly scenarioId: ScenarioId;
  readonly title: string;
  readonly rationale: string;
  readonly runbook: string;
  readonly estimatedMinutes: number;
  readonly preconditions: readonly string[];
  readonly postconditions: readonly string[];
  readonly automated: boolean;
  readonly owner: string;
  readonly dependsOn: readonly ActionId[];
}

export interface FusionRunStep {
  readonly order: number;
  readonly actionId: ActionId;
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly success?: boolean;
  readonly details: Record<string, unknown>;
}

export interface FusionSimulation {
  readonly runId: FusionRunId;
  readonly tenant: string;
  readonly scenarioId: ScenarioId;
  readonly steps: readonly FusionRunStep[];
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly score: number;
  readonly notes: string;
}

export interface FusionPlan {
  readonly planId: FusionPlanId;
  readonly scenarioId: ScenarioId;
  readonly tenant: string;
  readonly title: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly signals: readonly RecoverySignal[];
  readonly actions: readonly RecoveryAction[];
  readonly scenarioState: ScenarioState;
}

export interface SignalPulse {
  readonly value: number;
  readonly signalId: SignalId;
  readonly at: string;
}

export type FusionRunId = Brand<string, 'FusionRunId'>;
export type FusionPlanId = Brand<string, 'FusionPlanId'>;

export interface ScenarioSnapshot {
  readonly id: Brand<string, 'ScenarioSnapshotId'>;
  readonly scenarioId: ScenarioId;
  readonly capturedAt: string;
  readonly riskScore: number;
  readonly signalCount: number;
  readonly actionReadiness: number;
  readonly topSignals: readonly SignalId[];
}

export interface SignalEnvelope<T> {
  readonly tenant: string;
  readonly data: T;
  readonly recordedAt: string;
}

const normalize = (value: number, min = 0, max = 1): number => Math.max(min, Math.min(max, value));

export const classifyPriority = (severity: number, confidence: number): PriorityBand => {
  const score = normalize(severity * confidence, 0, 1);
  if (score >= 0.8) return 'critical';
  if (score >= 0.6) return 'high';
  if (score >= 0.35) return 'medium';
  return 'low';
};

export const normalizeSignalState = (lastSeenAt: string): SignalState => {
  const ageMs = Date.now() - Date.parse(lastSeenAt);
  if (ageMs < 60_000) return 'fresh';
  if (ageMs < 6 * 60_000) return 'aging';
  if (ageMs < 24 * 60 * 60_000) return 'stale';
  return 'resolved';
};

export const computeSignalScore = (signal: RecoverySignal): number => {
  const ageMinutes = Math.max(1, (Date.now() - Date.parse(signal.createdAt)) / 60_000);
  const decay = Math.exp(-ageMinutes / 60);
  const confidence = normalize(signal.evidence.length / 8, 0, 1);
  const stateFactor = signal.state === 'fresh' ? 1 : signal.state === 'aging' ? 0.8 : signal.state === 'stale' ? 0.5 : 0.2;
  return normalize(signal.severity * decay * (0.4 + 0.4 * confidence + 0.2 * stateFactor));
};

export const evaluateScenarioRisk = (signals: readonly RecoverySignal[]): number => {
  if (signals.length === 0) return 0;
  const maxSeverity = Math.max(...signals.map((signal) => signal.severity));
  const confidence = signals.reduce((sum, signal) => sum + signal.evidence.length, 0) / signals.length;
  const confidenceBoost = normalize(confidence / 10, 0, 1);
  const freshness = signals.reduce((sum, signal) => {
    const ageMinutes = Math.max(1, (Date.now() - Date.parse(signal.createdAt)) / 60_000);
    return sum + Math.exp(-ageMinutes / 120);
  }, 0);
  return normalize(maxSeverity * confidenceBoost * 0.3 + normalize(freshness / signals.length) * 0.7);
};

export const scenarioStateFromSignals = (signals: readonly RecoverySignal[]): ScenarioState => {
  if (signals.length === 0) return 'draft';
  if (signals.some((signal) => signal.priority === 'critical')) return 'active';
  if (signals.every((signal) => signal.state === 'resolved')) return 'archived';
  return 'suppressed';
};

export const orderScenarioActions = (actions: readonly RecoveryAction[]): readonly RecoveryAction[] => {
  return [...actions].toSorted((a, b) => {
    if (a.automated !== b.automated) return a.automated ? -1 : 1;
    if (a.estimatedMinutes !== b.estimatedMinutes) return a.estimatedMinutes - b.estimatedMinutes;
    return a.title.localeCompare(b.title);
  });
};

export const buildSignalPulse = (signal: RecoverySignal): readonly SignalPulse[] => {
  const base = computeSignalScore(signal);
  return [
    {
      signalId: withBrand(signal.id, 'SignalId'),
      value: normalize(base),
      at: new Date().toISOString(),
    },
  ];
};

export const scoreSignalEnvelope = <T extends RecoverySignal>(envelope: SignalEnvelope<T>): T & { score: number; priority: PriorityBand } => {
  const score = computeSignalScore(envelope.data);
  return {
    ...envelope.data,
    score,
    priority: classifyPriority(score * 10, envelope.data.evidence.length / 10),
  };
};

export const zipSignals = <T>(left: readonly T[], right: readonly T[]): Array<[T, T]> =>
  left.map((value, index) => [value, right[index] ?? left[Math.max(index - 1, 0)]]);

export const mapEnvelopeToSnapshot = <T>(
  signals: readonly SignalEnvelope<T>[],
  mapper: (item: SignalEnvelope<T>) => SignalPulse,
): readonly SignalPulse[] => {
  return signals.map(mapper);
};
