import { PlanStep } from '@domain/streaming-engine';
import {
  StreamHealthSignal,
  StreamSnapshot,
  StreamTopologyAlert,
  StreamSlaWindow,
  StreamTenantId,
  asStreamId,
  TimeWindow,
  asTenantId,
} from '@domain/streaming-observability';
import { NodeId, withBrand } from '@shared/core';

export interface DashboardStreamSnapshot {
  id: string;
  tenant: StreamTenantId;
  streamId: string;
  capturedAt: string;
  lag: number;
  healthSignals: StreamHealthSignal[];
  throughput: {
    eventsPerSecond: number;
    bytesPerSecond: number;
    inFlight: number;
  };
  alerts: StreamTopologyAlert[];
  plannedSteps: PlanStep[];
  topologyId: NodeId;
  slaWindows: StreamSlaWindow[];
}

export interface DashboardQueryFilter {
  tenant?: StreamTenantId;
  streamId?: string;
  fromMs?: number;
  toMs?: number;
  withCriticalSignalsOnly?: boolean;
}

export interface DashboardQueryResult {
  total: number;
  snapshots: DashboardStreamSnapshot[];
}

export interface TenantSnapshotCursor {
  tenant: StreamTenantId;
  cursor: string;
}

export const toTenantId = (tenant: string): StreamTenantId => asTenantId(tenant);

export interface StreamTopologyStats {
  streamId: string;
  nodeCount: number;
  edgeCount: number;
}

export const fromStreamSnapshot = (snapshot: StreamSnapshot): DashboardStreamSnapshot => {
  return {
    id: snapshot.id,
    tenant: snapshot.tenant,
    streamId: snapshot.streamId,
    capturedAt: snapshot.capturedAt,
    lag: snapshot.lag,
    healthSignals: snapshot.signals,
    throughput: {
      eventsPerSecond: snapshot.throughput.eventsPerSecond,
      bytesPerSecond: snapshot.throughput.bytesPerSecond,
      inFlight: snapshot.throughput.inFlight,
    },
    alerts: snapshot.alerts,
    plannedSteps: [],
    topologyId: withBrand(snapshot.streamId, 'NodeId') as NodeId,
    slaWindows: snapshot.window ? [] : [],
  };
};

export const timeWindowForRange = (fromMs?: number, toMs?: number): TimeWindow => ({
  start: fromMs ?? 0,
  end: toMs ?? Date.now(),
});
