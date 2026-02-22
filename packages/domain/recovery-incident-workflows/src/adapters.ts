import {
  type IncidentId,
  type IncidentPlanId,
  type IncidentRecord,
  type IncidentPriorityVector,
  type IncidentScope,
} from '@domain/recovery-incident-orchestration';
import {
  buildWorkflowTemplateId,
  buildWorkflowInstanceId,
  buildWorkflowRunId,
  type WorkflowTemplate,
  type WorkflowInstance,
  type WorkflowRun,
  type WorkflowBundle,
  type WorkflowPolicy,
  normalizeNodeId,
  type WorkflowNode,
} from './types';

const baseScope = (incident: IncidentRecord): IncidentScope => ({
  tenantId: incident.scope.tenantId,
  clusterId: incident.scope.clusterId,
  region: incident.scope.region,
  serviceName: incident.scope.serviceName,
});

const buildNode = (incident: IncidentRecord, index: number): WorkflowNode => {
  const kindList: WorkflowNode['kind'][] = ['signal', 'validation', 'mitigation', 'verification', 'closure'];
  const label = `Step ${index + 1}`;
  return {
    id: `${incident.id}:node-${index}`,
    label,
    kind: kindList[index % kindList.length],
    owner: `owner-${incident.scope.serviceName}`,
    command: `recovery-${index + 1}`,
    expectedDurationMinutes: 12 + index * 3,
    dependencies: index === 0
      ? []
      : [{
        prerequisiteId: `${incident.id}:node-${index - 1}`,
        timeoutMinutes: 8 + index,
        retryable: index % 2 === 0,
      }],
    metadata: {
      priority: incident.severity,
      label: normalizeNodeId({
        id: `${incident.id}:node-${index}`,
        label: `${incident.id}:${index}`,
        kind: kindList[index % kindList.length],
        owner: incident.scope.serviceName,
        command: 'init',
        expectedDurationMinutes: 1,
        dependencies: [],
        metadata: {},
      }),
      severityScore: String(incident.id),
    },
  };
};

export const buildTemplatePreview = (raw: {
  readonly incidentId: string;
  readonly title?: string;
  readonly description?: string;
  readonly policy?: WorkflowPolicy;
}): WorkflowTemplate => {
  const incidentId = raw.incidentId as IncidentId;
  const scope = baseScope({
    id: incidentId,
    title: raw.title ?? 'Recovered Incident',
    scope: {
      tenantId: 'tenant-ops',
      clusterId: 'cluster-01',
      region: 'us-east-1',
      serviceName: 'recovery-dashboard',
    },
    severity: 'medium',
    summary: raw.description ?? 'automated workstream',
    labels: ['generated', 'workflow-template'],
    openedAt: new Date().toISOString(),
    detectedAt: new Date().toISOString(),
    snapshots: [],
    signals: [],
    metadata: {},
    resolvedAt: undefined,
  });

  const priority = {
    compositeScore: 28,
    reason: 'fallback',
    factors: {},
  } as unknown as IncidentPriorityVector;
  const seedIncident = {
    id: incidentId,
    title: raw.title ?? 'Recovered Incident',
    scope,
    severity: 'medium',
    summary: raw.description ?? 'automated workstream',
    labels: ['generated', 'workflow-template'],
    openedAt: new Date().toISOString(),
    detectedAt: new Date().toISOString(),
    snapshots: [],
    signals: [],
    metadata: {},
    resolvedAt: undefined,
  } as unknown as IncidentRecord;
  const routeNodes = [buildNode(seedIncident, 0)];
  const template: WorkflowTemplate = {
    id: buildWorkflowTemplateId(incidentId, Date.now() % 1000),
    incidentId,
    title: raw.title ?? `workflow-${raw.incidentId}`,
    description: raw.description ?? 'automated workstream',
    scope,
    priorityVector: priority,
    route: {
      id: `${incidentId}:route`,
      nodes: [
        ...routeNodes,
        buildNode({ ...scope, id: `${incidentId}:node` as IncidentId } as unknown as IncidentRecord, 1),
        buildNode({ ...scope, id: `${incidentId}:node` as IncidentId } as unknown as IncidentRecord, 2),
      ],
      owner: scope.serviceName,
      slaWindowMinutes: 180,
      riskWeight: 0.35,
      tags: ['recovery', 'synthetic'],
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'draft',
  };
  void raw.policy;
  return template;
};

export const buildBundleFromIncident = (
  incident: IncidentRecord,
  planId: IncidentPlanId,
): WorkflowBundle => {
  const template = buildTemplatePreview({
    incidentId: String(incident.id),
    title: incident.title,
    description: incident.summary,
  });
  const instance: WorkflowInstance = {
    id: buildWorkflowInstanceId(String(template.id), 'initial'),
    templateId: template.id,
    planId,
    status: 'ready',
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activeNodeId: template.route.nodes[0]?.id,
    runIds: template.route.nodes.map((node) => buildWorkflowRunId(String(template.id), node.id, 0)),
    correlationId: `${incident.scope.region}:${incident.scope.serviceName}`,
  };

  const runs: WorkflowRun[] = template.route.nodes.map((node, index) => ({
    id: buildWorkflowRunId(String(template.id), node.id, 0),
    instanceId: instance.id,
    nodeId: node.id,
    command: node.command,
    result: index === template.route.nodes.length - 1 ? 'success' : 'skipped',
    startedAt: new Date().toISOString(),
    attempt: 0,
    output: {
      owner: node.owner,
      command: node.command,
      createdBy: incident.scope.tenantId,
      summary: `${node.label} prepared`,
    },
  }));

  return {
    template,
    instance,
    runs,
  };
};

export const normalizeTemplateMeta = (template: WorkflowTemplate): Readonly<Record<string, string>> => ({
  templateId: String(template.id),
  incidentId: String(template.incidentId),
  risk: template.route.riskWeight.toFixed(3),
  routeNodes: String(template.route.nodes.length),
  createdAt: template.createdAt,
});
