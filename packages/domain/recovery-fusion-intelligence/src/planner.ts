import {
  type FusionBundle,
  type FusionPlanId,
  type FusionPlanRequest,
  type FusionPlanResult,
  type FusionSignalEnvelope,
  type FusionWave,
  type FusionWaveId,
  type FusionWeightVector,
} from './types';
import type { RecoveryRunState } from '@domain/recovery-orchestration';
import type { RunSessionId, RunTicketId, RunPlanId } from '@domain/recovery-operations-models';

const coerceRunId = (value: string | RecoveryRunState['runId']): RecoveryRunState['runId'] =>
  value as unknown as RecoveryRunState['runId'];
const coercePlanId = (value: string | FusionPlanId): RunPlanId => value as unknown as RunPlanId;
const coerceWaveId = (value: string): FusionWaveId => value as unknown as FusionWaveId;
const coerceSessionId = (value: string): RunSessionId => value as unknown as RunSessionId;
const coerceTicketId = (value: string): RunTicketId => value as unknown as RunTicketId;

const normalizeScore = (value: number): number => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

const randomSeedId = (prefix: string): string => `${prefix}:${Math.floor(Math.random() * 10000)}`;

const normalizeWeightVector = (input: FusionWeightVector): FusionWeightVector => {
  const total =
    input.severity + input.confidence + input.temporalUrgency + input.blastRadius + input.dependencyDepth + input.operatorSlack;
  if (total === 0) {
    return {
      severity: 0,
      confidence: 0,
      temporalUrgency: 0,
      blastRadius: 0,
      dependencyDepth: 0,
      operatorSlack: 0,
    };
  }

  return {
    severity: normalizeScore(input.severity / total),
    confidence: normalizeScore(input.confidence / total),
    temporalUrgency: normalizeScore(input.temporalUrgency / total),
    blastRadius: normalizeScore(input.blastRadius / total),
    dependencyDepth: normalizeScore(input.dependencyDepth / total),
    operatorSlack: normalizeScore(input.operatorSlack / total),
  };
};

const defaultRiskWeights = (): FusionWeightVector => ({
  severity: 0.35,
  confidence: 0.2,
  temporalUrgency: 0.2,
  blastRadius: 0.1,
  dependencyDepth: 0.1,
  operatorSlack: 0.05,
});

const commandForIndex = (waveIndex: number): FusionWave['commands'][number]['action'] =>
  waveIndex % 2 === 0 ? 'start' : 'verify';

export const calculateRiskVector = (
  signals: readonly FusionSignalEnvelope[],
  dependencyDensity: number,
): { severity: number; confidence: number; riskIndex: number } => {
  if (signals.length === 0) {
    return { severity: 0, confidence: 0, riskIndex: 0 };
  }

  const severity = signals.reduce((sum, signal) => sum + signal.severity, 0) / signals.length;
  const confidence = signals.reduce((sum, signal) => sum + signal.confidence, 0) / signals.length;

  return {
    severity: normalizeScore(severity),
    confidence: normalizeScore(confidence),
    riskIndex: normalizeScore(severity * (0.65 + dependencyDensity * 0.35) * (1 + (1 - confidence) * 0.2)),
  };
};

const sanitizeSignals = (signals: readonly FusionSignalEnvelope[]): readonly FusionSignalEnvelope[] =>
  signals
    .filter((signal) => signal.id.length > 0 && signal.runId.length > 0)
    .map((signal) => ({
      ...signal,
      severity: normalizeScore(signal.severity),
      confidence: normalizeScore(signal.confidence),
      tags: [...new Set(signal.tags.map((tag) => tag.trim()).filter(Boolean))],
      payload: signal.payload ?? {},
      observedAt: signal.observedAt ?? new Date().toISOString(),
      details: signal.details ?? {},
    }));

export const normalizeSignals = (signals: readonly FusionSignalEnvelope[]): readonly FusionSignalEnvelope[] =>
  sanitizeSignals(signals);

export const normalizeSignalWeight = (value: number): number => normalizeScore(value);

export const rankSignals = (signals: readonly FusionSignalEnvelope[]): number => {
  if (signals.length === 0) return 0;
  const weights = normalizeWeightVector(defaultRiskWeights());
  const limit = Math.min(signals.length, 24);
  return (
    signals
      .slice(0, limit)
      .reduce((acc, signal) => {
        const tagsPressure = Math.max(0, 1 - normalizeScore(signal.tags.length / 12));
        return (
          acc +
          signal.severity * weights.severity +
          signal.confidence * weights.confidence +
          tagsPressure * (weights.temporalUrgency + weights.blastRadius + weights.dependencyDepth + weights.operatorSlack)
        );
      }, 0) / limit
  );
};

