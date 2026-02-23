import { Brand } from '@shared/core';
import { StreamId } from '@domain/streaming-engine';

export type StreamHealthLevel = 'ok' | 'warning' | 'critical';

export type StreamTenantId = Brand<string, 'StreamTenantId'>;
export type WindowId = Brand<string, 'WindowId'>;
export type RunId = Brand<string, 'RunId'>;

export interface TimeWindow {
  start: number;
  end: number;
}

export interface StreamHealthSignal {
  tenant: StreamTenantId;
  streamId: string;
  level: StreamHealthLevel;
  score: number;
  details: string[];
  observedAt: string;
}

export interface ThroughputRecord {
  streamId: string;
  eventsPerSecond: number;
  bytesPerSecond: number;
  inFlight: number;
  window: TimeWindow;
}

export interface RecoveryOperation {
  id: string;
  name: string;
  priority: number;
  expectedLatencyMs: number;
  recoveryCost: number;
}

export interface StreamTopologyAlert {
  nodeId: string;
  code: string;
  message: string;
  severity: 1 | 2 | 3 | 4 | 5;
}

export interface StreamSlaWindow {
  windowId: WindowId;
  window: TimeWindow;
  targetMs: number;
  actualMs: number;
  violated: boolean;
}

export interface StreamSnapshot {
  id: string;
  tenant: StreamTenantId;
  streamId: string;
  capturedAt: string;
  lag: number;
  window: TimeWindow;
  throughput: ThroughputRecord;
  alerts: StreamTopologyAlert[];
  signals: StreamHealthSignal[];
}

export type HealthDistribution = Record<StreamHealthLevel, number>;

export interface RunMetadata {
  runId: RunId;
  createdAt: string;
  region: string;
  source: string;
  tenant: StreamTenantId;
}

export type RecoveryPriority = RecoveryOperation['priority'];
export type RunHealthEnvelope = Record<string, unknown> & Brand<Record<string, unknown>, 'RunHealthEnvelope'>;

export interface TopologyFingerprint {
  nodes: string[];
  edges: ReadonlyArray<{ from: string; to: string }>;
  checksum: string;
}

export const asStreamId = (value: string): StreamId => value as StreamId;
export const asTenantId = (value: string): StreamTenantId => value as StreamTenantId;
export const asWindowId = (value: string): WindowId => value as WindowId;
export const asRunId = (value: string): RunId => value as RunId;

export const computeSignalDensity = (signals: StreamHealthSignal[]): number =>
  signals.reduce((acc, signal) => acc + signal.score, 0) / Math.max(signals.length, 1);

export const summarizeLevels = (signals: StreamHealthSignal[]): HealthDistribution => {
  const accumulator: HealthDistribution = { ok: 0, warning: 0, critical: 0 };
  for (const signal of signals) {
    accumulator[signal.level] += 1;
  }
  return accumulator;
};
