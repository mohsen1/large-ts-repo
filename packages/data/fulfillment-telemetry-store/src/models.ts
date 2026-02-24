import { Brand } from '@shared/core';

export type TelemetryRunId = Brand<string, 'TelemetryRunId'>;
export type TelemetryWindowId = Brand<string, 'TelemetryWindowId'>;

export interface ThroughputSample {
  tenantId: string;
  orderId: string;
  measuredAt: string;
  plannedWorkers: number;
  activeWorkers: number;
  fulfillmentRate: number;
  ttrMs: number;
  slaBreaches: number;
}

export interface TelemetryWindow {
  tenantId: string;
  windowId: TelemetryWindowId;
  startAt: string;
  endAt: string;
  strategy: string;
  demandUnits: number;
  backlogUnits: number;
  workerUtilization: number;
  createdAt: string;
}

export interface TelemetryAlert {
  id: Brand<string, 'TelemetryAlertId'>;
  tenantId: string;
  runId: TelemetryRunId;
  severity: 'info' | 'warning' | 'critical';
  metric: 'ttr' | 'utilization' | 'backlog' | 'breach';
  message: string;
  createdAt: string;
}

export interface OrchestratorHistory {
  runId: TelemetryRunId;
  tenantId: string;
  startedAt: string;
  completedAt?: string;
  status: 'queued' | 'running' | 'stable' | 'degraded' | 'failed';
  windows: readonly TelemetryWindow[];
  alerts: readonly TelemetryAlert[];
}

export interface TelemetryEnvelope {
  runId: TelemetryRunId;
  tenantId: string;
  windows: readonly TelemetryWindow[];
  history: readonly OrchestratorHistory[];
  alerts: readonly TelemetryAlert[];
}
