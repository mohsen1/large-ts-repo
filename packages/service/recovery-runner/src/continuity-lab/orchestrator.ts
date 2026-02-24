import {
  ContinuityEngine,
  ContinuitySummary,
  ContinuityTemplate,
  ContinuityWorkspace,
  ContinuityExecutionManifest,
  buildContinuityRunToken,
  buildContinuitySessionId,
  type ContinuitySessionId,
  type ContinuityRunToken,
  type ContinuityPlanInput,
} from '@domain/recovery-incident-workflows';
import {
  toApiManifest,
  toApiSummary,
} from './adapters';
import {
  toWorkflowTemplate,
  createContinuityWorkspace,
  toContinuityTemplate,
} from '@data/recovery-workflow-store';
import { RecoveryWorkflowRepository, type WorkflowRunRecord, type WorkflowStoreRecord } from '@data/recovery-workflow-store';
import { buildWorkflowInstanceId, buildWorkflowRunId, type WorkflowTemplate } from '@domain/recovery-incident-workflows';
import { withBrand } from '@shared/core';
import {
  type IncidentRecord,
  type IncidentId,
  type IncidentPlanId,
} from '@domain/recovery-incident-orchestration';

export type ContinuityExecutionOutput = {
  readonly workspaceId: ContinuitySessionId;
  readonly manifests: readonly ContinuityExecutionManifest[];
  readonly trace: readonly string[];
};

type ContinuityRepositoryFacade = {
  readonly query: (query: { tenantId?: string; includeHistory?: boolean }) => Promise<{
    total: number;
    records: readonly WorkflowStoreRecord[];
    histories: readonly WorkflowRunRecord[];
  }>;
};

type ContinuityRunContext = {
  readonly runToken: ContinuityRunToken;
};

const defaultOrchestratorConfig = {
  maxManifestsPerIncident: 5,
  traceWindowMinutes: 30,
};

const buildRunContext = (workspace: ContinuityWorkspace): ContinuityRunContext => ({
  runToken: buildContinuityRunToken(String(workspace.id), `run-${Date.now()}`),
});

const mapWorkspace = (templates: readonly ContinuityTemplate[], tenant: string): ContinuityWorkspace =>
  createContinuityWorkspace(tenant, `ws-${Date.now()}`, templates);

const mapStatusToSummary = (status: WorkflowTemplate['status']): ContinuitySummary['status'] => {
  if (status === 'running') {
    return 'running';
  }
  if (status === 'failed') {
    return 'failed';
  }
  return 'queued';
};

export class ContinuityOrchestrationService {
  private readonly repository: ContinuityRepositoryFacade;

  constructor(repository: RecoveryWorkflowRepository) {
    this.repository = {
      query: async ({ tenantId, includeHistory }) => repository.query({
        tenantId,
        includeHistory,
        minRisk: 0,
      }),
    };
  }

  async runForIncident(
    incident: {
      readonly id: string;
      readonly templates: readonly ContinuityTemplate[];
    },
    options: Partial<{ readonly planWindowMinutes: number; readonly includeHistory: boolean }> = {},
  ): Promise<readonly ContinuityExecutionOutput[]> {
    const includeHistory = options.includeHistory ?? true;
    const maxItems = options.planWindowMinutes ?? defaultOrchestratorConfig.maxManifestsPerIncident;

    const workspace = mapWorkspace(incident.templates, incident.id);
    void includeHistory;
    const context = buildRunContext(workspace);
    const incidentId = withBrand(incident.id, 'IncidentId');

    const engine = new ContinuityEngine(workspace);
    const manifests = await engine.planWorkflows({
      planId: workspace.templates[0]?.planId ?? withBrand(`${incident.id}:plan`, 'IncidentPlanId'),
      incidentId,
      tenant: workspace.tenant,
      context: {
        runId: context.runToken,
        templateId: workspace.templates[0]?.id ?? withBrand(`${workspace.id}`, 'WorkflowTemplateId'),
        tenant: workspace.tenant,
        eventChannel: `tenant:${workspace.tenant}.${workspace.templates[0]?.windowHint ?? 'sustained'}`,
        tags: [workspace.tenant, ...workspace.templates.flatMap((template) => template.tags)],
      },
    } satisfies ContinuityPlanInput);

    const filtered = manifests.slice(0, maxItems);
    const outputs: ContinuityExecutionOutput[] = [];
    await this.repository.query({ tenantId: incident.id, includeHistory });

    for (const manifest of filtered) {
      await this.persistManifest(manifest, workspace);
      outputs.push({
        workspaceId: workspace.id,
        manifests: [manifest],
        trace: [toApiManifest(manifest).id, ...manifest.trace.events],
      });
    }

    return outputs;
  }

