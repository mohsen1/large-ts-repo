import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import {
  buildAllocations,
  buildSignalBuckets,
  estimateSignalMix,
  scorePlanFromAllocations,
} from './planner';
import {
  defaultConstraint,
  SimulationConstraint,
  SimulationPolicyViolation,
  type SimulationAllocation,
  type SimulationPlan,
  type SimulationPlanEnvelope,
  type SimulationPlanInput,
  type SimulationSummary,
  makeSimulationRunId,
  type SimulationWindow,
  makeSimulationWaveId,
} from './types';
import { defaultPolicyEnvelope } from './adapters';
import { computeRiskProfile, finalizeMetrics, projectSignals } from './metrics';
import { normalizeConstraint } from './types';
import { type ReadinessPolicy, type ReadinessRunId } from '@domain/recovery-readiness';

interface PolicyDecision {
  readonly ok: boolean;
  readonly risk: number;
  readonly violations: readonly SimulationPolicyViolation[];
}

const evaluateRisk = (input: SimulationPlanInput, constraints: SimulationConstraint): PolicyDecision => {
  const violations: SimulationPolicyViolation[] = [];
  const risk = input.signals.reduce((sum, signal) => sum + (signal.severity === 'critical' ? 4 : signal.severity === 'high' ? 2 : 1), 0);
  const minimumTargets = input.policy.constraints.minWindowMinutes > 0 ? 1 : 1;

  if (input.draft.targetIds.length === 0) {
    violations.push({ reason: 'empty-targets', nodeId: 'target', severity: 3 });
  }
  if (risk > constraints.maxRiskScore) {
    violations.push({ reason: 'risk-limit', nodeId: 'global', severity: 5 });
  }
  if (input.draft.targetIds.length < minimumTargets) {
    violations.push({ reason: 'minimum-target-count', nodeId: 'policy', severity: 2 });
  }

  return { ok: violations.length === 0, risk, violations };
};

const defaultOwnerMix = (): Record<string, number> => ({
  sre: 0,
  platform: 0,
  core: 0,
  security: 0,
});

const buildWindows = (policy: ReadinessPolicy, constraints: SimulationConstraint): readonly SimulationWindow[] => {
  const base: SimulationWindow[] = [];
  const count = Math.max(1, Math.min(6, policy.constraints.minWindowMinutes || 1));
  for (let index = 0; index < count; index += 1) {
    const window: SimulationWindow = {
      waveId: makeSimulationWaveId(`window:${policy.policyId}:${index}`),
      startUtc: new Date(Date.now() + index * 60_000).toISOString(),
      endUtc: new Date(Date.now() + (index + 1) * 60_000).toISOString(),
      expectedSignals: Math.max(1, Math.floor(constraints.maxSignalsPerWave / Math.max(1, count))),
      targetCount: Math.max(1, constraints.maxParallelNodes),
      windowIndex: index,
    };
    base.push(window);
  }
  return base;
};

export const buildPlan = (input: SimulationPlanInput): Result<SimulationPlanEnvelope, Error> => {
  const constraints = normalizeConstraint(input.constraints ?? defaultConstraint(input.draft.targetIds.length));
  const decision = evaluateRisk(input, constraints);
  if (!decision.ok) {
    return fail(new Error(`simulation-rejected:${decision.violations.map((item) => item.reason).join('|')}`));
  }

  const signalBuckets = buildSignalBuckets(input.signals);
  const projections = projectSignals(input.signals);

  const windows = buildWindows(input.policy, constraints);
  const planned = buildAllocations(input.graph, constraints, input.runId);

  const ownerMix = planned.reduce((acc, item) => {
    for (const owner of Object.keys(item.ownerMix) as ReadonlyArray<keyof typeof item.ownerMix>) {
      acc[owner] = (acc[owner] ?? 0) + item.ownerMix[owner];
    }
    return acc;
  }, defaultOwnerMix());

  const waves = planned.map((allocation) => allocation.wave);
  const allocations: SimulationAllocation[] = planned.map((allocation) => ({
    waveId: allocation.wave.id,
    nodeIds: allocation.wave.sequence.map((value) => value.toString()),
    ownerMix,
    expectedSignals: allocation.wave.signalCount,
    coverageRatio: Math.min(1, waves.length === 0 ? 0 : waves.length / Math.max(1, input.graph.nodes.length)),
  }));

  const summary: SimulationSummary = {
    runId: input.runId,
    status: waves.length === 0 ? 'pending' : 'running',
    coverageRatio: Math.min(1, waves.length / Math.max(1, input.graph.nodes.length)),
    signalCoverage: projections.reduce((sum, point) => sum + point.signals, 0),
    nodeCoverage: input.graph.nodes.length,
    riskProfile: computeRiskProfile({
      ...{
        runId: input.runId,
        status: waves.length === 0 ? 'pending' : 'running',
        coverageRatio: Math.min(1, waves.length / Math.max(1, input.graph.nodes.length)),
        signalCoverage: projections.reduce((sum, point) => sum + point.signals, 0),
        nodeCoverage: input.graph.nodes.length,
        constraints,
        waves,
        allocations,
        policyViolations: decision.violations,
      },
      riskProfile: 'green',
    }, constraints),
    constraints,
    waves,
    allocations,
    policyViolations: decision.violations,
  };

  const score = scorePlanFromAllocations(planned);
  let totalBucketSignals = 0;
  for (const bucket of signalBuckets.values()) {
    totalBucketSignals += bucket.length;
  }

  const plan: SimulationPlan = {
    runId: input.runId,
    tenant: input.tenant,
    seed: makeSimulationRunId(`${input.runId}`).length + totalBucketSignals + windows.length + score,
    createdAt: new Date().toISOString(),
    waves,
    projectedSignals: projections,
    summary,
  };

  const payload: SimulationPlanEnvelope = {
    plan,
    metrics: finalizeMetrics(plan, 0),
    notes: [
      `constraints:${constraints.maxSignalsPerWave}`,
      `windows:${windows.length}`,
      `signals:${input.signals.length}`,
      `nodes:${input.graph.nodes.length}`,
      `estimatedSignals:${score.toFixed(2)}`,
    ],
  };

  if (defaultPolicyEnvelope(input, constraints).constraints.maxSignalsPerWave <= 0) {
    return fail(new Error('policy-restriction-invalid'));
  }

  return ok(payload);
};

export const explainPolicyEnvelope = (
  policy: ReadinessPolicy,
  runId: ReadinessRunId,
) => defaultPolicyEnvelope(
  {
    tenant: runId.toString().slice(0, 10),
    draft: {
      runId,
      title: 'runtime-plan',
      objective: 'default',
      owner: 'sim-ops',
      targetIds: [],
      directiveIds: [],
    },
    policy,
    signals: [],
    runId,
    constraints: defaultConstraint(1),
    seed: 0,
  },
  defaultConstraint(1),
);

export { buildSignalBuckets, estimateSignalMix };
