import type {
  WorkflowTemplate,
  WorkflowInstance,
  WorkflowRun,
  WorkflowTemplateId,
  WorkflowInstanceId,
} from '@domain/recovery-incident-workflows';
import type {
  IncidentRecord,
  IncidentPlanId,
  IncidentId,
} from '@domain/recovery-incident-orchestration';
import type { WorkflowStoreRecord, WorkflowRunRecord } from './types';
import { buildWorkflowRunId } from '@domain/recovery-incident-workflows';

export interface IncomingBundle {
  readonly template: WorkflowTemplate;
  readonly instance: {
    id: WorkflowInstanceId;
    templateId: WorkflowTemplateId;
    status: WorkflowInstance['status'];
    correlationId: string;
  };
  readonly runs: readonly {
    readonly nodeId: string;
    readonly result: WorkflowRun['result'];
  }[];
}

export const hydrateRecord = (
  incident: IncidentRecord,
  planId: IncidentPlanId,
  bundle: IncomingBundle,
): WorkflowStoreRecord => ({
  id: bundle.template.id,
  state: bundle.instance.status === 'running' ? 'active' : 'active',
  template: bundle.template,
  instance: {
    ...bundle.instance,
    planId,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activeNodeId: bundle.runs[0]?.nodeId,
    runIds: bundle.runs.map((run, index) => buildWorkflowRunId(String(bundle.template.id), run.nodeId, index)),
  },
  updatedAt: new Date().toISOString(),
  incidents: [incident.id],
  planId,
});

export const createRunRecord = (
  incidentId: IncidentId,
  run: WorkflowRun,
): WorkflowRunRecord => ({
  id: `${incidentId}:${run.id}`,
  planId: String(incidentId).includes('plan')
    ? incidentId as unknown as IncidentPlanId
    : (`fallback-${incidentId}` as unknown as IncidentPlanId),
  runId: run.id,
  instanceId: run.instanceId,
  run,
  status: run.result,
});
