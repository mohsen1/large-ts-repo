import { StreamingDashboardFacade, DashboardFacadeResult, StreamTopologyPlan } from '@service/streaming-dashboard-orchestrator';
import {
  StreamEventRecord,
  StreamHealthSignal,
  SlaTarget,
  StreamSlaWindow,
  asTenantId,
} from '@domain/streaming-observability';

export interface StreamDashboardContext {
  tenant: string;
  streamId: string;
}

export interface StreamDashboardSnapshot {
  plan: StreamTopologyPlan;
  signals: StreamHealthSignal[];
  history: StreamSlaWindow[];
}

export interface StreamIngestEvent {
  streamId: string;
  events: StreamEventRecord[];
}

const defaultSlaTarget: SlaTarget = {
  streamId: 'default-stream',
  name: 'default',
  p95LatencyMs: 120,
  minAvailability: 0.98,
  minThroughputRatio: 0.8,
};

const facade = new StreamingDashboardFacade();

const buildOrchestrationInput = (
  context: StreamDashboardContext,
  payload: StreamIngestEvent,
): {
  tenant: string;
  streamId: string;
  events: StreamEventRecord[];
  rawSignals: StreamHealthSignal[];
  windowTargetMs: number;
  slaTarget: SlaTarget;
} => {
  const rawSignals: StreamHealthSignal[] = payload.events.map((event) => ({
    tenant: asTenantId(context.tenant),
    streamId: payload.streamId,
    level: event.severity >= 4 ? 'critical' : event.severity === 3 ? 'warning' : 'ok',
    score: event.severity / 5,
    details: [event.eventType],
    observedAt: event.sampleAt,
  }));
  return {
    tenant: context.tenant,
    streamId: payload.streamId,
    events: payload.events,
    rawSignals,
    windowTargetMs: 60_000,
    slaTarget: { ...defaultSlaTarget, streamId: payload.streamId, name: `${payload.streamId}-sla` },
  };
};

export const runDashboardOrchestration = async (
  context: StreamDashboardContext,
  payload: StreamIngestEvent,
): Promise<StreamDashboardSnapshot> => {
  const result = await facade.run(buildOrchestrationInput(context, payload));
  return {
    plan: result.plan,
    signals: buildOrchestrationInput(context, payload).rawSignals,
    history: [],
  };
};

export const runMultipleStreams = async (
  tenant: string,
  payloads: StreamIngestEvent[],
): Promise<DashboardFacadeResult['summary'] | null> => {
  const cursors = await facade.runSimulation(tenant, payloads.map((entry) => entry.streamId));
  if (cursors.length === 0) return null;
  const last = cursors[cursors.length - 1];
  const state = await facade.queryByStream(payloads[0]?.streamId ?? '');
  return {
    tenant,
    streamCount: state.total,
    critical: state.snapshots.filter((snapshot) => snapshot.healthSignals.some((signal) => signal.level === 'critical')).length,
    warnings: state.snapshots.filter((snapshot) => snapshot.healthSignals.some((signal) => signal.level === 'warning')).length,
    allSignals: state.snapshots.reduce((sum, snapshot) => sum + snapshot.healthSignals.length, 0),
    throughputByStream: Object.fromEntries(
      state.snapshots.map((snapshot) => [snapshot.streamId, snapshot.throughput.eventsPerSecond]),
    ),
  };
};
