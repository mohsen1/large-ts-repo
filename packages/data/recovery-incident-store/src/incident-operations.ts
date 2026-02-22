import type { IncidentId, IncidentRecord, IncidentPlan, OrchestrationRun } from '@domain/recovery-incident-orchestration';
import { withBrand } from '@shared/core';
import type { IncidentQuery } from './types';
import {
  type IncidentPlanRecord,
  type IncidentRunRecord,
  type IncidentStoreEvent,
  type IncidentStoreState,
} from './types';
import type {
  IncidentPlaybookTemplate,
  RecoveryConstraintBudget,
  RunSession,
  SessionDecision,
  RecoverySignal,
} from '@domain/recovery-operations-models';
import {
  buildIncidentOperationPlan,
  buildTemplate,
  bundleFromRun,
  compileArtifact,
  compilePlaybook,
  normalizeSteps,
} from '@domain/recovery-operations-models';
import { buildIncidentRollups } from './queries';

type CompiledPlaybook = ReturnType<typeof compilePlaybook>;
type PlaybookBundleArtifact = ReturnType<typeof compileArtifact>;

type CommandRecord = {
  readonly incidentId: IncidentId;
  readonly planId: IncidentPlan['id'];
  readonly commands: readonly string[];
};

export interface IncidentOperationsWindow {
  readonly tenant: string;
  readonly title: string;
  readonly incidents: readonly IncidentId[];
  readonly createdAt: string;
  readonly incidentCount: number;
  readonly activeRunCount: number;
}

export interface IncidentOperationsSummary {
  readonly tenant: string;
  readonly totalIncidents: number;
  readonly totalPlans: number;
  readonly totalRuns: number;
  readonly terminalEvents: number;
  readonly readyWindow: IncidentOperationsWindow | undefined;
}

export interface IncidentOperationsCatalog {
  readonly tenant: string;
  readonly labels: readonly string[];
  readonly bySeverity: Record<IncidentRecord['severity'], number>;
  readonly runState: Record<IncidentRunRecord['status'], number>;
}

export interface IncidentOperationsMetrics {
  readonly urgencyIndex: number;
  readonly planDensity: number;
  readonly runDensity: number;
  readonly riskHotspots: readonly {
    readonly incidentId: IncidentId;
    readonly planCount: number;
    readonly runCount: number;
  }[];
}

interface IncidentPlanSession {
  readonly incident: IncidentRecord;
  readonly plan: IncidentPlan;
  readonly session: RunSession;
  readonly budget: RecoveryConstraintBudget;
  readonly decision: SessionDecision;
}

const buildOperationsWindowFromIncidents = (
  tenant: string,
  incidents: readonly IncidentRecord[],
): IncidentOperationsWindow | undefined => {
  if (incidents.length === 0) {
    return undefined;
  }

  const activeRunCount = incidents.reduce((total, incident) => (incident.resolvedAt ? total : total + 1), 0);
  return {
    tenant,
    title: `${tenant}:active-window`,
    incidents: incidents.map((incident) => incident.id),
    createdAt: new Date().toISOString(),
    incidentCount: incidents.length,
    activeRunCount,
  };
};

export const buildOperationsWindow = (
  tenant: string,
  incidents: readonly IncidentRecord[],
): IncidentOperationsWindow | undefined => buildOperationsWindowFromIncidents(tenant, incidents);

export const summarizeOperationCatalog = (
  incidents: readonly IncidentRecord[],
  plans: readonly IncidentPlanRecord[],
  runs: readonly IncidentRunRecord[],
  _events: readonly IncidentStoreEvent[],
): IncidentOperationsCatalog => {
  const bySeverity: Record<IncidentRecord['severity'], number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
    extreme: 0,
  };
  for (const incident of incidents) {
    bySeverity[incident.severity] += 1;
  }

  const runState: Record<IncidentRunRecord['status'], number> = {
    queued: 0,
    running: 0,
    done: 0,
    failed: 0,
  };
  for (const run of runs) {
    runState[run.status] += 1;
  }

  const labels = [...new Set([
    ...incidents.flatMap((incident) => incident.labels),
    ...plans.map((plan) => plan.label),
  ])];

  return {
    tenant: incidents[0]?.scope.tenantId ?? 'unknown',
    labels,
    bySeverity,
    runState,
  };
};

