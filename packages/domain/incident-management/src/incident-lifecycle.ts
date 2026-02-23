import { IncidentRecord, IncidentState, EscalationPolicy } from './types';
import { parseIncident } from './schema';
import { buildExecutionPlan } from './runbook';
import { buildForecast } from './forecast';
import { breachedResponseSla, breachedRecoverySla, requiredEscalation } from './sla';
import { incidentAgeMinutes } from './types';

interface IncidentSnapshotLike {
  readonly incidentId: string;
  readonly ageMinutes: number;
  readonly state: IncidentRecord['state'];
}

const snapshot = (incident: IncidentRecord): IncidentSnapshotLike => ({
  incidentId: incident.id,
  ageMinutes: incidentAgeMinutes(incident),
  state: incident.state,
});

export interface LifecycleRoute<TMeta = Record<string, unknown>> {
  readonly fromState: IncidentState;
  readonly toState: IncidentState;
  readonly executedAt: string;
  readonly actor: string;
  readonly metadata?: TMeta;
}

export interface LifecycleContext<TMeta = Record<string, unknown>> {
  readonly route: readonly LifecycleRoute<TMeta>[];
  readonly policy: EscalationPolicy;
  readonly tenantId: string;
  readonly canAutoResolve: boolean;
}

export interface LifecycleEvaluation {
  readonly incidentId: string;
  readonly readyForNext: boolean;
  readonly nextState?: IncidentState;
  readonly reason?: string;
  readonly routeCount: number;
}

const nextByPolicy: Record<IncidentState, IncidentState> = {
  detected: 'triaged',
  triaged: 'mitigating',
  mitigating: 'monitoring',
  monitoring: 'resolved',
  resolved: 'resolved',
  'false-positive': 'resolved',
};

const inferNext = (state: IncidentState, canRecover: boolean): IncidentState => {
  if (state === 'resolved') return 'resolved';
  if (!canRecover) {
    return 'false-positive';
  }
  return nextByPolicy[state];
};

export const resolveNextLifecycleState = (
  incident: IncidentRecord,
  policy: EscalationPolicy,
): LifecycleEvaluation => {
  const summary = snapshot(incident);
  const shouldEscalate = summary.ageMinutes > policy.maxMinutesToAction;
  const hasForecast = buildForecast({
    tenantId: incident.tenantId,
    serviceId: incident.serviceId,
    incident,
    windowSizeMinutes: 5,
    horizonMinutes: 30,
  });
  const plan = buildExecutionPlan([], incident);
  const isRecoverySafe = Boolean(plan) && !hasForecast.requiresManualReview && !shouldEscalate;
  const nextState = inferNext(incident.state, isRecoverySafe);

  if (shouldEscalate && nextState !== 'false-positive') {
    return {
      incidentId: incident.id,
      readyForNext: false,
      reason: 'policy timeout reached',
      routeCount: summary.ageMinutes,
      nextState: 'triaged',
    };
  }

  return {
    incidentId: incident.id,
    readyForNext: true,
    routeCount: summary.ageMinutes,
    nextState,
  };
};

export const evaluateLifecycle = (
  incidents: readonly IncidentRecord[],
): {
  readonly byTenant: Record<string, LifecycleEvaluation[]>;
  readonly escalated: number;
  readonly autoResolved: number;
} => {
  const byTenant: Record<string, LifecycleEvaluation[]> = {};
  let escalated = 0;
  let autoResolved = 0;

  for (const incident of incidents) {
    const policy = requiredEscalation(incident);
    const evaluated = resolveNextLifecycleState(incident, policy);
    if (!byTenant[incident.tenantId]) {
      byTenant[incident.tenantId] = [];
    }
    byTenant[incident.tenantId].push(evaluated);
    if (!evaluated.readyForNext) {
      escalated += 1;
    }
    if (evaluated.nextState === 'resolved') {
      autoResolved += 1;
    }
  }

  return { byTenant, escalated, autoResolved };
};

export const buildIncidentTimeline = (
  incident: IncidentRecord,
  policy: EscalationPolicy,
): readonly LifecycleRoute[] => {
  const summary = snapshot(incident);
  const baseRoute: LifecycleRoute[] = [
    {
      fromState: 'detected',
      toState: 'triaged',
      executedAt: incident.createdAt,
      actor: 'triage-bot',
      metadata: {
        ageMinutes: summary.ageMinutes,
      },
    },
  ];

  if (incident.state === 'resolved' || incident.state === 'false-positive') {
    return [
      ...baseRoute,
      {
        fromState: 'triaged',
        toState: incident.state,
        executedAt: incident.updatedAt,
        actor: 'recovery-plane',
        metadata: {
          finalAction: policy.name,
        },
      },
    ];
  }

  if (incident.state === 'triaged' || incident.state === 'mitigating') {
    return [
      ...baseRoute,
      {
        fromState: 'triaged',
        toState: incident.state,
        executedAt: incident.updatedAt,
        actor: 'runbook-orchestrator',
        metadata: {
          escalation: policy.id,
          slaBreached: breachedResponseSla(incident, policy) || breachedRecoverySla(incident),
        },
      },
    ];
  }

  return baseRoute;
};

export const applyLifecycleMutations = (incident: IncidentRecord, input: IncidentRecord | string): IncidentRecord => {
  const payload = typeof input === 'string' ? parseIncident(input) : { ok: true, value: input as IncidentRecord };
  if (!payload.ok) {
    return incident;
  }

  const now = new Date().toISOString();
  const current = payload.value as IncidentRecord;
  const policy = requiredEscalation(current);
  const result = resolveNextLifecycleState(current, policy);
  if (!result.nextState) return current;

  return {
    ...current,
    state: result.nextState,
    updatedAt: now,
  };
};
