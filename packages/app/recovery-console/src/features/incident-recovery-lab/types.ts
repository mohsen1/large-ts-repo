import { IncidentRecord } from '@domain/incident-management';

export interface RecoveryLabScenario {
  readonly id: string;
  readonly title: string;
  readonly tenantId: string;
  readonly serviceId: string;
  readonly incidents: readonly IncidentRecord[];
  readonly selectedIncidentId?: string;
  readonly riskThreshold: number;
  readonly createdAt: string;
}

export interface RecoveryLabHistoryItem {
  readonly id: string;
  readonly tenantId: string;
  readonly scenarioId: string;
  readonly step: string;
  readonly status: 'running' | 'completed' | 'errored' | 'paused';
  readonly startedAt: string;
  readonly durationMs: number;
  readonly details: Record<string, unknown>;
}
