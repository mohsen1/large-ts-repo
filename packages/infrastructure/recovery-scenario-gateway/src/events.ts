import type {
  OutboundEnvelope,
  InboundCommand,
  PlanEnvelope,
  ConstraintEnvelope,
} from './protocol';
import { planEnvelope, constraintEnvelope, envelopeSchema } from './protocol';

export interface OutgoingMessage {
  readonly id: string;
  readonly envelope: string;
  readonly payload: OutboundEnvelope<PlanEnvelope | ConstraintEnvelope | Record<string, unknown>>;
}

export interface IncomingMessage {
  readonly id: string;
  readonly payload: string;
  readonly command: InboundCommand;
}

export const encode = (payload: OutboundEnvelope<unknown>): string => {
  const parsed = envelopeSchema.parse({
    envelopeType: payload.envelopeType,
    emittedAt: payload.emittedAt,
    source: payload.source,
    correlationId: payload.correlationId,
  });

  return JSON.stringify({
    ...parsed,
    payload: payload.payload,
  });
};

export const decode = (raw: string): OutboundEnvelope<unknown> => {
  const parsed = JSON.parse(raw);
  return {
    envelopeType: String(parsed.envelopeType ?? ''),
    emittedAt: String(parsed.emittedAt ?? ''),
    source: String(parsed.source ?? ''),
    correlationId: String(parsed.correlationId ?? ''),
    payload: parsed.payload,
  };
};

export const publish = (
  source: string,
  correlationId: string,
  payload: OutboundEnvelope<PlanEnvelope | ConstraintEnvelope | Record<string, unknown>>,
): OutgoingMessage => ({
  id: `${source}:${correlationId}:${Date.now()}`,
  envelope: payload.envelopeType,
  payload: {
    ...payload,
  },
});

export const routeCommand = (message: IncomingMessage, command: InboundCommand): string => {
  return `${message.id}:${command.type}:${command.actor}`;
};

export const publishPlan = (
  source: string,
  correlationId: string,
  plan: OutboundEnvelope<PlanEnvelope>['payload'],
): OutgoingMessage =>
  publish(source, correlationId, {
    envelopeType: 'plan',
    emittedAt: new Date().toISOString(),
    source,
    correlationId,
    payload: plan,
  });

export const publishConstraint = (
  source: string,
  correlationId: string,
  constraints: OutboundEnvelope<ConstraintEnvelope>['payload'],
): OutgoingMessage =>
  publish(source, correlationId, {
    envelopeType: 'constraints',
    emittedAt: new Date().toISOString(),
    source,
    correlationId,
    payload: constraints,
  });

export const publishPlanEnvelope = (
  source: string,
  correlationId: string,
  plan: Parameters<typeof planEnvelope>[0],
  run: Parameters<typeof planEnvelope>[1],
): OutgoingMessage =>
  publishPlan(source, correlationId, planEnvelope(plan, run));

export const publishConstraintEnvelope = (
  source: string,
  correlationId: string,
  constraints: Parameters<typeof constraintEnvelope>[0],
): OutgoingMessage =>
  publishConstraint(source, correlationId, constraintEnvelope(constraints));
