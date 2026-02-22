import type { Brand } from '@shared/type-level';
import type { IncidentRecord, IncidentSignal, IncidentId, SeverityBand } from './types';

export type IncidentFamily = 'platform' | 'application' | 'network' | 'data' | 'security' | 'supply-chain' | 'unknown';

export type ReadinessFactor = 'availability' | 'integrity' | 'latency' | 'consistency' | 'capacity';

export interface IncidentCategory {
  readonly tenantId: string;
  readonly region: string;
  readonly family: IncidentFamily;
  readonly primarySignal: IncidentSignal;
  readonly severity: SeverityBand;
  readonly confidence: number;
  readonly impactScore: number;
}

export interface FamilyWeights {
  readonly family: IncidentFamily;
  readonly weight: number;
  readonly factors: Readonly<Record<ReadinessFactor, number>>;
}

export interface IncidentCluster {
  readonly id: Brand<string, 'incident-cluster-id'>;
  readonly family: IncidentFamily;
  readonly tenantId: string;
  readonly incidents: readonly IncidentId[];
  readonly aggregateImpact: number;
  readonly latestAt: string;
}

export const defaultFamilyWeights: readonly FamilyWeights[] = [
  { family: 'platform', weight: 1.25, factors: { availability: 1, integrity: 0.8, latency: 0.9, consistency: 0.5, capacity: 0.8 } },
  { family: 'application', weight: 1.05, factors: { availability: 0.9, integrity: 0.7, latency: 1.1, consistency: 0.8, capacity: 0.7 } },
  { family: 'network', weight: 1.2, factors: { availability: 1.0, integrity: 0.6, latency: 1.3, consistency: 0.3, capacity: 0.7 } },
  { family: 'data', weight: 1.15, factors: { availability: 0.9, integrity: 1.2, latency: 0.8, consistency: 1.25, capacity: 0.6 } },
  { family: 'security', weight: 1.4, factors: { availability: 0.7, integrity: 1.35, latency: 0.5, consistency: 0.95, capacity: 0.4 } },
  { family: 'supply-chain', weight: 1.05, factors: { availability: 0.8, integrity: 0.9, latency: 0.7, consistency: 0.85, capacity: 0.65 } },
  { family: 'unknown', weight: 1, factors: { availability: 0.8, integrity: 0.8, latency: 0.8, consistency: 0.8, capacity: 0.8 } },
];

const signalWeights = {
  p95_latency_ms: 0.15,
  error_rate: 0.28,
  replication_lag_seconds: 0.1,
  dropped_packets: 0.12,
  unauthorized_attempts: 0.2,
  disk_utilization: 0.05,
  queue_depth: 0.1,
} as const satisfies Record<string, number>;

export const chooseFamilyFromSignals = (incident: IncidentRecord): IncidentFamily => {
  if (incident.scope.serviceName.includes('sso') || incident.scope.serviceName.includes('auth')) {
    return 'security';
  }
  if (incident.signals.some((signal) => signal.name.includes('ssl') || signal.name.includes('cipher'))) {
    return 'security';
  }
  if (incident.signals.some((signal) => signal.name.includes('api') || signal.name.includes('http'))) {
    return 'network';
  }
  if (incident.signals.some((signal) => signal.name.includes('db') || signal.name.includes('sql') || signal.name.includes('index'))) {
    return 'data';
  }
  if (incident.signals.some((signal) => signal.name.includes('cpu') || signal.name.includes('mem') || signal.name.includes('disk'))) {
    return 'platform';
  }
  if (incident.signals.some((signal) => signal.name.includes('latency') || signal.name.includes('sla'))) {
    return 'application';
  }
  if (incident.labels.includes('supply-chain')) {
    return 'supply-chain';
  }
  return 'application';
};

const normalizeSignal = (value: number, threshold: number): number =>
  Math.min(1, Math.max(0, value / Math.max(threshold, 1)));

