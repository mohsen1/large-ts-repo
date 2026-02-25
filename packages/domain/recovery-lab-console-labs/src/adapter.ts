import { type Brand } from '@shared/type-level';
import {
  type ControlLabContext,
  type PluginResult,
  type ControlLabRuntimeEvent,
  type LabPluginId,
  type ControlLabTimeline,
  type LabRunId,
} from './types';

export type AdapterChannel<T extends string> = Brand<T, 'LabAdapterChannel'>;

export interface AdapterPayload<T> {
  readonly source: string;
  readonly value: T;
  readonly capturedAt: string;
}

export interface AdapterInput<T> {
  readonly event: T;
  readonly trace: string;
  readonly channel: AdapterChannel<string>;
}

export interface AdaptedPluginResult<T> {
  readonly ok: boolean;
  readonly payload: T;
  readonly channel: AdapterChannel<string>;
}

export const buildAdapterChannel = <T extends string>(value: T): AdapterChannel<T> => value as AdapterChannel<T>;

export const adaptIncomingPayload = <T>(payload: AdapterPayload<T>, channel: string): AdapterPayload<T> => ({
  ...payload,
  source: `${payload.source}::${channel}`,
});

export const adaptOutgoingEnvelope = <T>(
  event: ControlLabRuntimeEvent<T>,
  channel: string,
): ControlLabRuntimeEvent<AdapterPayload<T>> => ({
  ...event,
  payload: {
    source: channel,
    value: event.payload,
    capturedAt: new Date().toISOString(),
  },
});

export const mapPluginResult = <T, TChannel extends string>(
  result: PluginResult<T>,
  channel: TChannel,
): AdaptedPluginResult<T> => ({
  ok: result.status !== 'failed',
  payload: result.output,
  channel: buildAdapterChannel(channel),
});

export const normalizeContextChannel = <TContext extends ControlLabContext>(context: TContext): TContext => ({
  ...context,
  signature: `${context.signature}::${Date.now()}`,
}) as TContext;

export const composeAdapter = <TInput, TOutput, TContext extends ControlLabContext>(
  context: TContext,
  plugin: { id: LabPluginId; name: string; run: (input: TInput, context: TContext) => Promise<PluginResult<TOutput>> },
  payload: TInput,
): AdapterInput<Promise<PluginResult<TOutput>>> => ({
  event: plugin.run(payload, context),
  trace: `${plugin.id}:${plugin.name}`,
  channel: buildAdapterChannel(`${context.tenantId}:${plugin.name}`),
});

export interface TimelineEnvelope {
  readonly runId: LabRunId;
  readonly startedAt: string;
  readonly pluginCount: number;
}

export const buildTimelineEnvelope = (timeline: ControlLabTimeline): TimelineEnvelope => ({
  runId: timeline.runId,
  startedAt: new Date().toISOString(),
  pluginCount: timeline.stages.length,
});
