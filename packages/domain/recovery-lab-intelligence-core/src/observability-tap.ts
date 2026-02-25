import { Brand } from '@shared/core';
import type { JsonObject, TimedEnvelope } from '@shared/observability-contracts';
import { createEnvelope } from '@shared/observability-contracts';
import { NoInfer } from '@shared/type-level';
import { summarizeEvents } from './telemetry';
import type { SignalEvent, StrategyResult } from './types';

export const observabilityChannels = ['signal', 'plan', 'result', 'summary'] as const;
export type ObservabilityChannel = (typeof observabilityChannels)[number];

export interface TapPayload<T extends JsonObject = JsonObject> {
  readonly envelope: TimedEnvelope<T>;
  readonly channel: ObservabilityChannel;
  readonly score: number;
}

export interface TapEnvelope {
  readonly channel: ObservabilityChannel;
  readonly tenant: string;
  readonly route: string;
  readonly digest: string;
}

type TapMap = Record<ObservabilityChannel, readonly string[]>;

const tapDefaults: TapMap = {
  signal: ['signal'],
  plan: ['plan'],
  result: ['result'],
  summary: ['summary'],
};

const envelopeTenant = 'recovery-lab-intelligence-core';
const envelopeService = 'lab-intelligence-service';

const buildBaseEnvelope = () =>
  createEnvelope(envelopeTenant, envelopeService, 'seed', { seed: true }, { operation: 'seed', actor: 'bootstrap', confidence: 1 });
const [seedTenant, seedService] = [envelopeTenant, envelopeService] as const;

const baseEnvelope = buildBaseEnvelope();

const isObservabilityChannel = (value: string): value is ObservabilityChannel =>
  observabilityChannels.includes(value as ObservabilityChannel);

export const envelopeDigest = (envelope: TimedEnvelope): string =>
  `${envelope.context.tenantId}:${envelope.context.serviceId}:${envelope.kind}:${envelope.eventId}`;

export const toSignalEnvelope = (tenantId: string, serviceId: string, kind: string, payload: JsonObject): TimedEnvelope =>
  createEnvelope(tenantId, serviceId, kind, payload, {
    operation: kind,
    actor: 'recovery-lab-intelligence-core',
    confidence: 0.95,
  });

export const toSignalEvents = (envelope: TimedEnvelope): SignalEvent[] => [
  {
    source: 'telemetry',
    severity: 'info',
    at: envelope.createdAt,
    detail: {
      tenant: envelope.context.tenantId,
      service: envelope.context.serviceId,
      kind: envelope.kind,
      route: seedService,
    },
  },
  {
    source: 'policy',
    severity: envelope.context.revision > 0 ? 'warn' : 'info',
    at: envelope.createdAt,
    detail: {
      trace: envelope.eventId,
      operation: envelope.kind,
    },
  },
];

export const buildTapEnvelope = <TPayload extends JsonObject>(
  tenant: string,
  service: string,
  route: string,
  channel: ObservabilityChannel,
  payload: TPayload,
): TapEnvelope => {
  const seed = toSignalEnvelope(tenant, service, `${route}::${channel}`, payload);
  const digest = envelopeDigest(seed);
  return {
    channel,
    tenant,
    route,
    digest,
  };
};

export const tapResult = async <TPayload extends JsonObject = JsonObject, TOutput = unknown>(
  channel: NoInfer<ObservabilityChannel>,
  payload: TPayload,
  result: StrategyResult<TOutput>,
): Promise<TapPayload<TPayload>> => {
  const outputChannel = isObservabilityChannel(channel) ? channel : 'result';
  const eventSummary = summarizeEvents(result.events);
  const summarySeed = (payload as { kind?: string }).kind;
  const signature = `${outputChannel}:${summarySeed ?? 'unknown'}`;
  const eventPayload = {
    ...baseEnvelope.payload,
    route: outputChannel,
    score: result.score,
    warnings: eventSummary.warnings,
    errors: eventSummary.errors,
    critical: eventSummary.critical,
    seed: true,
  } as unknown as TPayload;

  const envelope = createEnvelope(
    seedTenant,
    seedService,
    signature,
    eventPayload,
    {
      operation: signature,
      actor: outputChannel,
      confidence: Math.min(1, result.score),
    },
  );

  const withContext = {
    ...envelope,
    context: {
      ...baseEnvelope.context,
      tenantId: baseEnvelope.context.tenantId,
      serviceId: baseEnvelope.context.serviceId,
      region: baseEnvelope.context.region,
      revision: baseEnvelope.context.revision,
      correlationId: baseEnvelope.context.correlationId,
    },
    eventId: envelope.eventId as Brand<string, 'EventId'>,
  };

  return {
    envelope: withContext as TimedEnvelope<TPayload>,
    channel: outputChannel,
    score: result.score,
  };
};

export const expandByChannel = (tap: TapEnvelope, additional: readonly string[]): readonly TapEnvelope[] => {
  return [...additional, ...tapDefaults[tap.channel]].map((channel) => ({
    ...tap,
    channel: isObservabilityChannel(channel) ? channel : 'result',
  }));
};