const buildDefaultWave = (request: FusionPlanRequest, index: number): FusionWave => {
  const now = Date.now();
  const windowStart = new Date(now + index * 60_000).toISOString();
  const windowEnd = new Date(now + (index + 1) * 60_000).toISOString();
  return {
    id: coerceWaveId(`${request.planId}:wave:${index}`),
    planId: request.planId,
    runId: request.runId,
    state: index === 0 ? 'warming' : 'idle',
    windowStart,
    windowEnd,
    commands: [
      {
        id: randomSeedId('command'),
        waveId: coerceWaveId(`${request.planId}:wave:${index}`),
        stepKey: `step-${index}`,
        action: commandForIndex(index),
        actor: 'planner',
        requestedAt: new Date().toISOString(),
        rationale: `auto-wave-${index}`,
      },
    ],
    readinessSignals: normalizeSignals(request.signals).slice(0, 2),
    budget: request.budget,
    riskBand: request.budget.maxParallelism >= 2 ? 'amber' : 'red',
    score: normalizeScore(0.65 - index * 0.08),
    metadata: {
      createdBy: 'planner',
      priority: 40 + index,
      confidence: normalizeScore(0.7 + index * 0.06),
      ownerTeam: 'recovery-team',
    },
  };
};

const determineBands = (signals: readonly FusionSignalEnvelope[]): FusionPlanResult['riskBand'] => {
  const risk = calculateRiskVector(signals, 0.2).riskIndex;
  if (risk >= 0.85) return 'critical';
  if (risk >= 0.65) return 'red';
  if (risk >= 0.35) return 'amber';
  return 'green';
};

const toFusionPlan = (raw: FusionPlanRequest): FusionPlanRequest => ({
  ...raw,
  planId: coercePlanId(raw.planId),
  budget: {
    ...raw.budget,
    maxParallelism: Math.max(1, raw.budget.maxParallelism),
    maxRetries: Math.max(0, raw.budget.maxRetries),
    timeoutMinutes: Math.max(1, raw.budget.timeoutMinutes),
    operatorApprovalRequired: Boolean(raw.budget.operatorApprovalRequired),
  },
  signals: sanitizeSignals(raw.signals),
});

export const normalizeRequest = (raw: FusionPlanRequest): FusionPlanRequest => toFusionPlan(raw);

const buildBundle = (request: FusionPlanRequest): FusionBundle => {
  const signals = sanitizeSignals(request.signals);
  const normalized = {
    ...request,
    waves: request.waves.length === 0 ? [buildDefaultWave(request, 0), buildDefaultWave(request, 1)] : request.waves,
    planId: coercePlanId(request.planId),
    signals,
  };

  const waves = normalized.waves as readonly FusionWave[];

  return {
    id: `${coerceRunId(normalized.runId)}:bundle`,
    tenant: 'tenant-01',
    runId: coerceRunId(normalized.runId),
    session: {
      id: coerceSessionId(`${coerceRunId(normalized.runId)}:session`),
      runId: coerceRunId(normalized.runId),
      ticketId: coerceTicketId(`${coerceRunId(normalized.runId)}:ticket`),
      planId: normalized.planId,
      status: 'queued',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      constraints: normalized.budget,
      signals: normalized.signals,
    },
    planId: normalized.planId,
    waves,
    signals,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 120 * 60_000).toISOString(),
  };
};

export const planFusionBundle = (
  request: FusionPlanRequest,
): { ok: true; value: FusionPlanResult } | { ok: false; error: Error } => {
  const normalized = normalizeRequest(request);

  if (!normalized.planId) {
    return { ok: false, error: new Error('missing plan id') };
  }
  if (!normalized.runId) {
    return { ok: false, error: new Error('missing run id') };
  }

  const bundle = buildBundle(normalized);
  const rank = rankSignals(bundle.signals);
  const riskBand = determineBands(bundle.signals);
  const reasons = rank > 0.7 ? ['priority-high', 'converging-risk'] : ['safe-band'];

  return {
    ok: true,
    value: {
      accepted: true,
      bundleId: bundle.id,
      waveCount: bundle.waves.length,
      estimatedMinutes: Math.max(5, bundle.waves.length * 8),
      riskBand,
      reasons: reasons.concat(`signal-count:${normalized.signals.length}`, `rank:${rank.toFixed(2)}`),
    },
  };
};

export const validatePlanSignals = (signals: readonly FusionSignalEnvelope[]): string[] =>
  signals
    .filter((signal) => signal.severity < 0 || signal.severity > 1)
    .map((signal) => `invalid-severity:${signal.id}`);
