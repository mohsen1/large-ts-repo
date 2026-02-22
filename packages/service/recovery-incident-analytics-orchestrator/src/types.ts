import type { IncidentId, IncidentPlan } from '@domain/recovery-incident-orchestration';
import type { SignalEnvelope, SignalRiskProfile } from '@domain/incident-signal-intelligence';
import type { IncidentAnalyticsSnapshot, SignalForecastPoint, ActionableRecommendation } from '@domain/recovery-incident-analytics';
import type { SignalRepository } from '@data/incident-signal-store';
import type { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import type { Result } from '@shared/result';

export type AnalyticsOrchestratorMode = 'overview' | 'incident' | 'simulation';

export interface AnalyticsDependencies {
  readonly signalRepo: SignalRepository;
  readonly incidentRepo: RecoveryIncidentRepository;
}

export interface AnalyticsOrchestratorConfig {
  readonly tenantId: string;
  readonly horizonMinutes: number;
  readonly lookbackMinutes: number;
  readonly minConfidence: number;
  readonly mode: AnalyticsOrchestratorMode;
}

export interface IncidentForecast {
  readonly incidentId: IncidentId;
  readonly plan: IncidentPlan;
  readonly runsExpected: number;
}

export interface AnalyticsEvaluation {
  readonly snapshot: IncidentAnalyticsSnapshot;
  readonly forecastWindows: readonly SignalForecastPoint[];
  readonly recommendations: readonly ActionableRecommendation[];
}

export interface AnalyticsAlert {
  readonly incidentId: IncidentId;
  readonly level: 'info' | 'warning' | 'critical';
  readonly message: string;
}

export interface SignalBundle {
  readonly signal: SignalEnvelope;
  readonly profile: SignalRiskProfile;
}

export type AnalyticsResult<T> = Result<T, Error>;
