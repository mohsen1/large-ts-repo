import type { IncidentRecord, IncidentPlan, IncidentPlanId } from './types';
import { createPlan } from './planner';

export interface CadenceWindow {
  readonly id: string;
  readonly label: string;
  readonly opensAt: string;
  readonly closesAt: string;
  readonly timezone: string;
}

export interface CadenceEnvelope {
  readonly planId: IncidentPlanId;
  readonly incidentId: string;
  readonly windows: readonly CadenceWindow[];
  readonly guard: {
    readonly maxParallelism: number;
    readonly maxAttempts: number;
    readonly canAutoAdvance: boolean;
  };
  readonly constraints: Readonly<Record<string, string>>;
}

export interface CadenceRule {
  readonly scope: {
    readonly tenantId: string;
    readonly region: string;
    readonly serviceName: string;
  };
  readonly maxWindowMinutes: number;
  readonly maxRouteLength: number;
  readonly allowAutoEscalation: boolean;
  readonly requirePostMortem: boolean;
}

export interface CadenceDiff {
  readonly base: CadenceEnvelope;
  readonly updated: CadenceEnvelope;
  readonly changedFields: readonly string[];
}

const buildWindow = (planId: IncidentPlan['id'], index: number, startAt: number, durationMinutes: number): CadenceWindow => ({
  id: `${String(planId)}:${index}`,
  label: `window-${index + 1}`,
  opensAt: new Date(startAt).toISOString(),
  closesAt: new Date(startAt + durationMinutes * 60_000).toISOString(),
  timezone: 'UTC',
});

const inferCadenceRule = (incident: IncidentRecord): CadenceRule => {
  const needsStrict = incident.labels.includes('critical') || incident.labels.includes('escalation-required');
  const service = incident.scope.serviceName.toLowerCase();
  return {
    scope: {
      tenantId: incident.scope.tenantId,
      region: incident.scope.region,
      serviceName: incident.scope.serviceName,
    },
    maxWindowMinutes: needsStrict ? 60 : 45,
    maxRouteLength: needsStrict ? 12 : 9,
    allowAutoEscalation: !needsStrict || incident.labels.includes('on-call-on'),
    requirePostMortem: service.includes('finance') || service.includes('payments'),
  };
};

const calculateGuard = (plan: IncidentPlan, rule: CadenceRule): CadenceEnvelope['guard'] => {
  const maxAttempts = Math.min(5, rule.maxRouteLength);
  const canAutoAdvance = plan.riskScore <= 0.45 && rule.allowAutoEscalation;
  return {
    maxParallelism: Math.max(1, Math.floor(10 / Math.max(1, plan.route.nodes.length))),
    maxAttempts,
    canAutoAdvance,
  };
};

const buildConstraints = (incident: IncidentRecord, rule: CadenceRule, plan: IncidentPlan): Record<string, string> => {
  const constraints: Record<string, string> = {
    tenant: incident.scope.tenantId,
    service: incident.scope.serviceName,
    region: incident.scope.region,
    severity: incident.severity,
    maxWindowMinutes: String(rule.maxWindowMinutes),
    maxRouteLength: String(rule.maxRouteLength),
    planWindowCount: String(plan.windows.length),
  };

  if (rule.requirePostMortem) {
    constraints.postMortem = 'required';
  }
  if (rule.allowAutoEscalation) {
    constraints.autoEscalation = 'enabled';
  } else {
    constraints.autoEscalation = 'disabled';
  }
  constraints.routeLengthStatus = String(plan.route.nodes.length <= rule.maxRouteLength);

  return constraints;
};

const asWindowMinutes = (plan: IncidentPlan): number => {
  if (plan.windows.length === 0) {
    return 30;
  }
  const first = Date.parse(plan.windows[0]!.startAt);
  const last = Date.parse(plan.windows[plan.windows.length - 1]!.endAt);
  const totalMinutes = Math.max(1, Math.ceil((last - first) / 60_000));
  return totalMinutes;
};

export const materializeCadence = (incident: IncidentRecord, seed: string): CadenceEnvelope => {
  const rule = inferCadenceRule(incident);
  const plan = createPlan(incident, seed) as IncidentPlan;
  const windows = plan.route.nodes.flatMap((_, index) => {
    const duration = asWindowMinutes(plan);
    const startAt = Date.parse(plan.windows[index % plan.windows.length]?.startAt ?? new Date().toISOString());
    return [buildWindow(plan.id, index, startAt + index * duration * 60_000, rule.maxWindowMinutes)];
  });
  const guard = calculateGuard(plan, rule);
  const constraints = buildConstraints(incident, rule, plan);

  return {
    planId: plan.id,
    incidentId: String(incident.id),
    windows,
    guard,
    constraints,
  };
};

export const compareCadence = (left: CadenceEnvelope, right: CadenceEnvelope): CadenceDiff => {
  const changed: string[] = [];
  if (left.guard.maxAttempts !== right.guard.maxAttempts) {
    changed.push('maxAttempts');
  }
  if (left.guard.maxParallelism !== right.guard.maxParallelism) {
    changed.push('maxParallelism');
  }
  if (left.guard.canAutoAdvance !== right.guard.canAutoAdvance) {
    changed.push('canAutoAdvance');
  }
  if (left.windows.length !== right.windows.length) {
    changed.push('windows.length');
  }

  const newConstraints = Object.entries(right.constraints).filter(([key, value]) => left.constraints[key] !== value).map(([key]) => key);
  changed.push(...newConstraints);

  const unique = [...new Set(changed)];
  return { base: left, updated: right, changedFields: unique };
};

export const summarizeCadence = (envelope: CadenceEnvelope): string[] =>
  [
    `plan=${envelope.planId}`,
    `windows=${envelope.windows.length}`,
    `parallelism=${envelope.guard.maxParallelism}`,
    `attempts=${envelope.guard.maxAttempts}`,
    `auto=${envelope.guard.canAutoAdvance}`,
    `constraints=${Object.keys(envelope.constraints).length}`,
  ];
