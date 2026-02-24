import type { IncidentRecord } from '@domain/incident-management';

export interface IncidentManagementViewFilters {
  tenantId: string;
  includeResolved: boolean;
  severities: readonly IncidentRecord['triage']['severity'][];
  windowMinutes: number;
}

export interface IncidentManagementSummary {
  readonly tenantId: string;
  readonly totalOpen: number;
  readonly totalCritical: number;
  readonly avgReadiness: number;
  readonly alertCount: number;
}

export interface IncidentManagementWorkspaceState {
  readonly loading: boolean;
  readonly summary: IncidentManagementSummary;
  readonly incidents: readonly IncidentRecord[];
  readonly alerts: readonly string[];
}

export interface IncidentManagementActions {
  readonly refresh: (tenantId: string) => Promise<void>;
  readonly acknowledge: (incidentId: string) => void;
}
