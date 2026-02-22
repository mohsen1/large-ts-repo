import { withBrand } from '@shared/core';
import {
  type IncidentId,
  type IncidentPlan,
  type IncidentRecord,
  type IncidentPlanId,
  type OrchestrationPlan,
  type RecoveryPlay,
  type RecoveryRoute,
  type RecoveryRouteNode,
  type RouteBuildOptions,
  type WorkItemId,
  type SchedulerWindow,
  type RetryPolicy,
  buildPlanId,
  buildRouteId,
  buildWorkItemId,
  defaultRouteOptions,
} from './types';

type PlanTemplateStep = {
  readonly command: string;
  readonly owner: string;
  readonly estimatedMinutes: number;
  readonly dependsOn: readonly string[];
  readonly retryPolicy: RetryPolicy;
};

interface PlanTemplate {
  readonly label: string;
  readonly steps: readonly PlanTemplateStep[];
}

const defaultCommandList: PlanTemplate[] = [
  {
    label: 'stability-first',
    steps: [
      { command: 'triage', owner: 'oncall', estimatedMinutes: 12, dependsOn: [], retryPolicy: { maxAttempts: 2, intervalMinutes: 1, backoffMultiplier: 1.5 } },
      { command: 'stabilize', owner: 'platform', estimatedMinutes: 25, dependsOn: ['triage'], retryPolicy: { maxAttempts: 2, intervalMinutes: 1, backoffMultiplier: 1.4 } },
      { command: 'verify', owner: 'qa', estimatedMinutes: 18, dependsOn: ['stabilize'], retryPolicy: { maxAttempts: 1, intervalMinutes: 1, backoffMultiplier: 1.2 } },
      { command: 'mitigate', owner: 'security', estimatedMinutes: 40, dependsOn: ['stabilize'], retryPolicy: { maxAttempts: 2, intervalMinutes: 2, backoffMultiplier: 2.0 } },
      { command: 'close', owner: 'oncall', estimatedMinutes: 8, dependsOn: ['verify', 'mitigate'], retryPolicy: { maxAttempts: 1, intervalMinutes: 1, backoffMultiplier: 1.0 } },
    ],
  },
  {
    label: 'evidence-first',
    steps: [
      { command: 'triage', owner: 'incident', estimatedMinutes: 10, dependsOn: [], retryPolicy: { maxAttempts: 2, intervalMinutes: 1, backoffMultiplier: 1.2 } },
      { command: 'verify', owner: 'sre', estimatedMinutes: 20, dependsOn: ['triage'], retryPolicy: { maxAttempts: 2, intervalMinutes: 1, backoffMultiplier: 1.6 } },
      { command: 'mitigate', owner: 'ops', estimatedMinutes: 60, dependsOn: ['triage'], retryPolicy: { maxAttempts: 3, intervalMinutes: 2, backoffMultiplier: 1.3 } },
      { command: 'close', owner: 'incident', estimatedMinutes: 12, dependsOn: ['verify', 'mitigate'], retryPolicy: { maxAttempts: 1, intervalMinutes: 1, backoffMultiplier: 1 } },
    ],
  },
];

const clampPolicy = (policy: RetryPolicy): RetryPolicy => ({
  maxAttempts: Math.min(8, Math.max(1, policy.maxAttempts)),
  intervalMinutes: Math.max(1, policy.intervalMinutes),
  backoffMultiplier: Math.max(1, policy.backoffMultiplier),
});

const buildPlay = (
  incidentId: IncidentId,
  planId: IncidentPlanId,
  commandIndex: number,
  step: PlanTemplateStep,
): RecoveryPlay => {
  const id = buildWorkItemId(planId, commandIndex, step.command);
  return {
    id,
    label: `${incidentId}:${step.command}`,
    command: step.command,
    parameters: {
      commandIndex,
      template: 'incident-stability',
      incidentId,
      owner: step.owner,
      escalationWindowMinutes: Math.max(1, step.estimatedMinutes),
    },
    timeoutMinutes: Math.max(1, step.estimatedMinutes),
    retryPolicy: clampPolicy(step.retryPolicy),
  };
};

export const buildRouteNodes = (incidentId: IncidentId, template: PlanTemplate, planId: IncidentPlanId): readonly RecoveryRouteNode[] => {
  const byCommand = new Map<string, RecoveryRouteNode>();

  template.steps.forEach((step, index) => {
    const id = buildWorkItemId(planId, index, step.command);
    const play = buildPlay(incidentId, planId, index, step);
    const dependsOn = step.dependsOn.map((dep) => {
      const depIndex = template.steps.findIndex((candidate) => candidate.command === dep);
      return buildWorkItemId(planId, depIndex, dep);
    });
    byCommand.set(step.command, { id, dependsOn, play });
  });

  return template.steps.map((step, index) => {
    const id = buildWorkItemId(planId, index, step.command);
    const item = byCommand.get(step.command);
    return {
      id,
      dependsOn: item?.dependsOn ?? [],
      play: item?.play ?? buildPlay(incidentId, planId, index, step),
    };
  });
};

