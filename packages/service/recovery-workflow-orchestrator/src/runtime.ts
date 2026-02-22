import { RecoveryWorkflowPlanner } from './planner';
import { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import { RecoveryWorkflowRepository, type WorkflowQueryResult } from '@data/recovery-workflow-store';
import { RecoveryIncidentOrchestrator } from '@service/recovery-incident-orchestrator';
import type { RunInput, OrchestratorOptions, WorkflowRunResult, WorkflowSnapshot } from './types';
import type { IncidentPlanId, IncidentId } from '@domain/recovery-incident-orchestration';
import { buildBundleFromIncident } from '@domain/recovery-incident-workflows';
import { rankIncidents } from '@domain/recovery-incident-orchestration';

export interface OrchestratorState {
  readonly options: OrchestratorOptions;
  readonly prepared: boolean;
  readonly repositoryCount: number;
}

export class RecoveryWorkflowRuntime {
  private readonly planner: RecoveryWorkflowPlanner;
  private readonly tenantId: string;
  private readonly namespace: string;

  constructor(
    options: OrchestratorOptions,
    private readonly incidentRepository: RecoveryIncidentRepository,
    private readonly workflowRepository: RecoveryWorkflowRepository,
    private readonly incidentOrchestrator: RecoveryIncidentOrchestrator,
  ) {
    this.planner = new RecoveryWorkflowPlanner(
      incidentRepository,
      workflowRepository,
      incidentOrchestrator,
    );
    this.tenantId = options.tenantId;
    this.namespace = options.namespace;
    void options;
  }

  async prepare(): Promise<OrchestratorState> {
    const snapshot = await this.workflowRepository.buildSnapshot();
    return {
      options: {
        tenantId: this.tenantId,
        namespace: this.namespace,
        maxConcurrentWorkflows: 8,
      },
      prepared: snapshot.workflowCount >= 0,
      repositoryCount: snapshot.workflowCount,
    };
  }

  async run(input: RunInput): Promise<WorkflowRunResult> {
    const incidents = await this.incidentRepository.findIncidents({
      tenantId: this.tenantId,
      limit: 500,
    });
    const target = incidents.data.find((incident) => String(incident.id) === String(input.incidentId));
    if (!target) {
      return {
        ok: false,
        incidentId: String(input.incidentId) as IncidentId,
        planId: 'orphan-plan' as IncidentPlanId,
        runSummaries: [],
        errors: ['incident-missing'],
      };
    }

    const ranked = rankIncidents([target], {
      maxDependencyPressure: 12,
      maxTenantShare: 10,
      minSignalRatio: 0.4,
    });
    const planId = ranked[0]
      ? (target.id as unknown as IncidentPlanId)
      : (`fallback-${target.id}` as IncidentPlanId);
    const bundle = buildBundleFromIncident(target, planId);
    const targetRun = bundle.runs.find((run) => run.nodeId === input.runNodeId);
    const runSummaries = bundle.runs.map((run) => ({
      runId: run.id,
      state: run.result,
      nodeId: run.nodeId,
    }));
    if (!targetRun) {
      return {
        ok: false,
        incidentId: target.id,
        planId,
        runSummaries,
        errors: ['run-node-missing'],
      };
    }

    return {
      ok: true,
      incidentId: target.id,
      planId,
      runSummaries,
      errors: [],
    };
  }

  async bootstrap(): Promise<WorkflowQueryResult> {
    const query = await this.workflowRepository.query({
      tenantId: this.tenantId,
      includeHistory: true,
    });
    return {
      total: query.total,
      records: query.records,
      histories: query.histories,
    };
  }

  async executeForTenant(correlationId: string): Promise<{
    readonly prepared: boolean;
    readonly snapshots: readonly WorkflowSnapshot[];
  }> {
    const state = await this.prepare();
    const incidents = await this.incidentRepository.findIncidents({
      tenantId: this.tenantId,
      unresolvedOnly: true,
      limit: state.options.maxConcurrentWorkflows,
    });

    const snapshots = await Promise.all(incidents.data.map(async (incident) => {
      const plans = await this.incidentRepository.findPlans(incident.id);
      return {
        tenantId: this.tenantId,
        namespace: `${this.namespace}:${incident.id}`,
        activeWorkflows: plans.length,
        templateCount: plans.length + incidents.total,
      };
    }));

    void correlationId;
    void this.planner;
    return {
      prepared: state.prepared,
      snapshots,
    };
  }
}
