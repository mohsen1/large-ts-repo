import { z } from 'zod';
import type { IncidentRecord } from '@domain/incident-management';
import { fail, ok, type Result } from '@shared/result';
import { addMinutes, buildMinutes, floorToMinute } from '@shared/util';

export interface IncidentHealthPoint {
  readonly tenantId: string;
  readonly at: string;
  readonly open: number;
  readonly blocked: number;
  readonly highRisk: number;
}

export interface IncidentWindow {
  readonly tenantId: string;
  readonly from: string;
  readonly to: string;
  readonly value: number;
}

export interface HealthCard {
  readonly tenantId: string;
  readonly generatedAt: string;
  readonly throughput: number;
  readonly trend: 'improving' | 'degrading' | 'flat';
  readonly points: readonly IncidentHealthPoint[];
}

export interface ReadinessSignal {
  readonly id: string;
  readonly tenantId: string;
  readonly at: string;
  readonly score: number;
  readonly signal: 'throughput' | 'blocker' | 'recovery';
  readonly details: string;
}

export const SeverityCountSchema = z.object({
  sev1: z.number().int().nonnegative(),
  sev2: z.number().int().nonnegative(),
  sev3: z.number().int().nonnegative(),
  sev4: z.number().int().nonnegative(),
});

export type SeverityCount = z.infer<typeof SeverityCountSchema>;

const severityCount = (incident: IncidentRecord): SeverityCount => ({
  sev1: incident.triage.severity === 'sev1' ? 1 : 0,
  sev2: incident.triage.severity === 'sev2' ? 1 : 0,
  sev3: incident.triage.severity === 'sev3' ? 1 : 0,
  sev4: incident.triage.severity === 'sev4' ? 1 : 0,
});

export const mergeSeverity = (left: SeverityCount, right: SeverityCount): SeverityCount => ({
  sev1: left.sev1 + right.sev1,
  sev2: left.sev2 + right.sev2,
  sev3: left.sev3 + right.sev3,
  sev4: left.sev4 + right.sev4,
});

export const severityCounts = (incidents: readonly IncidentRecord[]): SeverityCount => {
  return incidents
    .map(severityCount)
    .reduce(
      (acc, current) => mergeSeverity(acc, current),
      { sev1: 0, sev2: 0, sev3: 0, sev4: 0 },
    );
};

const pointForIncidents = (tenantId: string, incidents: readonly IncidentRecord[], at: Date): IncidentHealthPoint => {
  const open = incidents.filter((incident) => incident.state !== 'resolved' && incident.state !== 'false-positive').length;
  const blocked = incidents.filter((incident) => incident.state === 'triaged' && incident.triage.severity === 'sev1').length;
  const highRisk = incidents.filter((incident) =>
    incident.state !== 'resolved' && (incident.triage.severity === 'sev1' || incident.triage.severity === 'sev2'),
  ).length;

  return { tenantId, at: at.toISOString(), open, blocked, highRisk };
};

export const buildWindowedHealth = (
  tenantId: string,
  incidents: readonly IncidentRecord[],
  minutes = 60,
): readonly IncidentHealthPoint[] => {
  const now = new Date();
  const windowed = buildMinutes(floorToMinute(addMinutes(now, -minutes)), now);
  return windowed.map((window) => {
    const pointAt = new Date(window * 60000);
    const visible = incidents.filter((incident) => Date.parse(incident.updatedAt) <= pointAt.getTime());
    return pointForIncidents(tenantId, visible, pointAt);
  });
};

export const inferTrend = (points: readonly IncidentHealthPoint[]): HealthCard['trend'] => {
  if (points.length < 2) return 'flat';
  const latest = points[points.length - 1];
  const previous = points[points.length - 2];
  if (latest.open < previous.open) return 'improving';
  if (latest.open > previous.open) return 'degrading';
  return 'flat';
};

const readinessScore = (incident: IncidentRecord): number => {
  const severityWeight = incident.triage.severity === 'sev1' ? 28 : incident.triage.severity === 'sev2' ? 20 : 12;
  const stateWeight = incident.state === 'resolved' || incident.state === 'false-positive' ? 4 : 16;
  return Math.round(severityWeight + stateWeight + incident.triage.confidence * 20);
};

