import type { RecoveryRecommendation, RecoveryForecast, RecoverySignalBundle } from '@domain/recovery-intelligence';

export interface IntelligenceRunRequest {
  readonly bundle: RecoverySignalBundle;
  readonly planHorizonMinutes?: number;
  readonly dryRun?: boolean;
}

export interface IntelligenceRunResult {
  readonly bundleId: RecoverySignalBundle['bundleId'];
  readonly forecast: RecoveryForecast;
  readonly recommendation: RecoveryRecommendation;
  readonly status: 'ok' | 'error';
  readonly errors: readonly string[];
}
