import type { FusionBundle, FusionWave, FusionPlanRequest, FusionWaveId } from './types';
import { buildReadinessProfile } from './readiness-metrics';
import { planResourceAllocation } from './resource-allocation';
import type { Result } from '@shared/result';
import { ok, fail } from '@shared/result';

export interface WorkflowStage {
  readonly id: string;
  readonly waveId: FusionWaveId | 'pre' | 'post';
  readonly action: 'validate' | 'allocate' | 'simulate' | 'commit' | 'rollback';
  readonly completed: boolean;
  readonly startedAt: string;
  readonly elapsedMs: number;
}

export interface WorkflowOutcome {
  readonly bundleId: string;
  readonly requestId: string;
  readonly accepted: boolean;
  readonly riskBand: 'green' | 'amber' | 'red' | 'critical';
  readonly reasons: readonly string[];
  readonly stages: readonly WorkflowStage[];
  readonly projectedSeconds: number;
  readonly stable: boolean;
}

const buildStage = (id: string, waveId: FusionWaveId | 'pre' | 'post', action: WorkflowStage['action'], startAt: string): WorkflowStage => ({
  id,
  waveId,
  action,
  completed: true,
  startedAt: startAt,
  elapsedMs: Math.floor(Math.random() * 1200),
});

const analyzeRiskBand = (bundle: FusionBundle): WorkflowOutcome['riskBand'] => {
  const profile = buildReadinessProfile(bundle);
  const allocation = planResourceAllocation(bundle);
  const utilization = allocation.utilization;

  if (profile.isStable && utilization < 0.5) return 'green';
  if (profile.averageReadiness < 0.55 || utilization > 0.95) return 'red';
  if (utilization > 0.85 || profile.minReadiness < 0.3) return 'critical';
  return 'amber';
};

const inferReasons = (bundle: FusionBundle): readonly string[] => {
  const profile = buildReadinessProfile(bundle);
  const allocation = planResourceAllocation(bundle);
  const reasons: string[] = [];

  if (bundle.waves.length === 0) reasons.push('no-waves');
  if (!profile.isStable) reasons.push('unstable-readiness');
  if (allocation.utilization > 0.9) reasons.push('resource-pressure');
  if (bundle.signals.length === 0) reasons.push('empty-signals');

  return reasons;
};

const stageForWave = (wave: FusionWave): readonly WorkflowStage[] => {
  const now = new Date().toISOString();
  return [
    buildStage(`${wave.id}:validate`, wave.id, 'validate', now),
    buildStage(`${wave.id}:allocate`, wave.id, 'allocate', now),
    buildStage(`${wave.id}:simulate`, wave.id, 'simulate', now),
    buildStage(`${wave.id}:commit`, wave.id, 'commit', now),
  ];
};

export const runWorkflowOrchestrator = (
  request: FusionPlanRequest,
  bundle: FusionBundle,
): Result<WorkflowOutcome, string> => {
  if (request.waves.length !== bundle.waves.length) {
    return fail('wave-count-mismatch');
  }

  const waveStages = bundle.waves.flatMap(stageForWave);
  const reasons = inferReasons(bundle);
  const allocatedSeconds = planResourceAllocation(bundle).totalRequired + Math.round(planResourceAllocation(bundle).totalAvailable / 10);
  const waveCount = bundle.waves.length;
  const stable = reasons.length === 0 && waveCount > 0;
  const riskBand = analyzeRiskBand(bundle);

  return ok({
    bundleId: String(bundle.id),
    requestId: `${bundle.planId}:${request.runId}`,
    accepted: stable,
    riskBand,
    reasons,
    stages: [
      buildStage(`${bundle.id}:pre`, 'pre', 'validate', new Date().toISOString()),
      ...waveStages,
      buildStage(`${bundle.id}:post`, 'post', 'rollback', new Date().toISOString()),
    ],
    projectedSeconds: Math.max(0, allocatedSeconds * Math.max(1, waveCount)),
    stable,
  });
};
