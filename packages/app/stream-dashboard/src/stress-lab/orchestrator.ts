import { type StreamEventRecord } from '@domain/streaming-observability';
import { createSignalId, type RecoverySignal, type RecoverySignalId } from '@domain/recovery-stress-lab';
import { NoInfer } from '@shared/type-level';
import { runDashboardOrchestration } from '../services/streamDashboardService';
import {
  type LabRunId,
  type StreamLabExecutionReport,
  type StreamLabRequest,
  type StreamLabScoredRun,
  type StreamLabExecutionResult,
  type RecommendationShape,
  type StageRouteTuple,
  normalizeTenant,
} from './types';
import { type StressLabStackInput, STREAMLAB_CONFIGURATION } from './plugin-catalog';
import { createLabRegistry } from './plugin-registry';

type RecoverySeverity = RecoverySignal['severity'];

type EventPayload = { streamId: string; events: StreamEventRecord[] };

export const buildRequest = (tenantId: string, streamId: string, route: StageRouteTuple): StreamLabRequest => ({
  tenantId: normalizeTenant(tenantId),
  streamId,
  runbooks: [],
  signals: [],
  route,
  options: {
    useAdaptiveScale: STREAMLAB_CONFIGURATION.channel.profile === 'adaptive',
    includeDiagnostics: true,
    pluginOrder: ['ingest-plugin', 'policy-plugin', 'topology-plugin'],
    maxExecutionMs: 12_000,
  },
});

const normalizeEventType = (value: RecoverySignal['class']): StreamEventRecord['eventType'] => {
  switch (value) {
    case 'availability':
      return 'failure';
    case 'integrity':
      return 'recovery';
    case 'performance':
      return 'throughput-shift';
    case 'compliance':
      return 'rebalance';
    default:
      return 'lag-rise';
  }
};

const normalizeSeverity = (severity: RecoverySeverity): number => {
  switch (severity) {
    case 'critical':
      return 5;
    case 'high':
      return 4;
    case 'medium':
      return 3;
    case 'low':
    default:
      return 2;
  }
};

const toDashboardPayload = (request: StreamLabRequest): EventPayload => {
  const events = request.signals
    .toSorted((left, right) => normalizeSeverity(left.severity) - normalizeSeverity(right.severity))
    .slice(0, 4)
    .map((signal) => ({
      tenant: String(request.tenantId),
      streamId: request.streamId,
      eventType: normalizeEventType(signal.class),
      latencyMs: normalizeSeverity(signal.severity) * 5,
      sampleAt: signal.createdAt,
      metadata: Object.fromEntries(
        Object.entries(signal.metadata).map(([key, value]) => [key, JSON.stringify(value)]),
      ),
      severity: normalizeSeverity(signal.severity),
      eventId: signal.id,
    }));

  return {
    streamId: request.streamId,
    events,
  };
};

const scoreFromRecommendations = (recommendations: readonly string[]): StreamLabScoredRun => ({
  runId: `${recommendations.length}-${recommendations.join(':')}` as LabRunId,
  tenantId: normalizeTenant(`tenant-${recommendations.length}`),
  streamId: `stream-${recommendations.length}`,
  rankedSignals: recommendations.map((recommendation, index) => ({
    signalId: createSignalId(`${index}-${recommendation}`) as RecoverySignalId,
    className: index % 2 === 0 ? 'availability' : 'performance',
    level: index < 2 ? 'critical' : 'warning',
    score: Math.max(0.1, 1 - index * 0.04),
    details: [recommendation],
  })),
  topologyDigest: recommendations.join('|'),
  metrics: {
    score: recommendations.length / Math.max(1, recommendations.length),
    riskLevel: recommendations.length > 5 ? 'critical' : 'low',
    alertCount: recommendations.length * 2,
  },
});

export const runStreamLabSession = async <TRequest extends StreamLabRequest>(
  request: NoInfer<TRequest>,
): Promise<StreamLabExecutionReport<TRequest>> => {
  const requestEnvelope = {
    request,
    runId: `${request.tenantId}-${request.streamId}` as LabRunId,
    startedAt: new Date().toISOString(),
  };

  const { registry } = await createLabRegistry(request);
  try {
    const input: StressLabStackInput = {
      tenantId: request.tenantId,
      streamId: request.streamId,
      signals: request.signals,
      context: STREAMLAB_CONFIGURATION.channel,
    };

    const result = await registry.execute(input);
    const recommendations = result.chainOutput.recommendations.map(
      (entry) => `${entry.runbook}:${entry.confidence.toFixed(3)}`,
    );
    const scored = scoreFromRecommendations(recommendations);

    await runDashboardOrchestration(
      {
        tenant: String(request.tenantId),
        streamId: request.streamId,
      },
      toDashboardPayload(request),
    );

    return {
      request: requestEnvelope,
      result: result.snapshot,
      chainOutput: result.chainOutput as RecommendationShape,
      metrics: scored,
      recommendationCount: recommendations.length,
      traces: result.traces,
    };
  } finally {
    await registry[Symbol.asyncDispose]();
  }
};

export const buildDefaultStreamLabRequest = (tenantId: string, streamId: string): StreamLabRequest => ({
  tenantId: normalizeTenant(tenantId),
  streamId,
  runbooks: [],
  signals: [],
  route: ['seed', 'normalize'],
  options: {
    useAdaptiveScale: true,
    includeDiagnostics: true,
    pluginOrder: ['ingest-plugin', 'policy-plugin', 'topology-plugin'],
    maxExecutionMs: 15_000,
  },
});
