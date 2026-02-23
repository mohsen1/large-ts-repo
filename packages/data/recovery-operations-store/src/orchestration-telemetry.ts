import { createEnvelope, type JsonObject } from '@shared/observability-contracts';
import type { Result } from '@shared/result';
import { ok } from '@shared/result';
import type {
  RecoveryOperationsEnvelope,
  RecoverySignal,
  RunPlanSnapshot,
  RunSession,
  SessionDecision,
} from '@domain/recovery-operations-models';
import type { SignalEnvelope } from '@domain/recovery-operations-models/signal-portfolio';
import { buildSignalEnvelope } from '@domain/recovery-operations-models';
import type { StoreSnapshot } from './models';

export type TelemetryChannel = 'signals' | 'decisions' | 'plans' | 'snapshots';

export interface OperationsTelemetryEvent {
  readonly tenant: string;
  readonly runId: string;
  readonly channel: TelemetryChannel;
  readonly payload: string;
  readonly emittedAt: string;
}

export interface TelemetryQuery {
  readonly tenant?: string;
  readonly channel?: TelemetryChannel;
}

export interface OperationsTelemetryEnvelope {
  readonly envelope: string;
  readonly event: OperationsTelemetryEvent;
}

const buildPlanPayload = (runId: string, plan: RunPlanSnapshot): JsonObject => ({
  operation: 'plan-created',
  runId,
  planId: String(plan.id),
  snapshotName: plan.name,
});

const buildDecisionPayload = (runId: string, decision: SessionDecision): JsonObject => ({
  operation: 'decision-upserted',
  runId,
  ticketId: decision.ticketId,
  accepted: decision.accepted,
  reasons: decision.reasonCodes,
  score: decision.score,
});

const buildSessionPayload = (runId: string, session: RunSession): JsonObject => ({
  operation: 'session-refreshed',
  runId,
  sessionId: String(session.id),
  status: session.status,
  signalCount: session.signals.length,
});

export const buildOperationsSignalEnvelope = (tenant: string, signal: RecoverySignal): SignalEnvelope => {
  return buildSignalEnvelope(tenant, `signal-${signal.id}`, signal);
};

export const buildOperationsPlanEnvelope = (tenant: string, runId: string, plan: RunPlanSnapshot): string => {
  const envelope = createEnvelope<JsonObject, { operation: string; actor?: string; confidence?: number }>(
    tenant,
    'recovery-operations-store',
    'plan-created',
    buildPlanPayload(runId, plan),
    {
      operation: 'plan-created',
      actor: 'recovery-store',
      confidence: 0.91,
    },
  );

  return JSON.stringify(envelope);
};

export const buildOperationsDecisionEnvelope = (tenant: string, runId: string, decision: SessionDecision): string => {
  const envelope = createEnvelope<JsonObject, { operation: string; actor?: string; confidence?: number }>(
    tenant,
    'recovery-operations-store',
    'decision-upserted',
    buildDecisionPayload(runId, decision),
    {
      operation: 'decision-upserted',
      actor: 'recovery-store',
      confidence: 0.92,
    },
  );

  return JSON.stringify(envelope);
};

export const buildOperationsSessionEnvelope = (tenant: string, runId: string, session: RunSession): string => {
  const envelope = createEnvelope<JsonObject, { operation: string; actor?: string; confidence?: number }>(
    tenant,
    'recovery-operations-store',
    'session-refreshed',
    buildSessionPayload(runId, session),
    {
      operation: 'session-refreshed',
      actor: 'recovery-store',
      confidence: 0.8,
    },
  );

  return JSON.stringify(envelope);
};

export const formatOperationsEvent = (event: OperationsTelemetryEvent): OperationsTelemetryEnvelope => ({
  envelope: JSON.stringify(event),
  event,
});

export const hydrateTelemetryFromSnapshot = async (_snapshot: StoreSnapshot): Promise<Result<string, string>> => {
  return ok('telemetry-hydrated');
};

export const asRecoveryOperationEnvelope = <TPayload>(
  tenant: string,
  payload: RecoveryOperationsEnvelope<TPayload>,
): RecoveryOperationsEnvelope<TPayload> => ({
  eventId: payload.eventId,
  tenant: payload.tenant,
  payload: payload.payload,
  createdAt: payload.createdAt,
});
