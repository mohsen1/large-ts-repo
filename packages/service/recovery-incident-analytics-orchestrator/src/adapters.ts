import type { SignalRiskProfile } from '@domain/incident-signal-intelligence';
import type { IncidentForecast, AnalyticsAlert } from './types';
import { withBrand } from '@shared/core';

export const buildForecastFromProfiles = (
  incidentId: string,
  profiles: readonly SignalRiskProfile[],
): IncidentForecast[] =>
  profiles.slice(0, 3).map((profile, index) => ({
    incidentId: incidentId as unknown as IncidentForecast['incidentId'],
    plan: {
      id: withBrand(`${incidentId}:plan:${index}`, 'PlanId') as any,
      incidentId: incidentId as unknown as any,
      title: `Auto profile ${index + 1}`,
      windows: [],
      route: {
        id: withBrand(`${incidentId}:route:${index}`, 'RouteId') as any,
        incidentId: incidentId as unknown as any,
        nodes: [],
      },
      metadata: {
        source: 'analytics',
        confidence: String(profile.confidence),
      },
      approved: profile.riskBand === 'low',
      riskScore: profile.impactScore,
    } as any,
    runsExpected: Math.max(1, Math.floor(profile.confidence * 5)),
  }));

export const buildAlerts = (
  incidentId: string,
  profiles: readonly SignalRiskProfile[],
): readonly AnalyticsAlert[] =>
  profiles.map((profile) => ({
    incidentId: incidentId as unknown as IncidentForecast['incidentId'],
    level: profile.riskBand === 'critical' || profile.riskBand === 'high'
      ? 'critical'
      : profile.riskBand === 'moderate'
        ? 'warning'
        : 'info',
    message: `Signal ${String(profile.signalId)} confidence ${profile.confidence.toFixed(3)} risk ${profile.riskBand}`,
  }));
