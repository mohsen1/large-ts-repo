import {
  ContinuityPolicy,
  ContinuityTemplate,
  ContinuityTemplateId,
  ContinuityTemplateMetadata,
  ContinuityWorkspace,
  ContinuityRunToken,
  buildContinuityTemplateId,
  buildContinuityPlanId,
  buildContinuitySessionId,
  buildContinuityRunToken,
  buildTemplateTags,
  buildWindowHint,
  inferWindowHint,
  ContinuityNode,
} from '@domain/recovery-incident-workflows';
import type {
  WorkflowNode,
  WorkflowTemplate,
  WorkflowTemplateId,
  WorkflowStatus,
} from '@domain/recovery-incident-workflows';
import type { WorkflowStoreRecord, WorkflowRunRecord } from '../types';
import type {
  IncidentId,
  IncidentPlanId,
  IncidentRecord,
} from '@domain/recovery-incident-orchestration';

export interface ContinuityStoreRecord {
  readonly id: string;
  readonly template: ContinuityTemplate;
  readonly planId: IncidentPlanId;
  readonly runs: readonly WorkflowRunRecord[];
  readonly incidentId: IncidentId;
}

const planIdFromRecord = (tenant: string, token: WorkflowTemplateId | string): IncidentPlanId =>
  buildContinuityPlanId(tenant, String(token).length + 11);

const severityRiskBand = (severity: string): ContinuityTemplateMetadata['riskBand'] => {
  const score = severity.toLowerCase();
  if (score.includes('critical') || score.includes('extreme')) {
    return 'critical';
  }
  if (score.includes('high')) {
    return 'high';
  }
  if (score.includes('medium')) {
    return 'medium';
  }
  return 'low';
};

const buildPriorityVector = (incident: IncidentRecord) => ({
  incidentId: incident.id,
  severityWeight: incident.severity.length,
  signalWeight: incident.signals.length,
  ageMinutes: Math.max(0, (Date.now() - Date.parse(incident.detectedAt)) / 60_000),
  dependencyPressure: incident.snapshots.length,
  tenantLoad: incident.labels.length,
  compositeScore: Math.max(
    10,
    incident.signals.length * 10 + incident.labels.length * 5 + incident.severity.length * 8,
  ),
});

const policyFromSeverity = (incident: IncidentRecord): ContinuityPolicy => ({
  enforceSla: incident.labels.includes('urgent'),
  minReadiness: incident.labels.length === 0 ? 0.2 : 0.4,
  maxParallelism: 2 + incident.labels.length,
  clauses: [
    { name: 'continuity-risk', weight: 0.4, windowMinutes: 10 },
    { name: 'service-load', weight: 0.35, windowMinutes: 20 },
    { name: 'safety', weight: 0.25, windowMinutes: 15 },
  ],
  allowAsyncRollback: incident.labels.includes('rollback'),
});

const continuityRoute = (templateId: string, tags: readonly string[]) => ({
  id: `${templateId}:route`,
  nodes: [
    {
      id: `${templateId}:seed`,
      prerequisiteId: `${templateId}:seed`,
      timeoutMinutes: 10,
      retryable: true,
    },
    {
      id: `${templateId}:execute`,
      prerequisiteId: `${templateId}:seed`,
      timeoutMinutes: 20,
      retryable: false,
    },
  ],
  owner: 'continuity-lab',
  slaWindowMinutes: 60,
  riskWeight: 12,
  tags,
});

const metadataFromIncident = (incident: IncidentRecord): ContinuityTemplateMetadata => {
  const tags = buildTemplateTags(incident);
  return {
    owner: incident.scope.serviceName,
    windowHint: buildWindowHint(incident.severity),
    riskBand: severityRiskBand(incident.severity),
    generatedAt: new Date().toISOString(),
    tags,
  };
};

const templateSeed = (incident: IncidentRecord, planId: IncidentPlanId): Pick<
  ContinuityTemplate,
  'incidentId' | 'incidentPlanId' | 'planId' | 'tenant' | 'id'
> => ({
  id: buildContinuityTemplateId(incident.id, planId.length),
  incidentId: incident.id,
  incidentPlanId: planId,
  planId,
  tenant: incident.scope.tenantId,
});

