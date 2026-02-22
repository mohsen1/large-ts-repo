import type { RecoveryReadinessPlanDraft, ReadinessPolicy, ReadinessSignal, ReadinessRunId } from '@domain/recovery-readiness';
import {
  type SimulationConstraint,
  type SimulationGraph,
  type SimulationPlan,
  type SimulationPlanInput,
  type SimulationPolicyEnvelope,
  createPolicyEnvelope,
} from './types';

export interface SimulationBuildContext {
  readonly tenant: string;
  readonly draft: RecoveryReadinessPlanDraft;
  readonly policy: ReadinessPolicy;
  readonly signals: readonly ReadinessSignal[];
  readonly runId: ReadinessRunId;
  readonly constraints?: SimulationConstraint;
  readonly seed?: number;
}

export interface SimulationBuildNode {
  readonly id: string;
  readonly owner: 'sre' | 'platform' | 'core' | 'security';
  readonly criticality: 1 | 2 | 3 | 4 | 5;
  readonly expectedSignalsPerMinute: number;
}

export const buildGraphFromDraft = (context: {
  readonly draft: { readonly targetIds: readonly string[] };
  readonly nodes?: readonly SimulationBuildNode[];
}): SimulationGraph => {
  const nodes = (context.nodes ?? context.draft.targetIds.map((targetId, index) => ({
    id: targetId,
    owner: 'sre' as const,
    criticality: (((index % 5) + 1) as 1 | 2 | 3 | 4 | 5),
    expectedSignalsPerMinute: ((index % 3) + 1),
  }))).map((node) => ({
    id: node.id,
    owner: node.owner,
    criticality: node.criticality,
    region: 'global',
    expectedSignalsPerMinute: node.expectedSignalsPerMinute,
  }));

  const dependencies = nodes.slice(1).map((node, index) => ({
    from: nodes[Math.max(0, index - 1)]?.id ?? node.id,
    to: node.id,
    reason: index % 2 === 0 ? 'staging-order' : 'precedence-order',
  }));

  return { nodes, dependencies };
};

export const defaultPolicyEnvelope = (
  context: SimulationBuildContext,
  constraints: SimulationConstraint,
): SimulationPolicyEnvelope =>
  createPolicyEnvelope({
    tenant: context.tenant,
    planId: `plan:${context.runId}`,
    policy: context.policy,
    constraints,
    seed: context.seed ?? context.draft.targetIds.length,
  });

export const planSeedFromInput = (input: SimulationPlanInput, constraintSignalCount: number): number =>
  input.runId.length + input.draft.targetIds.length + input.signals.length + constraintSignalCount;

export const normalizePlan = (plan: SimulationPlan): SimulationPlan => ({
  ...plan,
  createdAt: new Date().toISOString(),
  projectedSignals: [...plan.projectedSignals],
  waves: [...plan.waves].sort((first, second) => first.readyAt.localeCompare(second.readyAt)),
});
