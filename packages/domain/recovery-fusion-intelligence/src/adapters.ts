import { fail, ok, type Result } from '@shared/result';
import type {
  FusionBundle,
  FusionPlanRequest,
  FusionPlanResult,
  FusionSignalEnvelope,
  FusionSignalId,
  FusionWave,
  FusionWaveId,
  FusionPlanId,
} from './types';
import type { RecoveryRunState } from '@domain/recovery-orchestration';

const coerceRunId = (value: string): RecoveryRunState['runId'] => value as unknown as RecoveryRunState['runId'];
const coercePlanId = (value: string): FusionPlanId => value as unknown as FusionPlanId;
const coerceSignalId = (value: string): FusionSignalId => value as unknown as FusionSignalId;
const coerceWaveId = (value: string): FusionWaveId => value as unknown as FusionWaveId;

const normalizeSignal = (value: unknown): FusionSignalEnvelope => {
  const payload = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const details =
    payload.details && typeof payload.details === 'object' ? (payload.details as Record<string, unknown>) : {};

  const observedAt =
    typeof payload.observedAt === 'string'
      ? payload.observedAt
      : typeof payload.detectedAt === 'string'
        ? payload.detectedAt
        : new Date().toISOString();
  const tags = Array.isArray((payload.tags as unknown[] | undefined))
    ? (payload.tags as unknown[]).filter((tag): tag is string => typeof tag === 'string')
    : [];
  const runId = typeof payload.runId === 'string' ? coerceRunId(payload.runId) : coerceRunId('run-auto');

  return {
    id: coerceSignalId(typeof payload.id === 'string' ? payload.id : 'signal-auto'),
    source: typeof payload.source === 'string' ? payload.source : 'fusion-source',
    severity: Number(payload.severity ?? 0),
    confidence: Number(payload.confidence ?? 0.5),
    detectedAt: observedAt,
    details,
    runId,
    incidentId: typeof payload.incidentId === 'string'
      ? ((payload.incidentId as unknown) as FusionSignalEnvelope['incidentId'])
      : undefined,
    observedAt,
    tags,
    payload: payload.payload && typeof payload.payload === 'object' ? (payload.payload as Record<string, unknown>) : details,
  };
};

export interface FusionPlanStore {
  savePlan(plan: FusionBundle): Promise<void>;
  loadPlan(planId: string): Promise<FusionBundle | undefined>;
}

export interface FusionEventBus {
  publish(eventType: string, payload: unknown): Promise<void>;
  subscribe(eventType: string, handler: (payload: unknown) => void): Promise<() => void>;
}

export interface FusionEvaluator {
  evaluate(planId: string): Promise<Result<{ planId: string; healthy: boolean; reasons: readonly string[] }, Error>>;
}

export interface FusionCommandAdapter {
  execute(planId: string, waveId: string): Promise<Result<{ planId: string; waveId: string; status: string }, Error>>;
  abort(planId: string, waveId: string): Promise<Result<{ planId: string; waveId: string }, Error>>;
}

const extractSignals = (rawSignals: readonly unknown[]): readonly FusionSignalEnvelope[] =>
  rawSignals
    .filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object')
    .map((entry) => normalizeSignal(entry as unknown));

export const parsePlanRequest = (raw: unknown): Result<FusionPlanRequest, Error> => {
  if (!raw || typeof raw !== 'object') {
    return fail(new Error('invalid request payload'));
  }

  const request = raw as {
    planId?: unknown;
    runId?: unknown;
    waves?: unknown;
    signals?: unknown;
    budget?: unknown;
  };

  if (typeof request.planId !== 'string' || request.planId.length === 0) {
    return fail(new Error('planId required'));
  }
  if (typeof request.runId !== 'string' || request.runId.length === 0) {
    return fail(new Error('runId required'));
  }

  const budget = (request.budget as Record<string, unknown>) ?? {};
  if (
    typeof budget !== 'object' ||
    typeof budget.maxParallelism !== 'number' ||
    typeof budget.maxRetries !== 'number' ||
    typeof budget.timeoutMinutes !== 'number'
  ) {
    return fail(new Error('invalid budget values'));
  }

  const rawSignals = Array.isArray(request.signals) ? request.signals : [];
  const rawWaves = Array.isArray(request.waves)
    ? request.waves
        .filter((wave): wave is FusionWave => !!wave && typeof wave === 'object')
        .map((wave) => ({
          ...wave,
          id: coerceWaveId((wave as { id?: string }).id ?? 'wave-auto'),
          planId: coercePlanId(request.planId as string),
          runId: coerceRunId(request.runId as string),
          state: (wave as { state?: FusionWave['state'] }).state ?? 'idle',
          windowStart: String((wave as { windowStart?: string }).windowStart ?? new Date().toISOString()),
          windowEnd: String((wave as { windowEnd?: string }).windowEnd ?? new Date(Date.now() + 60_000).toISOString()),
          commands: [],
          readinessSignals: [],
          budget: {
            maxParallelism: Number(budget.maxParallelism),
            maxRetries: Number(budget.maxRetries),
            timeoutMinutes: Number(budget.timeoutMinutes),
            operatorApprovalRequired: Boolean((budget as { operatorApprovalRequired?: boolean }).operatorApprovalRequired),
          },
          riskBand: (wave as { riskBand?: FusionWave['riskBand'] }).riskBand ?? 'green',
          score: Number((wave as { score?: number }).score ?? 0.5),
          metadata: (wave as { metadata?: FusionWave['metadata'] }).metadata ?? {
            createdBy: 'request',
            priority: 50,
            confidence: 0.5,
            ownerTeam: 'fusion',
          },
        }))
    : ([] as FusionWave[]);

  return ok({
    planId: coercePlanId(request.planId),
    runId: coerceRunId(request.runId),
    waves: rawWaves,
    signals: extractSignals(rawSignals),
    budget: {
      maxParallelism: budget.maxParallelism,
      maxRetries: budget.maxRetries,
      timeoutMinutes: budget.timeoutMinutes,
      operatorApprovalRequired: Boolean((budget as { operatorApprovalRequired?: boolean }).operatorApprovalRequired),
    },
  });
};

export const decodeStoredBundle = (raw: unknown): Result<FusionBundle, Error> => {
  if (!raw || typeof raw !== 'object') {
    return fail(new Error('invalid bundle envelope'));
  }

  const candidate = raw as Partial<FusionBundle>;
  if (typeof candidate.id !== 'string' || typeof candidate.planId !== 'string') {
    return fail(new Error('invalid bundle envelope'));
  }

  return ok(candidate as FusionBundle);
};

export const encodeResult = (result: FusionPlanResult): string =>
  JSON.stringify({
    accepted: result.accepted,
    bundleId: result.bundleId,
    waveCount: result.waveCount,
    estimatedMinutes: result.estimatedMinutes,
    riskBand: result.riskBand,
    reasons: result.reasons,
  });

export const createNoopBus = (): FusionEventBus => ({
  async publish() {},
  async subscribe(_, handler) {
    return () => {
      void handler;
    };
  },
});

export const createNoopStore = (): FusionPlanStore => ({
  async savePlan() {},
  async loadPlan() {
    return undefined;
  },
});

export const toJson = (eventType: string, payload: unknown): string =>
  JSON.stringify({
    eventType,
    payload,
    createdAt: new Date().toISOString(),
  });
