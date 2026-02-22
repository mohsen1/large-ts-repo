import type { RecoverySimulationResult, ScenarioId, TenantId, ScenarioWindowState } from '@domain/recovery-scenario-planner';
import type { RecoveryIntelligenceRepository } from '@data/recovery-intelligence-store/src/repository';
import type { StoredRecommendation, StoredForecast } from '@data/recovery-intelligence-store/src/models';
import type { Result } from '@shared/result';
import { ok, fail } from '@shared/result';
import type { StoredScenarioRecord } from './models';

export interface LegacySignalBridge {
  repository: RecoveryIntelligenceRepository;
}

export interface BridgeRecord {
  tenantId: TenantId;
  scenarioId: ScenarioId;
  windowState: ScenarioWindowState;
  runDate: string;
}

export const toScenarioRecord = (
  scenarioId: ScenarioId,
  tenantId: TenantId,
  simulation: RecoverySimulationResult,
): StoredScenarioRecord => ({
  scenarioId,
  tenantId,
  planId: simulation.actionPlan.planId,
  payload: simulation,
  createdAtUtc: new Date().toISOString(),
});

export const emitLegacyIntelligence = async (
  bridge: LegacySignalBridge,
  simulation: RecoverySimulationResult,
): Promise<Result<void, Error>> => {
  const recommendation = {
    recommendationId: `${simulation.scenarioId}-legacy` as StoredRecommendation['recommendationId'],
    tenantId: simulation.tenantId,
    bundleId: simulation.actionPlan.planId,
    recommendation: {
      recommendationId: `${simulation.scenarioId}-legacy` as unknown as string,
      score: simulation.finalRiskScore,
      bucket: 'medium',
      rationale: simulation.notes.join(' | '),
      actions: simulation.actionPlan.sequence as unknown as StoredRecommendation['recommendation']['actions'],
      predictedRiskReduction: simulation.finalRiskScore,
    },
    createdAt: new Date().toISOString(),
    status: 'draft',
  };

  const saveResult = await bridge.repository.saveRecommendation(recommendation as StoredRecommendation);
  if (!saveResult.ok) return fail(saveResult.error);

  const forecast = {
    forecastId: `${simulation.scenarioId}-forecast` as StoredForecast['forecastId'],
    bundleId: simulation.actionPlan.planId,
    forecast: {
      forecastId: `${simulation.scenarioId}-forecast` as unknown as string,
      context: {
        tenantId: simulation.tenantId,
        runId: simulation.actionPlan.planId as unknown as string,
        serviceName: 'recovery-scenario-orchestrator',
        zone: simulation.actionPlan.window.region,
        startedAt: simulation.actionPlan.createdAtUtc,
        metadata: {},
      } as any,
      signalDensity: simulation.notes.length,
      meanRecoveryMinutes: simulation.actionPlan.estimatedCompletionMinutes,
      confidence: simulation.actionPlan.aggregateConfidence,
      confidenceBySignal: { availability: 0, latency: 0, dataQuality: 0, compliance: 0 },
    },
    generatedAt: new Date().toISOString(),
  };

  return bridge.repository.saveForecast(forecast);
};

export const summarizeBridges = (_input: readonly BridgeRecord[]): string => {
  return `bridged=${_input.length}`;
};