export const toContinuityTemplate = (
  incident: IncidentRecord,
  planId: IncidentPlanId,
): ContinuityTemplate => {
  const tags = buildTemplateTags(incident);
  const seed = templateSeed(incident, planId);
  return {
    id: seed.id,
    tenant: seed.tenant,
    incidentId: seed.incidentId,
    incidentPlanId: seed.incidentPlanId,
    planId: seed.planId,
    title: `continuity-${incident.title}`,
    description: incident.summary,
    priorityVector: buildPriorityVector(incident),
    scope: incident.scope,
    status: 'ready',
    nodes: [
      {
        id: `${seed.id}:seed`,
        label: 'seed',
        kind: 'seed',
        owner: incident.scope.serviceName,
        command: 'seed',
        expectedLatencyMs: 15_000,
        dependencies: [],
        tags,
      },
      {
        id: `${seed.id}:analyze`,
        label: 'analyze',
        kind: 'analyze',
        owner: incident.scope.serviceName,
        command: 'analyze',
        expectedLatencyMs: 25_000,
        dependencies: [`${seed.id}:seed`],
        tags,
      },
      {
        id: `${seed.id}:prepare`,
        label: 'prepare',
        kind: 'prepare',
        owner: incident.scope.serviceName,
        command: 'prepare',
        expectedLatencyMs: 45_000,
        dependencies: [`${seed.id}:analyze`],
        tags,
      },
      {
        id: `${seed.id}:verify`,
        label: 'verify',
        kind: 'verify',
        owner: incident.scope.serviceName,
        command: 'verify',
        expectedLatencyMs: 20_000,
        dependencies: [`${seed.id}:prepare`],
        tags,
      },
      {
        id: `${seed.id}:close`,
        label: 'close',
        kind: 'close',
        owner: incident.scope.serviceName,
        command: 'close',
        expectedLatencyMs: 10_000,
        dependencies: [`${seed.id}:verify`],
        tags,
      },
    ],
    metadata: metadataFromIncident(incident),
    policy: policyFromSeverity(incident),
    tags,
    route: continuityRoute(seed.id, tags),
    windowHint: buildWindowHint(incident.severity),
    planRunWindowMinutes: 60,
    sessionId: buildContinuitySessionId(seed.tenant, `${incident.id}`),
    runTokens: [buildContinuityRunToken(seed.id, 'seed')],
    createdAt: incident.detectedAt,
    updatedAt: incident.openedAt,
  };
};

export const buildContinuityTemplate = toContinuityTemplate;

const continuityStatusFromWorkflow = (status: WorkflowStatus): ContinuityTemplate['status'] => {
  if (status === 'completed' || status === 'paused' || status === 'abandoned' || status === 'draft') {
    return status === 'completed' ? 'ready' : 'draft';
  }
  if (status === 'running') {
    return 'running';
  }
  if (status === 'failed') {
    return 'failed';
  }
  return 'ready';
};

const continuityTemplateStatusFromWorkflow = continuityStatusFromWorkflow;

const workflowStatusFromContinuity = (status: ContinuityTemplate['status']) => {
  if (status === 'running' || status === 'active') {
    return 'running';
  }
  if (status === 'failed') {
    return 'failed';
  }
  if (status === 'draft') {
    return 'draft';
  }
  if (status === 'ready') {
    return 'ready';
  }
  return 'ready';
};

const continuityKind = (kind: WorkflowNode['kind']): ContinuityNode['kind'] => {
  if (kind === 'signal') return 'seed';
  if (kind === 'validation') return 'prepare';
  if (kind === 'mitigation') return 'prepare';
  if (kind === 'verification') return 'verify';
  return 'close';
};

const workflowKind = (kind: ContinuityNode['kind']): WorkflowNode['kind'] => {
  if (kind === 'seed') return 'signal';
  if (kind === 'analyze') return 'validation';
  if (kind === 'prepare') return 'mitigation';
  if (kind === 'verify') return 'verification';
  return 'closure';
};

const nodeDependencies = (node: WorkflowNode): readonly string[] =>
  node.dependencies.map((dependency) => dependency.prerequisiteId);

const toContinuityNodes = (template: WorkflowTemplate): ContinuityTemplate['nodes'] => template.route.nodes.map((node) => ({
  id: `${template.id}:${node.id}`,
  label: node.label,
  kind: continuityKind(node.kind),
  owner: node.owner,
  command: node.command,
  expectedLatencyMs: Math.max(1, Math.round(node.expectedDurationMinutes * 60_000)),
  dependencies: nodeDependencies(node),
  tags: [...template.route.tags],
}));

const toContinuityRoute = (template: WorkflowTemplate): ContinuityTemplate['route'] => ({
  id: template.route.id,
  owner: template.route.owner,
  slaWindowMinutes: template.route.slaWindowMinutes,
  riskWeight: template.route.riskWeight,
  tags: template.route.tags,
  nodes: template.route.nodes.map((node) => ({
    id: `${template.id}:${node.id}`,
    prerequisiteId: node.dependencies[0]?.prerequisiteId ?? node.id,
    timeoutMinutes: Math.max(1, node.expectedDurationMinutes),
    retryable: node.dependencies[0]?.retryable ?? true,
  })),
});

