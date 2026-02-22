import type { IncidentId, IncidentPlan, IncidentRecord, SeverityBand, IncidentSignal } from './types';
import { buildSeveritySignal, evaluatePolicy } from './policy-engine';
import { createPlan } from './planner';

export interface IncidentPriorityVector {
  readonly incidentId: IncidentId;
  readonly severityWeight: number;
  readonly signalWeight: number;
  readonly ageMinutes: number;
  readonly dependencyPressure: number;
  readonly tenantLoad: number;
  readonly compositeScore: number;
}

export interface IncidentPrioritySlice {
  readonly severity: IncidentRecord['severity'];
  readonly count: number;
  readonly incidents: readonly IncidentId[];
  readonly averageScore: number;
}

export interface PriorityWindow {
  readonly tenantId: string;
  readonly windowFrom: string;
  readonly windowTo: string;
  readonly incidents: readonly IncidentId[];
}

export interface PrioritizationPolicy {
  readonly maxDependencyPressure: number;
  readonly maxTenantShare: number;
  readonly minSignalRatio: number;
}

const severityWeight = (severity: SeverityBand): number => {
  const order: Record<SeverityBand, number> = {
    low: 0.75,
    medium: 1,
    high: 1.4,
    critical: 1.9,
    extreme: 2.35,
  };
  return order[severity] ?? 1;
};

const signalWeight = (signals: readonly IncidentSignal[]): number => {
  if (signals.length === 0) {
    return 0.2;
  }
  const ratios = signals.map((entry) => {
    if (entry.threshold <= 0) {
      return 0;
    }
    return Math.min(2, entry.value / entry.threshold);
  });
  const total = ratios.reduce((acc, ratio) => acc + ratio, 0);
  return Number((total / ratios.length).toFixed(4));
};

const ageMinutes = (detectedAt: string): number => {
  const started = Date.parse(detectedAt);
  if (Number.isNaN(started)) {
    return 0;
  }
  return Math.max(0, (Date.now() - started) / 60_000);
};

const normalizeCount = (value: number, max: number): number => {
  if (max <= 0) {
    return 0;
  }
  return Math.min(1, value / max);
};

export const computeIncidentPriority = (
  incident: IncidentRecord,
  policy: PrioritizationPolicy,
): IncidentPriorityVector => {
  const age = ageMinutes(incident.detectedAt);
  const signals = buildSeveritySignal(incident);
  const normalizedAge = normalizeCount(age, policy.maxDependencyPressure * 60);
  const signalComponent = signalWeight(incident.signals);
  const severity = severityWeight(incident.severity);
  const dependencyPressure = normalizeCount(incident.snapshots.length, policy.maxDependencyPressure);
  const tenantLoad = normalizeCount(incident.signals.length + incident.labels.length, policy.maxTenantShare);
  const compositeScore = Number(
    (severity * (1.25 + normalizedAge + signalComponent + signals.compositeScore + dependencyPressure + tenantLoad)).toFixed(4),
  );

  return {
    incidentId: incident.id,
    severityWeight: severity,
    signalWeight: signalComponent,
    ageMinutes: Number(age.toFixed(2)),
    dependencyPressure,
    tenantLoad,
    compositeScore,
  };
};

export const rankIncidents = (
  incidents: readonly IncidentRecord[],
  policy: PrioritizationPolicy,
): readonly IncidentPriorityVector[] => {
  return incidents
    .map((incident) => computeIncidentPriority(incident, policy))
    .sort((left, right) => right.compositeScore - left.compositeScore);
};

export const buildPriorityWindow = (
  incidents: readonly IncidentRecord[],
  tenantId: string,
  now = new Date(),
): PriorityWindow => {
  const windowFrom = new Date(now.getTime() - 1000 * 60 * 60).toISOString();
  const windowTo = now.toISOString();
  const selected = incidents
    .filter((incident) => incident.scope.tenantId === tenantId)
    .map((incident) => incident.id);

  return {
    tenantId,
    windowFrom,
    windowTo,
    incidents: selected,
  };
};

export const groupPriorityByTenant = (
  ranked: readonly IncidentPriorityVector[],
  incidents: readonly IncidentRecord[],
): Readonly<Record<string, readonly IncidentPriorityVector[]>> => {
  const map = new Map<string, IncidentPriorityVector[]>();
  const tenantByIncident = new Map<IncidentId, string>();
  for (const incident of incidents) {
    tenantByIncident.set(incident.id, incident.scope.tenantId);
  }
  for (const entry of ranked) {
    const tenantId = tenantByIncident.get(entry.incidentId) ?? 'unknown';
    const bucket = map.get(tenantId) ?? [];
    bucket.push(entry);
    map.set(tenantId, bucket);
  }
  return Object.fromEntries(map.entries()) as Readonly<Record<string, readonly IncidentPriorityVector[]>>;
};

export const rankTopByTenant = (
  incidents: readonly IncidentRecord[],
  tenantId: string,
  policy: PrioritizationPolicy,
): readonly IncidentPriorityVector[] => {
  const ranked = rankIncidents(incidents, policy).filter((entry) => {
    const tenant = incidents.find((incident) => incident.id === entry.incidentId)?.scope.tenantId;
    return tenant === tenantId;
  });
  return ranked;
};

export const createAutoPlanCandidates = (
  incidents: readonly IncidentRecord[],
  seedPrefix: string,
): readonly IncidentPlan[] =>
  incidents
    .map((incident) => {
      try {
        return createPlan(incident, `${seedPrefix}:${incident.id}`) as IncidentPlan;
      } catch {
        return undefined;
      }
    })
    .filter((entry): entry is IncidentPlan => entry !== undefined)
    .filter((plan) => {
      const policyProfile = evaluatePolicy(incidents.find((incident) => incident.id === plan.incidentId)!, `${plan.id}:audit`, {
        incidentId: plan.incidentId,
        maxRisk: 0.9,
        maxRouteLength: 24,
        maxBatchCount: 15,
        maxCriticalPathMinutes: 1000,
      });
      return policyProfile.passingConstraints >= 2;
    });

export const summarizeBySeverity = (
  incidents: readonly IncidentRecord[],
): readonly IncidentPrioritySlice[] => {
  const bySeverity = new Map<SeverityBand, {
    totalSignalWeight: number;
    total: number;
    ids: IncidentId[];
  }>();

  for (const incident of incidents) {
    const bucket = bySeverity.get(incident.severity) ?? {
      totalSignalWeight: 0,
      total: 0,
      ids: [],
    };
    const score = buildSeveritySignal(incident).compositeScore;
    bySeverity.set(incident.severity, {
      totalSignalWeight: bucket.totalSignalWeight + score,
      total: bucket.total + 1,
      ids: [...bucket.ids, incident.id],
    });
  }

  return Array.from(bySeverity.entries())
    .map(([severity, aggregate]) => ({
      severity,
      count: aggregate.total,
      incidents: aggregate.ids,
      averageScore: Number((aggregate.totalSignalWeight / Math.max(1, aggregate.total)).toFixed(4)),
    }));
}
