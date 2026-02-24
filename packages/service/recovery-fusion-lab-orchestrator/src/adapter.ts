import {
  createRunEnvelope,
  createTopologySignature,
  formatMetricSeries,
} from '@domain/recovery-fusion-lab-core';

import type {
  FusionLabExecutionRequest,
  FusionLabExecutionResult,
  LabTimelineFrame,
  WorkspaceExecutionOptions,
} from './types';

export interface RecoveryAdapter {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly bootstrap: (request: FusionLabExecutionRequest) => Promise<FusionLabExecutionResult>;
  readonly summarize: (frames: readonly string[]) => string;
  readonly dispose?: () => Promise<void> | void;
}

export interface AdapterFactory {
  readonly id: string;
  readonly create: (enabled: boolean) => RecoveryAdapter;
}

export interface AdapterConfig {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export const resolveAdapters = (
  options: WorkspaceExecutionOptions,
  request: FusionLabExecutionRequest,
): RecoveryAdapter[] => {
  const adapters: RecoveryAdapter[] = [
    {
      id: 'default-telemetry',
      name: 'Default telemetry',
      enabled: options.includeTelemetry,
      bootstrap: async (input): Promise<FusionLabExecutionResult> => ({
        runId: input.topology.runId,
        status: input.mode === 'historical' ? 'completed' : 'running',
        waves: [],
        signals: [],
        commands: [],
        metrics: [],
        summary: {
          runId: input.topology.runId,
          totalSignals: 0,
          criticalSignals: 0,
          commandCount: 0,
          medianSignalLatencyMs: 0,
          riskDelta: 0,
          confidence: 0,
          telemetry: [],
        },
        commandTrace: [],
        traceDigest: 'adapter:default-telemetry',
      }),
      summarize: (frames) => formatMetricSeries([]) + `|frames:${frames.length}`,
    },
    {
      id: 'topology-audit',
      name: 'Topology audit',
      enabled: options.useTopLevelBootstrap,
      bootstrap: async (input): Promise<FusionLabExecutionResult> => ({
        runId: input.topology.runId,
        status: 'completed',
        waves: [],
        signals: [],
        commands: [],
        metrics: [],
        summary: {
          runId: input.topology.runId,
          totalSignals: 0,
          criticalSignals: 0,
          commandCount: 0,
          medianSignalLatencyMs: 0,
          riskDelta: 0,
          confidence: 0,
          telemetry: [],
        },
        commandTrace: [],
        traceDigest: createTopologySignature(input.topology.nodes.map((node) => node.id)),
      }),
      summarize: (frames) => createTopologySignature(frames),
    },
    {
      id: 'payload-envelope',
      name: 'Payload envelope',
      enabled: true,
      bootstrap: async (input): Promise<FusionLabExecutionResult> => {
        const events = framesFromInput(input);
        return {
          runId: input.topology.runId,
          status: 'running',
          waves: [],
          signals: [],
          commands: [],
          metrics: [],
          summary: {
            runId: input.topology.runId,
            totalSignals: 0,
            criticalSignals: 0,
            commandCount: 0,
            medianSignalLatencyMs: 0,
            riskDelta: 0,
            confidence: 0,
            telemetry: events.map((event) => ({
              path: `metric:adapter:${event}`,
              value: event.length,
              unit: 'count',
              source: requestId(input),
              createdAt: new Date().toISOString(),
            })),
          },
          commandTrace: events,
          traceDigest: createRunEnvelope(events),
        };
      },
      summarize: (frames) => frames.map((frame) => frame).join('|'),
    },
  ];

  return adapters.filter((adapter) => adapter.enabled);
};

export const parseAdapterConfig = (raw: unknown): AdapterConfig[] => {
  if (Array.isArray(raw)) {
    return raw
      .filter(
        (item): item is { readonly id: string; readonly name: string; readonly enabled?: boolean } =>
          typeof item === 'object' && item !== null && 'id' in item && 'name' in item,
      )
      .map((item) => ({ id: item.id, name: item.name, enabled: item.enabled ?? true }));
  }

  if (typeof raw === 'object' && raw !== null) {
    return [];
  }

  return [];
};

export const filterAdapters = (
  options: WorkspaceExecutionOptions,
  request: FusionLabExecutionRequest,
): RecoveryAdapter[] => resolveAdapters(options, request);

export const flushAdapters = async (adapters: readonly RecoveryAdapter[]): Promise<void> => {
  for (const adapter of adapters) {
    await adapter.dispose?.();
  }
};

export const describeAdapters = (adapters: readonly RecoveryAdapter[]): readonly string[] =>
  adapters.map((adapter) => `${adapter.id}::${adapter.name}`);

export const summarizeAdapters = (adapters: readonly RecoveryAdapter[], frames: readonly LabTimelineFrame[]): string => {
  const flattened = adapters.map((adapter) => `${adapter.summarize(frames.map((frame) => frame.event))}`).join('\n');
  return flattened;
};

const framesFromInput = (request: FusionLabExecutionRequest): readonly string[] =>
  request.topology.nodes
    .map((node, index) => `${request.workspaceId}:${request.context.workspace}:${node.id}:${index}`)
    .filter((frame) => frame.length > 0)
    .toSorted();

const requestId = (request: FusionLabExecutionRequest): string =>
  `${request.workspaceId}::${request.context.workspace}::${request.mode}`;