  async buildSummary(incidentId: string): Promise<readonly ContinuitySummary[]> {
    const query = await this.repository.query({ tenantId: incidentId, includeHistory: true });

    return query.records.map((record) => ({
      sessionId: buildContinuitySessionId(incidentId, String(record.template.id)),
      score: record.template.route.riskWeight,
      status: mapStatusToSummary(record.instance.status),
      policy: {
        enforceSla: true,
        minReadiness: 0.4,
        maxParallelism: 3,
        clauses: [{ name: 'default', weight: 0.9, windowMinutes: 15 }],
        allowAsyncRollback: false,
      },
      tags: [String(record.template.id), record.state],
    }));
  }

  async *streamPlans(incidentId: string): AsyncIterable<ContinuityExecutionOutput> {
    const query = await this.repository.query({ tenantId: incidentId, includeHistory: true });
    for (const record of query.records) {
      const template = record.template as unknown as ContinuityTemplate;
      const workspace = createContinuityWorkspace(String(incidentId), String(record.id), [template]);
      const engine = new ContinuityEngine(workspace);
      const input: ContinuityPlanInput = {
        planId: record.planId,
        incidentId: template.incidentId,
        tenant: template.scope.tenantId,
        context: {
          runId: buildContinuityRunToken(String(template.id), 'stream'),
          templateId: template.id,
          tenant: template.scope.tenantId,
          eventChannel: `tenant:${template.scope.tenantId}.${template.windowHint}`,
          tags: template.tags,
        },
      };
      const manifests = await engine.planWorkflows(input);
      yield {
        workspaceId: buildContinuitySessionId(incidentId, String(record.id)),
        manifests,
        trace: record.template.route.nodes.map((node) => node.id),
      };
    }
  }

  private async persistManifest(manifest: ContinuityExecutionManifest, workspace: ContinuityWorkspace): Promise<void> {
    const record = workspace.templates[0];
    if (!record) {
      return;
    }

    const template = toWorkflowTemplate(record);
    const instanceId = buildWorkflowInstanceId(template.id, String(manifest.trace.runToken));
    const repository = new RecoveryWorkflowRepository();
    const runIds = manifest.trace.windows.flatMap((window) => window.runs.map((run) => {
      const runNode = String(run.nodeId);
      return buildWorkflowRunId(instanceId, runNode, 0);
    }));

    const saved: WorkflowStoreRecord = {
      id: template.id,
      state: 'active',
      template,
      instance: {
        id: instanceId,
        templateId: template.id,
        planId: manifest.planId,
        status: manifest.status === 'complete' ? 'completed' : manifest.status === 'running' ? 'running' : 'paused',
        startedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        activeNodeId: manifest.trace.events[0],
        runIds,
        correlationId: String(manifest.trace.runToken),
      },
      updatedAt: new Date().toISOString(),
      incidents: workspace.templates.map((templateRecord) => templateRecord.incidentId),
      planId: manifest.planId,
    };

    await repository.save(saved);
    toApiSummary({
      sessionId: manifest.trace.sessionId,
      score: manifest.policySummary.length,
      status: manifest.status,
      policy: record.policy,
      tags: record.tags,
    });
  }
}

export const toWorkspaceSummaryFromIncident = (
  incident: IncidentRecord,
): ContinuityTemplate => toContinuityTemplate(incident, withBrand(`${incident.id}:plan`, 'IncidentPlanId'));
