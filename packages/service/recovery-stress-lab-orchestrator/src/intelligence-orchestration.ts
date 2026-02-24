import { createSignalId, type OrchestrationPlan, type RecoverySimulationResult } from '@domain/recovery-stress-lab';
import {
  type IntelligenceBundle,
  type Recommendation,
  normalizeRecommendationTimeline,
  buildIntelligenceSnapshot,
  mapByPhase,
  type IntelligenceInputs,
} from '@domain/recovery-stress-lab-intelligence';

export interface StressLabIntelligenceOrchestratorConfig {
  readonly tenantId: string;
  readonly runName: string;
  readonly maxRecommendations?: number;
}

export interface StressLabIntelligenceOrchestrateResult {
  readonly tenantId: string;
  readonly runName: string;
  readonly bundle: IntelligenceBundle;
  readonly timeline: readonly Record<string, unknown>[];
  readonly phaseGroups: ReadonlyMap<string, readonly Recommendation[]>;
}

export const normalizePhaseCount = (count: number): number => {
  if (!Number.isFinite(count)) return 1;
  return Math.max(1, Math.min(99, Math.trunc(count)));
};

export const collectStressLabIntelligence = async (
  config: StressLabIntelligenceOrchestratorConfig,
  plan: OrchestrationPlan,
  simulation: RecoverySimulationResult,
): Promise<StressLabIntelligenceOrchestrateResult> => {
  const tenantId = config.tenantId;
  const selectedSignals = simulation.ticks
    .slice(0, normalizePhaseCount(simulation.ticks.length))
    .map((tick, index) =>
      createSignalId(`${tenantId}-signal-${index}-risk-${tick.blockedWorkloads.length ? tick.blockedWorkloads[0] : 'clear'}`),
    );

  const inputs: IntelligenceInputs = {
    tenantId: tenantId as any,
    plan,
    simulation,
    topology: {
      tenantId: tenantId as any,
      nodes: [],
      edges: [],
    },
  };

  const bundle = await normalizeRecommendationTimeline(inputs);
  const max = normalizePhaseCount(config.maxRecommendations ?? bundle.recommendations.length);

  const recommendations = bundle.recommendations.toSorted((left, right) =>
    left.estimatedMitigationMinutes - right.estimatedMitigationMinutes,
  );

  const timeline = buildIntelligenceSnapshot(recommendations.slice(0, max));
  const phaseGroups = mapByPhase(recommendations) as ReadonlyMap<string, readonly Recommendation[]>;

  return {
    tenantId,
    runName: `${config.runName}:intel`,
    bundle: {
      ...bundle,
      recommendations: recommendations.toSorted((left, right) => {
        if (left.severity === right.severity) {
          return left.estimatedMitigationMinutes - right.estimatedMitigationMinutes;
        }
        return left.severity.localeCompare(right.severity);
      }),
    },
    timeline,
    phaseGroups,
  };
};

export const buildIntelligenceReport = async (
  config: StressLabIntelligenceOrchestratorConfig,
  plan: OrchestrationPlan,
  simulation: RecoverySimulationResult,
): Promise<string> => {
  const result = await collectStressLabIntelligence(config, plan, simulation);
  const phaseOrder = [...result.phaseGroups.keys()].toSorted().join(',');
  const top = result.bundle.recommendations.at(0);
  const summary = `tenant=${result.tenantId}` +
    ` run=${result.runName}` +
    ` phases=${phaseOrder}` +
    ` top=${top?.code ?? 'none'}` +
    ` count=${result.bundle.recommendations.length}`;

  return summary;
};
