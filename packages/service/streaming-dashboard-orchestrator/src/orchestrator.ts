import { createTopology, plan, scale } from '@domain/streaming-engine';
import { NodeId } from '@shared/core';
import {
  StreamEventRecord,
  StreamHealthSignal,
  SlaTarget,
  StreamTopologyAlert,
  StreamSnapshot,
  StreamSlaWindow,
  asStreamId,
  asTenantId,
  asWindowId,
  aggregateHealthScore,
  evaluateSla,
  forecastThroughput,
  validateTopology,
  defaultPolicySnapshot,
  evaluatePolicy,
} from '@domain/streaming-observability';
import { InMemoryStreamingDashboardRepository, upsertSnapshot, loadViewModel } from '@data/streaming-dashboard-store';
import { ok, fail, Result } from '@shared/result';

export interface OrchestrationInput {
  tenant: string;
  streamId: string;
  events: StreamEventRecord[];
  rawSignals: StreamHealthSignal[];
  windowTargetMs: number;
  slaTarget: SlaTarget;
}

export interface StreamTopologyPlan {
  streamId: string;
  topologyAlerts: StreamTopologyAlert[];
  planSteps: ReturnType<typeof plan>['steps'];
  expectedScale: number;
  slaCompliant: boolean;
  snapshotId: string;
}

const createTopologyForStream = (streamId: string) => {
  const topology = createTopology(
    {
      id: asStreamId(streamId),
      partitions: [
        { id: 'p-0', startOffset: 0, endOffset: 1_000 },
      ],
      createdAt: new Date(),
    },
    [
      { id: 'source', kind: 'source', options: { protocol: 'kinesis' } },
      { id: 'transform', kind: 'transform', options: { protocol: 'enrich' } },
      { id: 'sink', kind: 'sink', options: { protocol: 's3' } },
    ],
    [
      { from: 'source', to: 'transform' },
      { from: 'transform', to: 'sink' },
    ],
  );
  const mapped = {
    streamId,
    nodes: [
      { id: 'source' as NodeId, label: 'source', owner: 'platform', criticality: 'low' as const },
      { id: 'transform' as NodeId, label: 'transform', owner: 'platform', criticality: 'medium' as const },
      { id: 'sink' as NodeId, label: 'sink', owner: 'platform', criticality: 'critical' as const },
    ],
    edges: [
      { from: 'source' as NodeId, to: 'transform' as NodeId, throughputWeight: 1, isEncrypted: true },
      { from: 'transform' as NodeId, to: 'sink' as NodeId, throughputWeight: 1, isEncrypted: true },
    ],
  };
  return { topology, validationAlerts: validateTopology(mapped), partitionCount: topology.stream.partitions.length };
};

const toWindow = (start: number, durationMs: number): StreamSlaWindow => ({
  windowId: asWindowId(`w-${start}`),
  window: { start, end: start + durationMs },
  targetMs: 120,
  actualMs: 100,
  violated: false,
});

const signalHealth = (input: OrchestrationInput): StreamHealthSignal[] =>
  input.rawSignals.map((signal) => ({
    ...signal,
    observedAt: signal.observedAt ?? new Date().toISOString(),
  }));

export const runOrchestration = async (
  input: OrchestrationInput,
  repository: InMemoryStreamingDashboardRepository,
): Promise<Result<StreamTopologyPlan, Error>> => {
  const start = Date.now();
  const buildResult = createTopologyForStream(input.streamId);
  const basePlan = plan(createTopology({
    id: asStreamId(input.streamId),
    partitions: [{ id: 'fallback', startOffset: 0, endOffset: 100 }],
    createdAt: new Date(),
  }, [
    { id: 'source', kind: 'source', options: {} },
    { id: 'sink', kind: 'sink', options: {} },
  ], [
    { from: 'source', to: 'sink' },
  ]), {
    eventsPerSecond: 100,
    bytesPerSecond: 1000,
  });
  const scaledPlan = scale(basePlan, Math.max(1, Math.round(aggregateHealthScore(input.events) * 2)));
  const forecast = forecastThroughput({
    streamId: input.streamId,
    history: [
      {
        streamId: input.streamId,
        eventsPerSecond: 180,
        bytesPerSecond: 2300,
        inFlight: 10,
        window: { start: start - 60_000, end: start },
      },
      {
        streamId: input.streamId,
        eventsPerSecond: 190,
        bytesPerSecond: 2500,
        inFlight: 11,
        window: { start: start - 30_000, end: start },
      },
    ],
    targetWindowMs: input.windowTargetMs,
  });

  const signals = signalHealth(input);
  const slaContext = { windows: [toWindow(start, input.windowTargetMs)], signals };
  const slaResult = evaluateSla(slaContext, input.slaTarget);
  const policy = evaluatePolicy(defaultPolicySnapshot(), { alerts: buildResult.validationAlerts, signals });

  const snapshot: StreamSnapshot = {
    id: `${input.streamId}:${start}`,
    tenant: asTenantId(input.tenant),
    streamId: input.streamId,
    capturedAt: new Date(start).toISOString(),
    lag: Math.max(0, input.events.reduce((acc, event) => acc + event.severity, 0) - 2),
    window: { start, end: start + input.windowTargetMs },
    throughput: {
      streamId: input.streamId,
      eventsPerSecond: forecast.predictedEventsPerSecond,
      bytesPerSecond: 2000,
      inFlight: scaledPlan.steps.reduce((acc, step) => acc + step.parallelism, 0),
      window: { start, end: start + input.windowTargetMs },
    },
    alerts: [
      ...buildResult.validationAlerts,
      ...(policy.requiresEscalation
        ? [{
          nodeId: input.streamId,
          code: 'POLICY',
          message: policy.rationale.join('|') || 'policy escalation requested',
          severity: 4 as const,
        }]
        : []),
    ],
    signals,
  };

  const persisted = await upsertSnapshot(repository, {
    id: snapshot.id,
    tenant: snapshot.tenant,
    streamId: snapshot.streamId,
    capturedAt: snapshot.capturedAt,
    lag: snapshot.lag,
    healthSignals: signals,
    throughput: {
      eventsPerSecond: snapshot.throughput.eventsPerSecond,
      bytesPerSecond: snapshot.throughput.bytesPerSecond,
      inFlight: snapshot.throughput.inFlight,
    },
    alerts: snapshot.alerts,
    plannedSteps: scaledPlan.steps,
    topologyId: asStreamId(input.streamId) as unknown as NodeId,
    slaWindows: [toWindow(start, input.windowTargetMs)],
  });
  if (!persisted.ok) {
    return fail(persisted.error);
  }

  const planView = loadViewModel({
    id: snapshot.id,
    tenant: snapshot.tenant,
    streamId: snapshot.streamId,
    capturedAt: snapshot.capturedAt,
    lag: snapshot.lag,
    healthSignals: signals,
    throughput: {
      eventsPerSecond: snapshot.throughput.eventsPerSecond,
      bytesPerSecond: snapshot.throughput.bytesPerSecond,
      inFlight: snapshot.throughput.inFlight,
    },
    alerts: snapshot.alerts,
    plannedSteps: scaledPlan.steps,
    topologyId: asStreamId(input.streamId) as unknown as NodeId,
    slaWindows: [toWindow(start, input.windowTargetMs)],
  });

  return ok({
    streamId: input.streamId,
    topologyAlerts: snapshot.alerts,
    planSteps: scaledPlan.steps,
    expectedScale: forecast.recommendedParallelism,
    slaCompliant: slaResult.compliant && !policy.requiresEscalation,
    snapshotId: snapshot.id,
  });
};
