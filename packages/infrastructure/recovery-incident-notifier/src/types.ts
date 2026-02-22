import type { Result } from '@shared/result';
import type { IncidentForecast, IncidentReadiness } from '@domain/recovery-incident-insights/src';

export interface IncidentReadinessMessage {
  readonly tenantId: IncidentReadiness['tenantId'];
  readonly incidentId: IncidentReadiness['incidentId'];
  readonly readinessScore: number;
  readonly state: IncidentReadiness['state'];
  readonly observedUntil: string;
  readonly generatedAt: string;
}

export interface ForecastPublishedMessage {
  readonly tenantId: IncidentForecast['tenantId'];
  readonly forecastId: IncidentForecast['forecastId'];
  readonly bundleId: IncidentForecast['bundleId'];
  readonly planConfidence: number;
  readonly actions: number;
}

export interface IncidentNotifier {
  publishReadiness(payload: IncidentReadinessMessage): Promise<Result<void, Error>>;
  publishForecast(payload: ForecastPublishedMessage): Promise<Result<void, Error>>;
}
