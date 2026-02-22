import type {
  IncidentId,
  IncidentPlan,
  IncidentRecord,
  OrchestrationRun,
} from '@domain/recovery-incident-orchestration';
import type { IncidentPlanRecord, IncidentRunRecord } from '@data/recovery-incident-store';
import type { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import {
  buildIncidentPlaybookBundle,
  summarizeOperationCatalog,
  buildOperationsSummary,
  calculateOperationsMetrics,
  buildOperationsWindow,
} from '@data/recovery-incident-store';
import {
  buildTemplate,
  type IncidentOperationPlan,
  type RecoveryConstraintBudget,
  type RunSession,
  type SessionDecision,
  type RecoverySignal,
} from '@domain/recovery-operations-models';
import { buildIncidentOperationPlan } from '@domain/recovery-operations-models';
import { withBrand } from '@shared/core';

export interface OperationsControllerConfig {
  readonly tenantId: string;
  readonly repository: RecoveryIncidentRepository;
  readonly clock?: () => string;
}

type IncidentRunState = Readonly<{
  readonly incident: IncidentRecord;
  readonly plan: IncidentPlan;
  readonly budget: RecoveryConstraintBudget;
  readonly session: RunSession;
  readonly operationPlan: IncidentOperationPlan;
}>;

const defaultClock = () => new Date().toISOString();

const buildBudget = (index: number): RecoveryConstraintBudget => ({
  maxParallelism: 2 + (index % 3),
  maxRetries: 1 + (index % 2),
  timeoutMinutes: 12 + (index * 3),
  operatorApprovalRequired: index % 4 === 0,
});

const buildSession = (incident: IncidentRecord, plan: IncidentPlan, budget: RecoveryConstraintBudget): RunSession => ({
  id: `${incident.id}:session:${plan.id}` as RunSession['id'],
  runId: `${plan.id}:run` as RunSession['runId'],
  ticketId: `${incident.id}:ticket` as RunSession['ticketId'],
  planId: plan.id as unknown as RunSession['planId'],
  status: budget.operatorApprovalRequired ? 'warming' : 'queued',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  constraints: budget,
  signals: plan.route.nodes.map((node, index) => ({
    id: `${plan.id}:signal:${node.id}`,
    source: `${incident.scope.region}:operations`,
    severity: Number((0.2 + index * 0.17).toFixed(3)),
    confidence: Number((0.85 - index * 0.11).toFixed(3)),
    detectedAt: new Date().toISOString(),
    details: { incidentId: incident.id, node: String(node.id) },
  } satisfies RecoverySignal)),
});

const buildRunRecord = (
  runId: string,
  plan: IncidentPlan,
  operationPlan: IncidentOperationPlan,
): OrchestrationRun => ({
  id: runId as OrchestrationRun['id'],
  planId: plan.id as OrchestrationRun['planId'],
  nodeId: plan.route.nodes[0]?.id ?? withBrand('bootstrap', 'WorkItemId'),
  state: operationPlan.decision.decision === 'block' ? 'failed' : 'running',
  startedAt: new Date().toISOString(),
  finishedAt: undefined,
  output: {
    route: operationPlan.selectedRoute,
    priority: operationPlan.priority,
    reason: operationPlan.decision.reasonCode,
  },
});

const mapRecordsToRunState = (
  incidents: readonly IncidentRecord[],
  planRecords: readonly IncidentPlanRecord[],
): readonly IncidentRunState[] => incidents.flatMap((incident, index) => {
  const candidates = planRecords.filter((entry) => String(entry.incidentId) === String(incident.id));
  return candidates.map((entry) => {
    const budget = buildBudget(index);
    const session = buildSession(incident, entry.plan, budget);
    const operationPlan = buildIncidentOperationPlan(incident, session, budget, entry.plan);
    return {
      incident,
      plan: entry.plan,
      budget,
      session,
      operationPlan,
    };
  });
});

const toIncidentRunRecord = (incidentId: IncidentId, runs: readonly OrchestrationRun[]): readonly IncidentRunRecord[] =>
  runs
    .map((run) => ({
      id: `${incidentId}:${run.id}`,
      runId: run.id,
      planId: run.planId,
      itemId: run.nodeId,
      run,
      status: run.state === 'failed' ? 'failed' : run.state === 'done' ? 'done' : 'running',
    }));

export class OperationsController {
  private readonly tenantId: string;
  private readonly repository: RecoveryIncidentRepository;
  private readonly clock: () => string;

  constructor(config: OperationsControllerConfig) {
    this.tenantId = config.tenantId;
    this.repository = config.repository;
    this.clock = config.clock ?? defaultClock;
  }

  async loadSnapshot() {
    const incidents = await this.repository.findIncidents({ tenantId: this.tenantId, limit: 250 });
    const planGroups = await Promise.all(incidents.data.map((incident) => this.repository.findPlans(incident.id)));
    const planRecords = planGroups.flat();
    const runsByIncident = await Promise.all(incidents.data.map((incident) => this.repository.getRuns(incident.id)));
    const runRecords = incidents.data.flatMap((incident, index) => {
      const key = index;
      const runs = runsByIncident[key] ?? [];
      return toIncidentRunRecord(incident.id, runs);
    });
    const events = planRecords.map((entry) => ({
      id: `${entry.id}:event`,
      incidentId: entry.incidentId,
      type: 'plan_added' as const,
      payload: { planId: String(entry.id) },
      emittedAt: this.clock(),
    }));

    return {
      summary: buildOperationsSummary({
        incidents: incidents.data.map((incident) => ({
          id: incident.id,
          version: 1,
          label: incident.title,
          incident,
        })),
        plans: planRecords,
        runs: runRecords,
        events,
      }),
      catalog: summarizeOperationCatalog(incidents.data, planRecords, runRecords, events),
      window: buildOperationsWindow(this.tenantId, incidents.data),
      metrics: calculateOperationsMetrics(
        incidents.data,
        planRecords.map((entry) => entry.plan),
        runRecords.map((entry) => entry.run),
      ),
      counts: {
        incidents: incidents.data.length,
        plans: planRecords.length,
        runs: runRecords.length,
      },
    };
  }

  async buildPlaybooks() {
    const incidents = await this.repository.findIncidents({ tenantId: this.tenantId, unresolvedOnly: true, limit: 200 });
    const planGroups = await Promise.all(incidents.data.map((incident) => this.repository.findPlans(incident.id)));
    const planRecords = planGroups.flat();
    const runCandidates = mapRecordsToRunState(incidents.data, planRecords);

    const decisions: readonly SessionDecision[] = runCandidates.map((candidate, index) => ({
      runId: candidate.session.runId,
      ticketId: candidate.session.ticketId,
      accepted: index % 2 === 0,
      reasonCodes: [`build:${candidate.operationPlan.selectedRoute}`],
      score: candidate.operationPlan.readinessScore,
      createdAt: this.clock(),
    }));

    const bundle = buildIncidentPlaybookBundle(
      {
        tenantId: this.tenantId,
        unresolvedOnly: true,
        limit: 200,
      },
      incidents.data,
      planRecords.map((entry) => entry.plan),
      runCandidates.map((entry) => entry.session),
      runCandidates.map((entry) => entry.budget),
      decisions,
    );

    return {
      template: buildTemplate(this.tenantId, `Playbooks for ${this.tenantId}`),
      playbooks: bundle.playbooks,
      artifacts: bundle.artifacts,
    };
  }

  async executeTenantProgram() {
    const incidents = await this.repository.findIncidents({ tenantId: this.tenantId, unresolvedOnly: true, limit: 200 });
    const planGroups = await Promise.all(incidents.data.map((incident) => this.repository.findPlans(incident.id)));
    const planRecords = planGroups.flat();
    const runCandidates = mapRecordsToRunState(incidents.data, planRecords);
    const runIds: string[] = [];

    for (const candidate of runCandidates) {
      const runRecord = buildRunRecord(
        `${candidate.session.runId}:controller`,
        candidate.plan,
        candidate.operationPlan,
      );
      await this.repository.addRuns(candidate.incident.id, runRecord);
      runIds.push(runRecord.id);
    }

    return {
      executed: runIds.length,
      runIds,
      ok: runIds.length > 0,
    };
  }
}