export const buildOperationsSummary = (state: IncidentStoreState): IncidentOperationsSummary => {
  const incidents = state.incidents.map((entry) => entry.incident);
  const tenant = incidents[0]?.scope.tenantId ?? 'unknown';
  const rollups = buildIncidentRollups(incidents, state.plans, state.runs, state.events);
  const readyWindow = buildOperationsWindow(
    tenant,
    rollups
      .filter((entry) => entry.runCount > 0)
      .map((entry) => incidents.find((incident) => String(incident.id) === String(entry.incidentId)))
      .filter((incident): incident is IncidentRecord => Boolean(incident)),
  );

  return {
    tenant,
    totalIncidents: incidents.length,
    totalPlans: state.plans.length,
    totalRuns: state.runs.length,
    terminalEvents: state.events.filter((entry) => entry.type === 'resolved' || entry.type === 'escalated').length,
    readyWindow,
  };
};

export const calculateOperationsMetrics = (
  incidents: readonly IncidentRecord[],
  plans: readonly IncidentPlan[],
  runs: readonly OrchestrationRun[],
): IncidentOperationsMetrics => {
  const runStates: Record<OrchestrationRun['state'], number> = {
    pending: 0,
    running: 0,
    done: 0,
    failed: 0,
  };
  for (const run of runs) {
    runStates[run.state] += 1;
  }

  const runDensity = runs.length / Math.max(1, incidents.length);
  const planDensity = plans.length / Math.max(1, incidents.length);
  const planCountByIncident = new Map<string, number>();
  for (const plan of plans) {
    planCountByIncident.set(String(plan.incidentId), (planCountByIncident.get(String(plan.incidentId)) ?? 0) + 1);
  }

  const runCountByPlan = new Map<string, number>();
  for (const run of runs) {
    runCountByPlan.set(String(run.planId), (runCountByPlan.get(String(run.planId)) ?? 0) + 1);
  }
  const urgencyIndex =
    runs.length > 0 ? Number((((runStates.running + runStates.failed) / runs.length) * 100).toFixed(2)) : 0;

  const riskHotspots = [...planCountByIncident.entries()]
    .map(([incidentId, planCount]) => ({
      incidentId: withBrand(incidentId, 'IncidentId') as IncidentId,
      planCount,
      runCount: [...runCountByPlan.entries()]
        .filter(([planId]) => plans.some((plan) => String(plan.id) === planId && String(plan.incidentId) === incidentId))
        .reduce((sum, [, count]) => sum + count, 0),
    }))
    .sort((left, right) => right.runCount - left.runCount)
    .slice(0, 8);

  return { urgencyIndex, planDensity, runDensity, riskHotspots };
};

const buildSignalsFromPlan = (plan: IncidentPlan): readonly RecoverySignal[] => plan.route.nodes.map((node, index) => ({
  id: `${plan.id}:signal:${String(node.id)}`,
  source: `${plan.id}:source`,
  severity: Number(((index + 1) * 0.25).toFixed(2)),
  confidence: Number((0.5 + index * 0.08).toFixed(2)),
  detectedAt: new Date().toISOString(),
  details: {
    nodeId: String(node.id),
    incident: String(plan.incidentId),
    index,
  },
}));

const buildCommandMap = (incidents: readonly IncidentRecord[], plans: readonly IncidentPlan[]): readonly CommandRecord[] =>
  incidents.flatMap((incident) => {
    const incidentPlans = plans.filter((plan) => String(plan.incidentId) === String(incident.id));
    const service = incident.scope.serviceName;
    const region = incident.scope.region;

    if (incidentPlans.length === 0) {
      return [{
        incidentId: incident.id,
        planId: withBrand(`${incident.id}:fallback`, 'IncidentPlanId') as IncidentPlan['id'],
        commands: Object.freeze([`${service}:${region}:observe`, `${service}:${region}:refresh`]),
      }];
    }

    return incidentPlans.map((plan) => ({
      incidentId: incident.id,
      planId: plan.id as IncidentPlan['id'],
      commands: Object.freeze([
        `${service}:${region}:plan:${plan.id}`,
        `${service}:${region}:execute:${plan.route.nodes.length}`,
        `${service}:${region}:close:${incident.id}`,
      ]),
    }));
  });

