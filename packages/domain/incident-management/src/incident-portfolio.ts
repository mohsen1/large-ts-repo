import { toRfc3339, floorToMinute, addMinutes, buildMinutes } from '@shared/util';
import type { IncidentRecord, IncidentSeverity, IncidentId, ServiceId, TenantId } from './types';
import { severityRank } from './types';

export interface PortfolioCell {
  readonly incidentId: IncidentId;
  readonly serviceId: ServiceId;
  readonly severity: IncidentSeverity;
  readonly state: IncidentRecord['state'];
  readonly score: number;
}

export interface PortfolioConfig {
  readonly tenantId: TenantId;
  readonly includeResolved: boolean;
  readonly maxCells?: number;
}

export interface PortfolioSnapshot {
  readonly tenantId: TenantId;
  readonly generatedAt: string;
  readonly cells: readonly PortfolioCell[];
  readonly total: number;
  readonly activeCount: number;
  readonly resolvedCount: number;
  readonly avgSeverity: number;
  readonly critical: number;
}

export interface ReadinessBand {
  readonly low: number;
  readonly medium: number;
  readonly high: number;
}

export interface ReadinessLane {
  readonly label: string;
  readonly incidents: readonly PortfolioCell[];
  readonly score: number;
}

const severityScore = (severity: IncidentSeverity): number => {
  if (severity === 'sev1') return 100;
  if (severity === 'sev2') return 75;
  if (severity === 'sev3') return 50;
  return 25;
};

const statePenalty = (state: IncidentRecord['state']): number =>
  state === 'resolved' || state === 'false-positive' ? 0 : 30;

export const scoreIncident = (incident: IncidentRecord): number => {
  const confidence = Math.max(0, Math.min(1, incident.triage.confidence));
  return Math.round(severityScore(incident.triage.severity) * confidence - statePenalty(incident.state));
};

export const toCell = (incident: IncidentRecord): PortfolioCell => ({
  incidentId: incident.id,
  serviceId: incident.serviceId,
  severity: incident.triage.severity,
  state: incident.state,
  score: scoreIncident(incident),
});

export const buildReadinessBands = (cells: readonly PortfolioCell[]): ReadinessBand => {
  const initial = { low: 0, medium: 0, high: 0 };
  return cells.reduce(
    (acc, cell) => {
      if (cell.score < 40) {
        return {
          low: acc.low + 1,
          medium: acc.medium,
          high: acc.high,
        };
      }

      if (cell.score < 75) {
        return {
          low: acc.low,
          medium: acc.medium + 1,
          high: acc.high,
        };
      }

      return {
        low: acc.low,
        medium: acc.medium,
        high: acc.high + 1,
      };
    },
    initial,
  );
};

export const buildPortfolio = (
  incidents: readonly IncidentRecord[],
  config: Partial<PortfolioConfig> = {},
): PortfolioSnapshot => {
  const tenantId = config.tenantId ?? incidents[0]?.tenantId ?? ('tenant:unknown' as TenantId);
  const includeResolved = config.includeResolved ?? true;
  const filtered = incidents.filter((incident) => includeResolved || (incident.state !== 'resolved' && incident.state !== 'false-positive'));

  const scored = filtered.map(toCell);
  const sorted = scored
    .slice()
    .sort((left, right) => right.score - left.score || severityRank[left.severity] - severityRank[right.severity]);

  const maxCells = config.maxCells ?? sorted.length;
  const cells = sorted.slice(0, maxCells);

  const active = cells.filter((cell) => cell.state !== 'resolved' && cell.state !== 'false-positive');
  const critical = cells.filter((cell) => cell.severity === 'sev1').length;
  const resolvedCount = cells.filter((cell) => cell.state === 'resolved' || cell.state === 'false-positive').length;
  const avgSeverity = cells.length ? Number((cells.reduce((acc, item) => acc + severityRank[item.severity], 0) / cells.length).toFixed(3)) : 0;

  return {
    tenantId,
    generatedAt: toRfc3339(new Date()),
    cells,
    total: cells.length,
    activeCount: active.length,
    resolvedCount,
    avgSeverity,
    critical,
  };
};

export const summarizePortfolio = (snapshot: PortfolioSnapshot): ReadinessLane[] => {
  const byState = new Map<IncidentRecord['state'], PortfolioCell[]>();
  for (const cell of snapshot.cells) {
    const prior = byState.get(cell.state) ?? [];
    byState.set(cell.state, [...prior, cell]);
  }
  return [...byState.entries()].map(([state, items]) => ({
    label: state,
    incidents: items,
    score: items.reduce((acc, item) => acc + item.score, 0) / Math.max(1, items.length),
  }));
};

export const buildReadinessLanes = (snapshot: PortfolioSnapshot): readonly ReadinessLane[] => {
  const bySeverity = new Map<IncidentSeverity, PortfolioCell[]>();
  for (const cell of snapshot.cells) {
    const current = bySeverity.get(cell.severity) ?? [];
    bySeverity.set(cell.severity, [...current, cell]);
  }
  return [...bySeverity.entries()].map(([severity, incidents]) => ({
    label: severity,
    incidents,
    score: incidents.reduce((acc, incident) => acc + incident.score, 0) / Math.max(1, incidents.length),
  }));
};

export const buildReadinessWindow = (tenantId: TenantId): readonly { readonly at: string; readonly score: number }[] => {
  const anchor = floorToMinute(new Date());
  void tenantId;
  const points = buildMinutes(anchor, addMinutes(anchor, 5));
  return points.map((minute, index) => ({ at: toRfc3339(new Date(minute * 60000)), score: Math.max(0, 100 - index * 2) }));
};
