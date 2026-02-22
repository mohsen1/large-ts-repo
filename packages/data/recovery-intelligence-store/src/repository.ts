import { ok, fail } from '@shared/result';
import type { Result } from '@shared/result';
import { parseBundle } from '@domain/recovery-intelligence/src';
import type {
  StoredActionPlan,
  StoredForecast,
  StoredRecommendation,
} from './models';
import type { RecoverySignalBundle } from '@domain/recovery-intelligence/src';

type UpsertPayload<T> = Promise<T> | T;

export interface RecoveryIntelligenceRepository {
  saveBundle(bundle: RecoverySignalBundle): Promise<Result<void, Error>>;
  saveForecast(forecast: StoredForecast): Promise<Result<void, Error>>;
  saveRecommendation(recommendation: StoredRecommendation): Promise<Result<void, Error>>;
  upsertPlan(plan: StoredActionPlan): Promise<Result<void, Error>>;
  getActiveRecommendations(tenantId: string): Promise<readonly StoredRecommendation[]>;
  getLatestForecast(bundleId: string): Promise<StoredForecast | undefined>;
}

export class InMemoryRecoveryIntelligenceRepository implements RecoveryIntelligenceRepository {
  private readonly bundles = new Map<string, RecoverySignalBundle>();
  private readonly forecasts = new Map<string, StoredForecast>();
  private readonly recommendations = new Map<string, StoredRecommendation>();
  private readonly plans = new Map<string, StoredActionPlan>();

  async saveBundle(bundle: RecoverySignalBundle): Promise<Result<void, Error>> {
    try {
      parseBundle(bundle);
      this.bundles.set(bundle.bundleId, bundle);
      return ok(undefined);
    } catch (error) {
      return fail(error as Error);
    }
  }

  async saveForecast(forecast: StoredForecast): Promise<Result<void, Error>> {
    this.forecasts.set(forecast.forecastId, forecast);
    return ok(undefined);
  }

  async saveRecommendation(recommendation: StoredRecommendation): Promise<Result<void, Error>> {
    this.recommendations.set(recommendation.recommendationId, recommendation);
    return ok(undefined);
  }

  async upsertPlan(plan: StoredActionPlan): Promise<Result<void, Error>> {
    const outbox: UpsertPayload<StoredActionPlan> = plan;
    const normalized = await Promise.resolve(outbox);
    this.plans.set(normalized.planId, normalized);
    return ok(undefined);
  }

  async getActiveRecommendations(tenantId: string): Promise<readonly StoredRecommendation[]> {
    return Array.from(this.recommendations.values()).filter(
      (recommendation) => recommendation.tenantId === tenantId && recommendation.status === 'active',
    );
  }

  async getLatestForecast(bundleId: string): Promise<StoredForecast | undefined> {
    const candidates = Array.from(this.forecasts.values()).filter((entry) => entry.bundleId === bundleId);
    const sorted = candidates.sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));
    return sorted.at(-1);
  }
}

export const validateBundle = (bundle: RecoverySignalBundle): Result<void, Error> => {
  const parsed = parseBundle(bundle);
  if (!parsed.bundleId) return fail(new Error('invalid-bundle-id'));
  return ok(undefined);
};