const lookupCommands = (
  commandMap: readonly CommandRecord[],
  candidate: IncidentPlanSession,
): readonly string[] => commandMap.find((entry) =>
  String(entry.incidentId) === String(candidate.incident.id) && String(entry.planId) === String(candidate.plan.id)
)?.commands ?? [`fallback:${candidate.incident.scope.serviceName}`];

const buildCandidateRuns = (
  incidents: readonly IncidentRecord[],
  plans: readonly IncidentPlan[],
  sessions: readonly RunSession[],
  budgets: readonly RecoveryConstraintBudget[],
  decisions: readonly SessionDecision[],
): readonly IncidentPlanSession[] => {
  const budgetByIndex = budgets.length === 0 ? [{ maxParallelism: 1, maxRetries: 1, timeoutMinutes: 30, operatorApprovalRequired: false }] : budgets;
  const decisionByIndex = decisions.length === 0
    ? [{
      runId: withBrand('fallback-run', 'RecoveryRunId') as unknown as SessionDecision['runId'],
      ticketId: 'fallback-ticket',
      accepted: true,
      reasonCodes: ['fallback'],
      score: 1,
      createdAt: new Date().toISOString(),
    }]
    : decisions;

  return incidents.flatMap((incident, incidentIndex) => {
    const incidentPlans = plans.filter((plan) => String(plan.incidentId) === String(incident.id));
    const incidentSessions = sessions.filter((session) => String(session.ticketId).startsWith(`${incident.id}:ticket`));

    if (incidentSessions.length === 0) {
      return [];
    }

    return incidentPlans.flatMap((plan, planIndex) => {
      const session = incidentSessions[planIndex % incidentSessions.length];
      const budget = budgetByIndex[planIndex % budgetByIndex.length];
      const decision = decisionByIndex[planIndex % decisionByIndex.length];
      const fallbackSignals = buildSignalsFromPlan(plan);

      return [{
        incident,
        plan,
        session: {
          ...session,
          constraints: budget,
          signals: session.signals.length > 0 ? session.signals : fallbackSignals,
        },
        budget,
        decision,
      }];
    });
  });
};

export const buildIncidentPlaybookBundle = (
  query: IncidentQuery,
  incidents: readonly IncidentRecord[],
  plans: readonly IncidentPlan[],
  sessions: readonly RunSession[],
  budgets: readonly RecoveryConstraintBudget[],
  decisions: readonly SessionDecision[],
): {
  readonly template: IncidentPlaybookTemplate;
  readonly playbooks: readonly CompiledPlaybook[];
  readonly artifacts: readonly PlaybookBundleArtifact[];
} => {
  const label = `${query.tenantId ?? 'unknown'}-${query.region ?? 'global'}`;
  const template = buildTemplate(label, `playbook-${label}`);
  const commandMap = buildCommandMap(incidents, plans);
  const candidateRuns = buildCandidateRuns(incidents, plans, sessions, budgets, decisions);
  const playbooks = candidateRuns.map((candidate) => compilePlaybook({
    template,
    routePlan: buildIncidentOperationPlan(candidate.incident, candidate.session, candidate.budget, candidate.plan),
    commands: lookupCommands(commandMap, candidate),
  }));
  const normalizedPlaybooks = playbooks.map((playbook) => ({
    ...playbook,
    steps: normalizeSteps(playbook.steps),
  }));
  const artifacts = normalizedPlaybooks.map((playbook, index) => compileArtifact({
    ...playbook,
    planId: candidateRuns[index]!.plan.id,
    metadata: {
      ...playbook.metadata,
      decision: candidateRuns[index]!.decision.accepted,
      bundleSize: normalizedPlaybooks.length,
      source: candidateRuns[index]!.session.ticketId,
    },
  }));

  if (playbooks.length === 0 || normalizedPlaybooks.length === 0) {
    return { template, playbooks: [], artifacts: [] };
  }

  const bundle = candidateRuns.map((candidate) => bundleFromRun(
    candidate.incident,
    candidate.session,
    candidate.budget,
    candidate.plan,
    candidate.decision,
  ));
  void bundle;

  return {
    template,
    playbooks: normalizedPlaybooks,
    artifacts,
  };
};
