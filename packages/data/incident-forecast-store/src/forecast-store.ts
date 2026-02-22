import { makeForecastDocument, type ForecastDocument } from './models';
import type { IngestedSignalBatch } from './signal-ingester';
import { buildForecastPlan, evaluateRisk, forecastedDowntime, type ServiceDependencyNode } from '@domain/incident-forecasting';
import { fail, ok, type Result } from '@shared/result';
import type { SignalObservation } from '@domain/incident-forecasting';

export interface ForecastRepository {
  save(document: ForecastDocument): Promise<void>;
  listByTenant(tenantId: string): Promise<readonly ForecastDocument[]>;
}

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class MemoryForecastRepository implements ForecastRepository {
  private readonly store: ForecastDocument[] = [];

  async save(document: ForecastDocument): Promise<void> {
    this.store.push(deepClone(document));
  }

  async listByTenant(tenantId: string): Promise<readonly ForecastDocument[]> {
    return deepClone(this.store.filter((entry) => entry.tenantId === tenantId));
  }
}

export const buildAndPersistForecast = async (
  repository: ForecastRepository,
  batch: IngestedSignalBatch,
): Promise<Result<ForecastDocument, Error>> => {
  const dominantSeverity = batch.signals.reduce((max, signal) => (signal.severity > max ? signal.severity : max), batch.signals[0]?.severity ?? 1);
  const plan = buildForecastPlan(batch.tenantId, dominantSeverity as SignalObservation['severity'], batch.signals);
  const risk = evaluateRisk(
    batch.signals,
    batch.signals.slice(0, 4).map((signal, index) => ({
      id: `dep-${index}` as ServiceDependencyNode['id'],
      component: signal.eventType,
      ownerTeam: signal.sourceSystem,
      criticality: index % 4 === 0 ? 'critical' : 'high',
      blastRadiusMultiplier: 1 + index / 4,
    })),
  );

  const forecast = makeForecastDocument(
    plan,
    {
      score: risk.riskScore,
      confidence: risk.factors[0]?.signalImpact ? Math.min(1, risk.factors[0].signalImpact) : 0.5,
      contributingSignals: risk.factors.map((factor) => factor.dependency.component),
      predictedDowntimeMinutes: forecastedDowntime(risk),
    },
    batch.signals,
  );

  if (forecast.ok === false) {
    return fail(forecast.error);
  }

  await repository.save(forecast.value);
  return ok(forecast.value);
};
