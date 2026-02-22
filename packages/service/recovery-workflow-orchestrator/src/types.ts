import type { IncidentId, IncidentRecord, IncidentPlanId } from '@domain/recovery-incident-orchestration';
import type { WorkflowBundle, WorkflowTemplate, WorkflowInstance, WorkflowRun } from '@domain/recovery-incident-workflows';

export interface OrchestratorOptions {
  readonly tenantId: string;
  readonly namespace: string;
  readonly maxConcurrentWorkflows: number;
}

export interface PlanInput {
  readonly incidentId: IncidentId;
  readonly forceRebuild: boolean;
  readonly correlationId: string;
}

export interface RunInput {
  readonly incidentId: IncidentId;
  readonly workflowId: string;
  readonly runNodeId: string;
}

export interface WorkflowPlanResult {
  readonly ok: boolean;
  readonly workflow: WorkflowBundle;
  readonly diagnostics: readonly string[];
}

export interface WorkflowRunResult {
  readonly ok: boolean;
  readonly incidentId: IncidentId;
  readonly planId: IncidentPlanId;
  readonly runSummaries: readonly {
    readonly runId: WorkflowRun['id'];
    readonly state: WorkflowRun['result'];
    readonly nodeId: WorkflowRun['nodeId'];
  }[];
  readonly errors: readonly string[];
}

export interface WorkflowSnapshot {
  readonly tenantId: string;
  readonly namespace: string;
  readonly activeWorkflows: number;
  readonly templateCount: number;
}

export interface IncidentContext {
  readonly incident: IncidentRecord;
  readonly planId: IncidentPlanId;
}

export interface PreparedTemplate {
  readonly template: WorkflowTemplate;
  readonly instance: WorkflowInstance;
}
