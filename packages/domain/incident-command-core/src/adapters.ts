import { withBrand } from '@shared/core';
import type {
  IncidentRecord,
  IncidentPlan,
  OrchestrationRun,
  IncidentSignal,
} from '@domain/recovery-incident-orchestration';
import {
  type CommandId,
  type CommandTemplate,
  type CommandPlaybookCommand,
  type CommandPlaybook,
  type CommandTemplateId,
  type CommandRunbook,
  buildCommandTemplateId,
  buildCommandId,
  buildPlaybookId,
} from './types';
import { runbookReadinessScore } from './policy';

export interface IncidentCommandTemplateInput {
  readonly tenantId: string;
  readonly incidentId: string;
  readonly title: string;
  readonly hints: readonly string[];
  readonly safetyWindowMinutes: number;
}

export interface IncidentRunbookInput {
  readonly incident: IncidentRecord;
  readonly plan: IncidentPlan;
  readonly template: CommandTemplate;
}

export interface ReadinessEnvelope {
  readonly score: number;
  readonly signals: readonly IncidentSignal[];
}

export const readSignals = (incident: IncidentRecord): ReadinessEnvelope => ({
  score: runbookReadinessScore(
    templateFromIncident({
      tenantId: incident.scope.tenantId,
      incidentId: String(incident.id),
      title: incident.title,
      hints: incident.labels,
      safetyWindowMinutes: 20,
    }),
    incident.signals,
  ),
  signals: incident.signals,
});

export const templateFromIncident = (input: IncidentCommandTemplateInput): CommandTemplate => ({
  id: buildCommandTemplateId(input.title, input.tenantId),
  name: `${input.title}-template`,
  description: `Auto-generated template for tenant ${input.tenantId}`,
  commandHints: [...input.hints],
  priorityModifier: 1,
  safetyWindowMinutes: input.safetyWindowMinutes,
});

const buildCommandCommand = (
  idSeed: string,
  position: number,
  commandName: string,
  incident: IncidentRecord,
): CommandPlaybookCommand => ({
  id: buildCommandId(idSeed, position, commandName),
  label: `${incident.title} :: ${commandName}`,
  owner: incident.scope.clusterId,
  actionKind: commandName === 'notify' ? 'notify' : 'play',
  severity: incident.severity,
  dependsOn: [],
  expectedDurationMinutes: Math.max(3, incident.labels.length * 2),
  metadata: {
    tenant: incident.scope.tenantId,
    cluster: incident.scope.clusterId,
  },
  instructions: [commandName, `scope:${incident.scope.serviceName}`, `tenant:${incident.scope.tenantId}`],
  parameters: {
    planIncident: String(incident.id),
    commandName,
  },
});

export const commandPlaybookFromPlan = (plan: IncidentPlan, incident: IncidentRecord): CommandPlaybookCommand[] => [
  buildCommandCommand(String(plan.id), 0, 'stabilize', incident),
  buildCommandCommand(String(plan.id), 1, 'verify', incident),
];

export const commandPlaybookFromRuns = (incident: IncidentRecord, runs: readonly OrchestrationRun[]): CommandPlaybookCommand[] => {
  if (runs.length === 0) {
    return [buildCommandCommand(String(incident.id), 1, 'drain', incident)];
  }

  return runs.slice(0, 3).map((run, index) =>
    buildCommandCommand(String(run.id), index, `replay-${run.nodeId}`, incident),
  );
};

export const buildRunbook = (
  runbookIdSeed: { incidentId: string; planId: string },
  incident: IncidentRecord,
  plan: IncidentPlan,
  runs: readonly OrchestrationRun[],
): CommandRunbook => {
  const template = templateFromIncident({
    tenantId: incident.scope.tenantId,
    incidentId: String(incident.id),
    title: incident.title,
    hints: ['stabilize', 'rollback', 'notify'],
    safetyWindowMinutes: 30,
  });

  const playbook: CommandPlaybook = {
    id: buildPlaybookId(runbookIdSeed.incidentId as any, plan.id as any),
    incidentId: incident.id,
    templateName: template.name,
    templateVersion: 'v1',
    commands: [...commandPlaybookFromPlan(plan, incident), ...commandPlaybookFromRuns(incident, runs)],
    constraints: {
      requiresHumanApproval: false,
      maxRetryAttempts: 3,
      backoffMinutes: 5,
      abortOnFailure: true,
      allowedRegions: [incident.scope.region],
    },
    generatedAt: new Date().toISOString(),
  };

  const policyRules = [{
    id: withBrand(`${runbookIdSeed.planId}:policy`, 'PolicyViolationId'),
    name: 'default',
    description: 'lightweight adapter policy',
    blockedSeverities: ['extreme'],
    maxDurationMinutes: template.safetyWindowMinutes,
    maxRetry: 1,
    requiresReadiness: 0,
  }];
  void policyRules;

  return {
    id: withBrand(`${runbookIdSeed.incidentId}:runbook:${runbookIdSeed.planId}`, 'PlaybookId'),
    incidentId: incident.id,
    plan,
    template,
    playbook,
    state: 'draft',
    stateTransitions: [{
      at: new Date().toISOString(),
      state: 'draft',
      operator: incident.scope.serviceName,
      note: `seed=${runbookIdSeed.planId}`,
    }],
    riskScore: Math.max(1, readSignals(incident).score * 2 + runs.length),
  };
};
