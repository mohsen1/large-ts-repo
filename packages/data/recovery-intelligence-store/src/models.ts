import type { RecoveryActionCandidate, RecoveryForecast, RecoveryRecommendation, RecoverySignalBundle } from '@domain/recovery-intelligence';

export interface StoredRecommendation {
  readonly recommendationId: RecoveryRecommendation['recommendationId'];
  readonly tenantId: RecoverySignalBundle['context']['tenantId'];
  readonly bundleId: RecoverySignalBundle['bundleId'];
  readonly recommendation: RecoveryRecommendation;
  readonly createdAt: string;
  readonly status: 'draft' | 'active' | 'stale' | 'rejected';
}

export interface StoredForecast {
  readonly forecastId: RecoveryForecast['forecastId'];
  readonly bundleId: RecoverySignalBundle['bundleId'];
  readonly forecast: RecoveryForecast;
  readonly generatedAt: string;
}

export interface StoredActionPlan {
  readonly planId: BrandLike;
  readonly tenantId: RecoverySignalBundle['context']['tenantId'];
  readonly bundleId: RecoverySignalBundle['bundleId'];
  readonly actions: readonly RecoveryActionCandidate[];
  readonly runbook: readonly string[];
  readonly createdAt: string;
}

export type BrandLike = string & { readonly __brand: 'plan-id' };