export const computeReadinessSignals = (tenantId: string, incidents: readonly IncidentRecord[]): readonly ReadinessSignal[] => {
  if (incidents.length === 0) {
    return [
      {
        id: `${tenantId}:empty`,
        tenantId,
        at: new Date().toISOString(),
        score: 0,
        signal: 'recovery',
        details: 'No incidents are currently open.',
      },
    ];
  }

  const score = incidents.reduce((acc, incident) => acc + readinessScore(incident), 0) / incidents.length;
  if (score >= 60) {
    return [
      {
        id: `${tenantId}:throughput`,
        tenantId,
        at: new Date().toISOString(),
        score: Math.round(score),
        signal: 'throughput',
        details: 'Most incidents are progressing through remediation.',
      },
    ];
  }

  if (score >= 40) {
    return [
      {
        id: `${tenantId}:blocker`,
        tenantId,
        at: new Date().toISOString(),
        score: Math.round(score),
        signal: 'blocker',
        details: 'Some high risk incidents may stall operations.',
      },
    ];
  }

  return [
    {
      id: `${tenantId}:recovery`,
      tenantId,
      at: new Date().toISOString(),
      score: Math.round(score),
      signal: 'recovery',
      details: 'Immediate recovery support is recommended.',
    },
  ];
};

export const buildHealthCard = (tenantId: string, incidents: readonly IncidentRecord[]): HealthCard => {
  const points = buildWindowedHealth(tenantId, incidents);
  const throughput = points.reduce((acc, point) => acc + point.open, 0);
  return {
    tenantId,
    generatedAt: new Date().toISOString(),
    throughput,
    trend: inferTrend(points),
    points,
  };
};

export const aggregateByWindow = (
  incidents: readonly IncidentRecord[],
  minutes = 5,
): readonly IncidentWindow[] => {
  const now = new Date();
  const windowStarts = buildMinutes(floorToMinute(addMinutes(now, -minutes * 6)), now);
  return windowStarts.map((start) => {
    const from = new Date(start * 60000).toISOString();
    const to = addMinutes(new Date(start * 60000), 5).toISOString();
    const value = incidents.filter((incident) => Date.parse(incident.updatedAt) >= start * 60000).length;
    return {
      tenantId: incidents[0]?.tenantId ?? 'tenant:unknown',
      from,
      to,
      value,
    };
  });
};

export const classifyWindow = (window: IncidentWindow): 'empty' | 'low' | 'medium' | 'high' => {
  if (window.value <= 0) return 'empty';
  if (window.value < 2) return 'low';
  if (window.value < 4) return 'medium';
  return 'high';
};

export const computeHealth = (
  tenantId: string,
  incidents: readonly IncidentRecord[],
): Result<{ readonly summary: HealthCard; readonly windows: readonly IncidentWindow[]; readonly signals: readonly ReadinessSignal[] }> => {
  try {
    return ok({
      summary: buildHealthCard(tenantId, incidents),
      windows: aggregateByWindow(incidents),
      signals: computeReadinessSignals(tenantId, incidents),
    });
  } catch (error) {
    return fail(error instanceof Error ? error : new Error('compute-health-failed'));
  }
};

export const mergeReadinessSignals = (left: readonly ReadinessSignal[], right: readonly ReadinessSignal[]): ReadinessSignal[] =>
  [...left, ...right].reduce((acc, signal) => {
    if (!acc.some((item) => item.id === signal.id && item.signal === signal.signal)) {
      acc.push(signal);
    }
    return acc;
  }, [] as ReadinessSignal[]);

export const summarizeHealth = (health: HealthCard): { tenantId: string; urgency: number; trend: HealthCard['trend'] } => {
  const risk = health.points.reduce((acc, point) => acc + point.highRisk, 0);
  const base = Math.max(1, health.points.length);
  return {
    tenantId: health.tenantId,
    urgency: Math.round((risk / base) * 100),
    trend: health.trend,
  };
};

export const normalizeWindow = (window: IncidentWindow): IncidentWindow => ({
  tenantId: window.tenantId,
  from: window.from,
  to: window.to,
  value: Number(window.value.toFixed(3)),
});
