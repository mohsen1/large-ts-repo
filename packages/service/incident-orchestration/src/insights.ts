import { IncidentRecord } from '@domain/incident-management';
import { summarize } from '@data/incident-hub/queries';
import { forecastByIncidentBatch, forecastConfidenceSchema } from '@domain/incident-management';
import { buildResolutionSummary, buildResolutionRunbook, canAutoClose } from '@domain/incident-management';

export interface IncidentRiskInsight {
  readonly incidentId: string;
  readonly tenantId: string;
  readonly title: string;
  readonly riskScore: number;
  readonly confidence: number;
  readonly autoClose: boolean;
}

export interface BatchRiskSummary {
  readonly tenantId: string;
  readonly incidents: readonly IncidentRiskInsight[];
  readonly highRisk: number;
  readonly autoCloseable: number;
  readonly avgRisk: number;
}

const clamp = (value: number): number => Number(Math.max(0, Math.min(100, value)).toFixed(3));

export const evaluateIncidentRisk = (incident: IncidentRecord): IncidentRiskInsight => {
  const summary = summarize(incident);
  const forecast = forecastByIncidentBatch([incident], 5, 15)[0];
  const runbook = buildResolutionRunbook(incident);
  const resolution = buildResolutionSummary(runbook);
  const baseRisk = (summary.ageMinutes / 10) + incident.triage.confidence * 12 + resolution.riskScore;
  const withForecast = baseRisk + (forecast.requiresManualReview ? 12 : 0);

  return {
    incidentId: incident.id,
    tenantId: incident.tenantId,
    title: incident.title,
    riskScore: clamp(withForecast),
    confidence: Number(forecastConfidenceSchema.parse(forecast.confidence).toFixed(3)),
    autoClose: canAutoClose(incident, runbook) && incident.state !== 'false-positive',
  };
};

export const summarizeBatchRisk = (incidents: readonly IncidentRecord[]): BatchRiskSummary => {
  const all = incidents.map(evaluateIncidentRisk);
  const autoCloseable = all.filter((item) => item.autoClose).length;
  const highRisk = all.filter((item) => item.riskScore >= 70).length;
  const avgRisk = all.length ? all.reduce((acc, item) => acc + item.riskScore, 0) / all.length : 0;

  return {
    tenantId: incidents[0]?.tenantId ?? 'unknown',
    incidents: all,
    highRisk,
    autoCloseable,
    avgRisk: clamp(avgRisk),
  };
};