const workflowToContinuityTemplate = (
  template: WorkflowTemplate,
  policy: ContinuityTemplate['policy'],
): ContinuityTemplate => {
  const tags = [...template.route.tags];
  const route = toContinuityRoute(template);
  const riskScore = template.route.riskWeight >= 100
    ? 'critical'
    : template.route.riskWeight >= 60
      ? 'high'
      : template.route.riskWeight >= 35
        ? 'medium'
        : 'low';

  return {
    id: template.id,
    incidentId: template.incidentId,
    incidentPlanId: planIdFromRecord(template.scope.tenantId, template.id),
    planId: planIdFromRecord(template.scope.tenantId, template.id),
    tenant: template.scope.tenantId,
    title: template.title,
    description: template.description,
    priorityVector: template.priorityVector,
    scope: template.scope,
    status: continuityTemplateStatusFromWorkflow(template.status),
    nodes: toContinuityNodes(template),
    metadata: {
      owner: template.route.owner,
      windowHint: inferWindowHint(template.route.slaWindowMinutes),
      riskBand: riskScore,
      generatedAt: template.updatedAt,
      tags,
    },
    policy,
    tags,
    route,
    windowHint: inferWindowHint(template.route.slaWindowMinutes),
    planRunWindowMinutes: template.route.slaWindowMinutes,
    sessionId: buildContinuitySessionId(template.scope.tenantId, String(template.id)),
    runTokens: [buildContinuityRunToken(template.id, String(template.route.id))],
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
};

export const toWorkflowTemplate = (template: ContinuityTemplate): WorkflowTemplate => ({
  id: template.id,
  incidentId: template.incidentId,
  title: template.title,
  description: template.description,
  scope: template.scope,
  priorityVector: template.priorityVector,
  route: {
    id: template.route.id,
    nodes: template.nodes.map((node) => ({
      id: `${template.id}:${node.id}`,
      label: node.label,
      kind: workflowKind(node.kind),
      owner: node.owner,
      command: node.command,
      expectedDurationMinutes: Math.max(1, node.expectedLatencyMs / 60_000),
      dependencies: node.dependencies.map((dependency) => ({
        prerequisiteId: dependency,
        timeoutMinutes: Math.max(1, Math.round(node.expectedLatencyMs / 60_000)),
        retryable: true,
      })),
      metadata: {
        tenant: template.tenant,
        owner: node.owner,
      },
    })),
    owner: template.metadata.owner,
    slaWindowMinutes: template.planRunWindowMinutes,
    riskWeight: template.route.riskWeight,
    tags: template.tags,
  },
  createdAt: template.createdAt,
  updatedAt: template.updatedAt,
  status: workflowStatusFromContinuity(template.status),
});

export const mapStoreRecord = (
  record: WorkflowStoreRecord,
  policy: ContinuityTemplate['policy'],
  runResults: readonly WorkflowRunRecord[],
): ContinuityStoreRecord => {
  const template = workflowToContinuityTemplate(record.template, policy);
  return {
    id: String(record.id),
    template,
    planId: record.planId,
    runs: runResults,
    incidentId: template.incidentId,
  };
};

export const buildWorkspaceViews = (
  records: readonly WorkflowStoreRecord[],
  policyByTemplate: readonly (readonly [ContinuityTemplateId, ContinuityTemplate['policy']])[],
): readonly { templates: readonly ContinuityTemplate[]; policyCount: number; tenant: string; }[] => {
  const byTemplate = new Map<string, ContinuityTemplate['policy']>(
    policyByTemplate.map(([id, policy]) => [String(id), policy]),
  );

  return records.map((record) => {
    const policy = byTemplate.get(String(record.template.id)) ?? {
      enforceSla: true,
      minReadiness: 0.2,
      maxParallelism: 1,
      clauses: [{ name: 'default', weight: 0.6, windowMinutes: 10 }],
      allowAsyncRollback: false,
    };
    const template = workflowToContinuityTemplate(record.template, policy);
    const workspace: ContinuityWorkspace = {
      id: buildContinuitySessionId(record.template.scope.tenantId, String(record.id)),
      tenant: record.template.scope.tenantId,
      incidentId: template.incidentId,
      templates: [template],
      labels: {
        tenant: record.template.scope.tenantId,
        source: 'continuity',
      },
      riskBand: template.metadata.riskBand,
    };

    return {
      templates: workspace.templates,
      policyCount: workspace.templates[0]?.policy.clauses.length ?? 0,
      tenant: workspace.tenant,
    };
  });
};

export const buildTemplateContext = (template: ContinuityTemplate): ContinuityRunToken =>
  buildContinuityRunToken(template.id, `${template.scope.region}:${template.status}`);

export const makeContinuityRunToken = (template: ContinuityTemplate, runId: string): ContinuityRunToken =>
  buildContinuityRunToken(template.id, runId);