export const buildRoute = (incidentId: IncidentId, template: PlanTemplate): RecoveryRoute => {
  const planId = buildPlanId(incidentId);
  const nodes = buildRouteNodes(incidentId, template, planId);
  return {
    id: buildRouteId(incidentId, 0),
    incidentId,
    nodes,
    createdAt: new Date().toISOString(),
    owner: 'recovery-orchestrator',
  };
};

const chooseTemplate = (incident: IncidentRecord, seed: string): PlanTemplate => {
  const index = incident.labels.includes('compliance') ? 1 : seed.endsWith('A') ? 1 : 0;
  return defaultCommandList[index] ?? defaultCommandList[0];
};

const buildWindows = (plan: IncidentPlan, options: RouteBuildOptions): readonly SchedulerWindow[] => {
  const base = Date.now();
  const windows: SchedulerWindow[] = [];
  for (let slot = 0; slot < plan.route.nodes.length; slot += 1) {
    const startsAt = base + slot * options.windowMinutes * 60_000;
    windows.push({
      startAt: new Date(startsAt).toISOString(),
      endAt: new Date(startsAt + options.windowMinutes * 60_000).toISOString(),
      timezone: 'UTC',
    });
  }
  return windows;
};

const computeRiskFromSignals = (incident: IncidentRecord): number => {
  const ratio = incident.signals.reduce((acc, signal) => acc + signal.value / Math.max(signal.threshold, 1), 0);
  return Number(Math.min(1, ratio / Math.max(incident.signals.length, 1)).toFixed(4));
};

export const createPlan = (
  incident: IncidentRecord,
  seed: string,
  options: Partial<RouteBuildOptions> = {},
): IncidentPlan => {
  const planOptions: RouteBuildOptions = {
    ...defaultRouteOptions,
    ...options,
  };

  const planId = buildPlanId(incident.id);
  const template = chooseTemplate(incident, seed);
  const route = buildRoute(incident.id, template);
  const base: Omit<IncidentPlan, 'windows' | 'metadata'> = {
    id: planId,
    incidentId: incident.id,
    title: `${template.label}: ${incident.title}`,
    route,
    riskScore: computeRiskFromSignals(incident),
    approved: false,
  };

  const windows = buildWindows(base as IncidentPlan, planOptions);
  return {
    ...base,
    windows,
    metadata: {
      template: template.label,
      batchSize: String(planOptions.batchSize),
      parallelism: String(planOptions.parallelism),
      maxAttempts: String(planOptions.maxAttempts),
    },
  };
};

export const splitByOwner = (route: RecoveryRoute): Map<string, readonly WorkItemId[]> => {
  const buckets = new Map<string, WorkItemId[]>();
  for (const node of route.nodes) {
    const owner = String(node.play.parameters.owner);
    const current = buckets.get(owner) ?? [];
    current.push(node.id);
    buckets.set(owner, current);
  }
  const normalized = new Map<string, readonly WorkItemId[]>();
  for (const [key, value] of buckets.entries()) {
    normalized.set(key, value);
  }
  return normalized;
};

export const topologicalOrder = (route: RecoveryRoute): readonly WorkItemId[] => {
  const resolved = new Set<WorkItemId>();
  const order: WorkItemId[] = [];
  const unresolved = new Set(route.nodes.map((node) => node.id));

  while (unresolved.size > 0) {
    const ready = route.nodes.filter((node) => {
      if (!unresolved.has(node.id)) {
        return false;
      }
      return node.dependsOn.every((dep) => resolved.has(dep));
    });

    if (ready.length === 0) {
      for (const node of route.nodes) {
        if (unresolved.has(node.id)) {
          order.push(node.id);
          unresolved.delete(node.id);
          resolved.add(node.id);
        }
      }
      break;
    }

    for (const node of ready) {
      order.push(node.id);
      unresolved.delete(node.id);
      resolved.add(node.id);
    }
  }

  return order;
};

export const routeExecutionBatches = (route: RecoveryRoute, parallelism: number): readonly (readonly WorkItemId[])[] => {
  const order = topologicalOrder(route);
  const batches: WorkItemId[][] = [];
  let current: WorkItemId[] = [];

  for (const item of order) {
    if (current.length >= Math.max(1, parallelism)) {
      batches.push(current);
      current = [];
    }
    current.push(item);
  }

  if (current.length > 0) {
    batches.push(current);
  }

  return batches.map((batch) => [...batch]);
};

export const ensureRouteCompleteness = (route: RecoveryRoute): boolean => {
  const ids = new Set(route.nodes.map((node) => node.id));
  return route.nodes.every((node) => node.dependsOn.every((dep) => ids.has(dep)));
};

export const asReadonlyRoute = (route: RecoveryRoute): Readonly<RecoveryRoute> => ({
  ...route,
  nodes: route.nodes.map((node) => ({
    id: node.id,
    dependsOn: [...node.dependsOn],
    play: { ...node.play },
  })),
});
