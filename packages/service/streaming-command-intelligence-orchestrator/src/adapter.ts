import { StreamHealthSignal, asStreamId } from '@domain/streaming-observability';
import {
  asCommandEnvelopeId,
  asCommandPlanId,
  asCommandPluginId,
  asCommandStepId,
  asCommandTag,
  asCommandTraceId,
  asCommandTenantId,
  asCommandResultId,
  CommandNamespace,
  CommandPlan,
  CommandRunResult,
  CommandSignalContext,
  CommandSignalEnvelope,
  CommandSignalRecord,
  CommandTenantId,
  StreamCommandPluginId,
  CommandPlanId,
} from '@domain/streaming-command-intelligence';
import { appendSignal, CommandIntelligenceEvent } from '@data/streaming-command-intelligence-store';
import type { CommandIntelligenceRecord } from '@data/streaming-command-intelligence-store';

type HealthSignalInput = {
  readonly tenantId: string;
  readonly streamId: string;
  readonly namespace: CommandNamespace;
  readonly traceId: string;
  readonly observedAt: string;
  readonly score: number;
  readonly severity: number;
  readonly signals: readonly StreamHealthSignal[];
};

export interface DomainSignalAdapter {
  toDomainSignal(input: HealthSignalInput): CommandSignalEnvelope;
}

export const adaptSignal = (input: HealthSignalInput): CommandSignalEnvelope => {
  const traceId = asCommandTraceId(input.traceId);
  return {
    tenantId: asCommandTenantId(input.tenantId),
    streamId: asStreamId(input.streamId),
    namespace: input.namespace,
    envelopeId: asCommandEnvelopeId(`${input.traceId}:${Date.now()}`),
    traceId,
    pluginKind: `${input.namespace}-plugin`,
    tags: [
      asCommandTag('adapted'),
      asCommandTag(`score:${input.score.toFixed(2)}`),
      asCommandTag(`severity:${Math.round(input.severity)}`),
      asCommandTag('pipeline'),
    ],
    seenAt: input.observedAt,
    payload: {
      score: input.score,
      severity: input.severity,
    },
    context: {
      pluginId: asCommandPluginId(`adapter:${input.namespace}`),
      pluginName: 'streaming-command-adapter',
      latencyMs: input.signals.length * 2,
      status: 'succeeded',
      runId: asCommandPlanId(`adapter:${input.traceId}`),
      message: 'command-signal-adapter',
    },
    signals: [...input.signals],
    metadata: {
      source: 'streaming-command-intelligence-adapter',
      observedAt: input.observedAt,
    },
  };
};

export interface StoreAdapterInput {
  readonly runId: CommandPlanId;
  readonly tenantId: CommandTenantId;
  readonly streamId: string;
  readonly plan: CommandPlan;
  readonly result: CommandRunResult;
  readonly events: readonly CommandSignalRecord[];
}

export const toStoreRecord = (input: StoreAdapterInput): CommandIntelligenceRecord => {
  const now = new Date().toISOString();

  const storeEvents: CommandIntelligenceEvent[] = input.events.map((event, index) => {
    const [pluginId, pluginName, stepId] = event.context;
    const payload = event.payload ?? {};
    return {
      eventId: `${input.runId}:${index}`,
      tenantId: event.tenantId,
      streamId: event.streamId,
      traceId: input.result.traceId,
      pluginId,
      pluginName,
      stepId,
      signalCount: Object.keys(payload).length,
      at: now,
      signals: [],
    };
  });

  return {
    runId: input.runId,
    tenantId: input.tenantId,
    streamId: asStreamId(input.streamId),
    context: {
      tenantId: input.tenantId,
      streamId: asStreamId(input.streamId),
      planId: input.plan.planId,
      status: input.result.status,
      startedAt: typeof input.result.metadata?.['startedAt'] === 'string' ? input.result.metadata['startedAt'] : now,
      commandCount: input.plan.plugins.length,
    },
    result: {
      ...input.result,
      resultId: asCommandResultId(input.result.resultId),
      streamId: asStreamId(input.streamId),
      traceId: asCommandTraceId(String(input.result.traceId)),
    },
    plan: input.plan,
    events: storeEvents,
    updatedAt: now,
  };
};

export const toCommandSignalRecord = (value: {
  readonly tenantId: string;
  readonly streamId: string;
  readonly namespace: CommandNamespace;
  readonly traceId: string;
  readonly pluginId: string;
  readonly pluginName: string;
  readonly stepId: string;
  readonly payload: Record<string, unknown>;
}): CommandSignalRecord => ({
  envelopeId: asCommandEnvelopeId(`${value.traceId}:${value.stepId}`),
  tenantId: asCommandTenantId(value.tenantId),
  streamId: asStreamId(value.streamId),
  namespace: value.namespace,
  payload: value.payload,
  context: [asCommandPluginId(value.pluginId), value.pluginName, asCommandStepId(value.stepId)],
});

export interface StoreCommandSignalAdapter {
  collectStoreSignals(event: ReturnType<typeof appendSignal>): Promise<CommandIntelligenceEvent>;
}

export const collectStoreSignals = async (event: {
  readonly envelopeId: string;
  readonly tenantId: string;
  readonly streamId: string;
  readonly payload: Record<string, unknown>;
  readonly namespace: string;
  readonly context: readonly [string, string, string];
}): Promise<CommandIntelligenceEvent> => ({
  eventId: event.envelopeId,
  tenantId: asCommandTenantId(event.tenantId),
  streamId: asStreamId(event.streamId),
  traceId: asCommandTraceId(event.context[2]),
  pluginId: asCommandPluginId(event.context[0]),
  pluginName: event.context[1],
  stepId: asCommandStepId(event.context[2]),
  signalCount: Object.keys(event.payload).length,
  at: new Date().toISOString(),
  signals: [],
});

export const enrichSignalContext = (value: CommandSignalRecord): CommandSignalContext => ({
  pluginId: value.context[0],
  pluginName: value.context[1],
  latencyMs: undefined,
  status: 'succeeded',
  runId: value.context[2] as unknown as CommandPlanId,
  message: `index:${value.envelopeId}`,
});