export const scoreIncidentCategory = (incident: IncidentRecord): IncidentCategory => {
  const primarySignal = incident.signals.reduce((winner, signal) => {
    const score = normalizeSignal(signal.value, signal.threshold);
    const winnerScore = normalizeSignal(winner.value, winner.threshold);
    return score >= winnerScore ? signal : winner;
  }, incident.signals[0]);

  const family = chooseFamilyFromSignals(incident);
  const familyConfig = defaultFamilyWeights.find((entry) => entry.family === family) ?? defaultFamilyWeights.at(-1)!;
  const rawImpact = primarySignal.value + incident.snapshots.length;
  const confidence = normalizeSignal(incident.signals.length + incident.labels.length * 2, 10);
  const weightedImpact = normalizeSignal(rawImpact, 100) * familyConfig.weight;

  return {
    tenantId: incident.scope.tenantId,
    region: incident.scope.region,
    family,
    primarySignal,
    severity: incident.severity,
    confidence,
    impactScore: Number((weightedImpact * (1 + confidence)).toFixed(4)),
  };
};

export const bucketByFamily = (incidents: readonly IncidentRecord[]): Readonly<Record<IncidentFamily, readonly IncidentId[]>> => {
  const result: Record<IncidentFamily, IncidentId[]> = {
    platform: [],
    application: [],
    network: [],
    data: [],
    security: [],
    'supply-chain': [],
    unknown: [],
  };

  for (const incident of incidents) {
    const family = chooseFamilyFromSignals(incident);
    result[family].push(incident.id);
  }

  return (Object.fromEntries(
    Object.entries(result).map(([family, ids]) => [family, [...ids]]),
  ) as unknown) as Readonly<Record<IncidentFamily, readonly IncidentId[]>>;
};

export const rankFamilies = (incidents: readonly IncidentRecord[]): readonly {
  readonly family: IncidentFamily;
  readonly score: number;
  readonly incidentCount: number;
}[] => {
  const buckets = bucketByFamily(incidents);
  return Object.entries(buckets).map(([family, ids]) => {
    const count = ids.length;
    const base = defaultFamilyWeights.find((entry) => entry.family === family)?.weight ?? 1;
    const score = Number((count * base + Math.log2(Math.max(1, count + 1)) * 0.75).toFixed(4));
    return { family: family as IncidentFamily, score, incidentCount: count };
  }).sort((left, right) => right.score - left.score);
};

export const buildSignalEnvelope = (
  incident: IncidentRecord,
): Readonly<Record<string, number>> => {
  const envelope: Record<string, number> = {};
  for (const signal of incident.signals) {
    const weight = signalWeights[signal.name as keyof typeof signalWeights] ?? 0.05;
    envelope[signal.name] = normalizeSignal(signal.value, signal.threshold) * weight;
  }

  return envelope;
};

export const compareIncidentCategory = (
  left: IncidentCategory,
  right: IncidentCategory,
): number => right.impactScore - left.impactScore;

export const clusterIncidents = (incidents: readonly IncidentRecord[]): readonly IncidentCluster[] => {
  const byTenant = new Map<string, Map<string, IncidentRecord[]>>();

  for (const incident of incidents) {
    const tenantBuckets = byTenant.get(incident.scope.tenantId) ?? new Map<string, IncidentRecord[]>();
    const family = chooseFamilyFromSignals(incident);
    const bucket = tenantBuckets.get(family) ?? [];
    bucket.push(incident);
    tenantBuckets.set(family, bucket);
    byTenant.set(incident.scope.tenantId, tenantBuckets);
  }

  const clusters: IncidentCluster[] = [];
  const now = new Date().toISOString();
  for (const [tenantId, families] of byTenant.entries()) {
    for (const [family, familyIncidents] of families.entries()) {
      const ordered = [...familyIncidents].sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));
      const latest = ordered[0];
      if (!latest) {
        continue;
      }
      const aggregateImpact = familyIncidents.reduce((sum, incident) => {
        return sum + scoreIncidentCategory(incident).impactScore;
      }, 0);
      clusters.push({
        id: `${tenantId}:${family}:${now}` as Brand<string, 'incident-cluster-id'>,
        family: family as IncidentFamily,
        tenantId,
        incidents: familyIncidents.map((incident) => incident.id),
        aggregateImpact: Number(aggregateImpact.toFixed(4)),
        latestAt: latest.detectedAt,
      });
    }
  }

  return clusters.sort((a, b) => b.aggregateImpact - a.aggregateImpact);
};
