import type {
  IncidentRecord,
  IncidentPlan,
  OrchestrationRun,
  IncidentId,
} from '@domain/recovery-incident-orchestration';
import type { OrchestrateResult } from '@service/recovery-incident-orchestrator';

export interface DashboardIncident extends IncidentRecord {
  readonly lastSeenAt: string;
  readonly runCount: number;
}

export interface DashboardPlanState {
  readonly planId: IncidentPlan['id'];
  readonly incidentId: IncidentId;
  readonly title: string;
  readonly approved: boolean;
  readonly runCount: number;
}

export interface DashboardRunState {
  readonly planId: IncidentPlan['id'];
  readonly runId: OrchestrationRun['id'];
  readonly nodeId: OrchestrationRun['nodeId'];
  readonly state: OrchestrationRun['state'];
  readonly startedAt: string;
}

export interface DashboardState {
  readonly incidents: readonly DashboardIncident[];
  readonly plans: readonly DashboardPlanState[];
  readonly runs: readonly DashboardRunState[];
  readonly status: 'idle' | 'loading' | 'error' | 'ready';
  readonly errors: readonly string[];
}

export interface DashboardActions {
  readonly refresh: () => Promise<void>;
  readonly execute: (incidentId: IncidentId) => Promise<void>;
  readonly promote: (planId: IncidentPlan['id']) => Promise<void>;
}

export type DashboardPayload = {
  readonly source: OrchestrateResult;
  readonly startedAt: string;
};
