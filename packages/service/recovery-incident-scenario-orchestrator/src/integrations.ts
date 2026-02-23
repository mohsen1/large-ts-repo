import type {
  OutboundEnvelope,
  PlanEnvelope,
  InboundCommand,
  ConstraintEnvelope,
} from '@infrastructure/recovery-scenario-gateway';
import { decode, publish } from '@infrastructure/recovery-scenario-gateway';
import type { RecoveryPlan, RecoveryRun } from '@domain/recovery-scenario-orchestration';
import type { ServiceEvent } from './types';

const makeCorrelation = (tenantId: string, incidentId: string): string => `${tenantId}:${incidentId}:${Date.now()}`;

export const makeOutboundEnvelope = (
  source: string,
  correlationId: string,
  payload: PlanEnvelope,
): OutboundEnvelope<PlanEnvelope> => ({
  envelopeType: 'plan',
  emittedAt: new Date().toISOString(),
  source,
  correlationId,
  payload,
});

export const makeConstraintEnvelope = (
  source: string,
  correlationId: string,
  payload: ConstraintEnvelope,
): OutboundEnvelope<ConstraintEnvelope> => ({
  envelopeType: 'constraints',
  emittedAt: new Date().toISOString(),
  source,
  correlationId,
  payload,
});

export const emitPlan = (
  source: string,
  tenantId: string,
  incidentId: string,
  plan: RecoveryPlan,
  run: RecoveryRun | null,
): { id: string; envelope: string } => {
  const correlationId = makeCorrelation(tenantId, incidentId);
  const envelope = makeOutboundEnvelope(source, correlationId, {
    status: plan.state === 'running' ? 'accepted' : 'queued',
    plan,
    run,
    reasonCodes: ['service-created'],
  } as PlanEnvelope);

  const message = publish(source, correlationId, envelope);
  return { id: message.id, envelope: message.envelope };
};

export const emitConstraintPayload = (
  source: string,
  tenantId: string,
  incidentId: string,
  payload: ConstraintEnvelope,
): { id: string; envelope: string } => {
  const correlationId = makeCorrelation(tenantId, incidentId);
  const message = publish(source, correlationId, makeConstraintEnvelope(source, correlationId, payload));
  return { id: message.id, envelope: message.envelope };
};

export const decodeIncoming = (raw: string): ServiceEvent => {
  const envelope = decode(raw);
  return {
    type: envelope.envelopeType === 'plan' ? 'plan_created' : 'run_updated',
    correlationId: envelope.correlationId,
    timestamp: envelope.emittedAt,
    payload: {
      envelopeType: envelope.envelopeType,
    },
  };
};

export const route = (source: string, raw: string, command: InboundCommand): string =>
  `${source}:${raw.length}:${command.type}:${command.actor}`;

export const serializeEnvelope = (
  source: string,
  correlationId: string,
  envelope: OutboundEnvelope<PlanEnvelope | ConstraintEnvelope>,
): OutboundEnvelope<PlanEnvelope | ConstraintEnvelope> => {
  const message = publish(source, correlationId, envelope as OutboundEnvelope<PlanEnvelope>);
  return {
    envelopeType: message.envelope,
    emittedAt: envelope.emittedAt,
    source,
    correlationId,
    payload: envelope.payload,
  };
};
