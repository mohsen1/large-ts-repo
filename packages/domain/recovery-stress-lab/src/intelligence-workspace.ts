import {
  createTenantId,
  type RecoverySimulationResult,
  type OrchestrationPlan,
  type TenantId,
  type WorkloadTopology,
} from './models';
import {
  normalizeRecommendationTimeline,
  buildIntelligenceSnapshot,
  mapByPhase,
  type IntelligenceBundle,
  type IntelligenceInputs,
} from '@domain/recovery-stress-lab-intelligence';

export interface StressWorkspaceIntelligence {
  readonly tenantId: TenantId;
  readonly bundle: IntelligenceBundle;
  readonly timeline: readonly Record<string, unknown>[];
  readonly grouped: ReadonlyMap<string, readonly unknown[]>;
}

export const collectWorkspaceIntelligence = async (
  tenant: string,
  inputs: {
    plan: OrchestrationPlan;
    simulation: RecoverySimulationResult;
    topology: WorkloadTopology;
  },
): Promise<StressWorkspaceIntelligence> => {
  const tenantId = createTenantId(tenant);
  const intelligenceInputs: IntelligenceInputs = {
    tenantId,
    plan: inputs.plan,
    simulation: inputs.simulation,
    topology: inputs.topology,
  };

  const bundle = await normalizeRecommendationTimeline(intelligenceInputs);

  const recommendations = bundle.recommendations;
  return {
    tenantId,
    bundle,
    timeline: buildIntelligenceSnapshot(recommendations),
    grouped: mapByPhase(recommendations) as ReadonlyMap<string, readonly unknown[]>,
  };
};

export const summarizeWorkspaceIntelligence = async (
  tenantId: TenantId,
  summary: {
    plan: OrchestrationPlan;
    simulation: RecoverySimulationResult;
    topology: WorkloadTopology;
  },
): Promise<string> => {
  const collected = await collectWorkspaceIntelligence(tenantId, summary);
  const topSeverity = collected.timeline.map((entry) => String(entry.severity ?? 'low')).toSorted().join(',');
  const keys = [...collected.grouped.keys()];

  return [
    `tenant:${collected.tenantId}`,
    `recommendations:${collected.bundle.summary.total}`,
    `severity:${topSeverity}`,
    `phases:${keys.join('|')}`,
  ].join(' | ');
};
