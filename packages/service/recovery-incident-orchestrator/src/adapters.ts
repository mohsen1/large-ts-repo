import type {
  IncidentId,
  IncidentRecord,
  IncidentPlan,
  OrchestrationRun,
  IncidentEvent,
} from '@domain/recovery-incident-orchestration';
import type { OrchestrateResult } from './runtime';

export interface UIEvent {
  readonly title: string;
  readonly createdAt: string;
  readonly payload: Record<string, unknown>;
}

export const toUiSummary = (incidentId: IncidentId): string => `incident:${incidentId}`;

export const toEvent = (plan: IncidentPlan, runs: readonly OrchestrationRun[]): IncidentEvent => ({
  id: `${plan.id}:event` as IncidentEvent['id'],
  incidentId: plan.incidentId,
  type: 'plan_added',
  details: {
    planId: plan.id,
    title: plan.title,
    runCount: runs.length,
  },
  createdAt: new Date().toISOString(),
});

export const summarizeOrchestratorResult = (result: OrchestrateResult): UIEvent => ({
  title: result.plan.title,
  createdAt: new Date().toISOString(),
  payload: {
    approved: result.approved,
    runCount: result.runs.length,
    incidentId: result.plan.incidentId,
  },
});

export interface IncidentPayload {
  readonly incidentId: IncidentId;
  readonly snapshot: Pick<IncidentRecord, 'title' | 'severity' | 'summary'>;
}
