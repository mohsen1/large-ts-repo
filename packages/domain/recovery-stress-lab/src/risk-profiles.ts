import { normalizeLimit } from '@shared/core';
import {
  WorkloadTopology,
  WorkloadId,
  RecoverySignal,
  CommandRunbook,
  CommandStep,
  RecoverySimulationResult,
  SeverityBand,
} from './models';
import { mapNodeExposure } from './topology-intelligence';
import { inferRiskBandFromSignals } from './topology-intelligence';

export interface RiskProfileSignal {
  readonly signalId: string;
  readonly severity: SeverityBand;
  readonly class: RecoverySignal['class'];
  readonly weight: number;
}

export interface RunbookRiskProjection {
  readonly runbookId: CommandRunbook['id'];
  readonly requiredSignals: readonly RecoverySignal['id'][];
  readonly estimatedRisk: number;
  readonly stepCount: number;
}

export interface TopologyRiskProfile {
  readonly tenantId: string;
  readonly profileBand: SeverityBand;
  readonly runbookCount: number;
  readonly targetedWorkloads: readonly WorkloadId[];
  readonly projectedSignals: readonly RiskProfileSignal[];
  readonly runbookProjection: readonly RunbookRiskProjection[];
  readonly topologyRiskScore: number;
  readonly overallRiskScore: number;
}

export interface TopologyRiskConfig {
  readonly tenantId: string;
  readonly band: SeverityBand;
  readonly runbooks: readonly CommandRunbook[];
  readonly topology: WorkloadTopology;
  readonly signals: readonly RecoverySignal[];
}

const severityScore: Record<SeverityBand, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const clampRisk = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(10, value));
};

const estimateSignalWeight = (signal: RecoverySignal): number => {
  const severityFactor = severityScore[signal.severity];
  const classFactor = signal.class === 'availability' ? 1.3 : signal.class === 'integrity' ? 1.1 : 1;
  const hasMetadata = Object.keys(signal.metadata ?? {}).length;
  return severityFactor * classFactor * (1 + Math.min(1, hasMetadata / 12));
};

const stepRisk = (step: CommandStep): number => {
  const base = step.estimatedMinutes + step.prerequisites.length;
  const requiredSignals = Math.max(1, step.requiredSignals.length);
  return base * requiredSignals;
};

const buildProjectedSignals = (signals: readonly RecoverySignal[]): RiskProfileSignal[] => {
  return [...signals]
    .map((signal) => ({
      signalId: signal.id,
      severity: signal.severity,
      class: signal.class,
      weight: estimateSignalWeight(signal),
    }))
    .sort((left, right) => right.weight - left.weight);
};

const buildRunbookProjection = (runbooks: readonly CommandRunbook[]): RunbookRiskProjection[] => {
  return runbooks.map((runbook) => {
    const requiredSignals = [...new Set(runbook.steps.flatMap((step) => step.requiredSignals))];
    const estimatedRisk = runbook.steps.reduce((sum, step) => sum + stepRisk(step), 0);
    return {
      runbookId: runbook.id,
      requiredSignals,
      estimatedRisk,
      stepCount: runbook.steps.length,
    };
  });
};

export const buildTopologyRiskProfile = (input: TopologyRiskConfig): TopologyRiskProfile => {
  const profileBand = inferRiskBandFromSignals(input.signals);
  const exposures = mapNodeExposure(input.topology);
  const projectedSignals = buildProjectedSignals(input.signals);
  const runbookProjection = buildRunbookProjection(input.runbooks);
  const targetedWorkloads = [
    ...input.topology.nodes.map((node) => node.id),
    ...exposures
      .filter((entry) => entry.incoming >= 1)
      .map((entry) => entry.nodeId),
  ];

  const uniqueWorkloads = [...new Set(targetedWorkloads)];
  const topologyRiskScore = normalizeLimit(
    exposures.reduce((sum, entry) => sum + entry.isolationRisk + entry.incoming * 0.5 + entry.outgoing * 0.3, 0),
  ) / 50;
  const signalRisk = projectedSignals.reduce((sum, signal) => sum + signal.weight, 0);
  const runbookRisk = runbookProjection.reduce((sum, entry) => sum + entry.estimatedRisk, 0);
  const normalizedSignalRisk = signalRisk / Math.max(1, normalizeLimit(projectedSignals.length));
  const normalizedRunbookRisk = runbookRisk / Math.max(1, normalizeLimit(input.runbooks.length));
  const overallRiskScore = clampRisk((topologyRiskScore + normalizedSignalRisk + normalizedRunbookRisk) / 3);

  return {
    tenantId: input.tenantId,
    profileBand,
    runbookCount: input.runbooks.length,
    targetedWorkloads: uniqueWorkloads,
    projectedSignals,
    runbookProjection,
    topologyRiskScore,
    overallRiskScore,
  };
};

export interface RiskProfileDiff {
  readonly before: TopologyRiskProfile;
  readonly after: TopologyRiskProfile;
  readonly deltas: ReadonlyArray<{
    readonly runbookId: CommandRunbook['id'];
    readonly beforeRisk: number;
    readonly afterRisk: number;
    readonly delta: number;
  }>;
  readonly profileShift: Readonly<{ from: SeverityBand; to: SeverityBand }>;
  readonly riskDelta: number;
}

const indexByRunbook = (entry: readonly RunbookRiskProjection[]): Map<CommandRunbook['id'], number> => {
  const map = new Map<CommandRunbook['id'], number>();
  for (const item of entry) {
    map.set(item.runbookId, item.estimatedRisk);
  }
  return map;
};

export const compareRiskProfiles = (
  before: TopologyRiskProfile,
  after: TopologyRiskProfile,
): RiskProfileDiff => {
  const beforeMap = indexByRunbook(before.runbookProjection);
  const afterMap = indexByRunbook(after.runbookProjection);
  const runbookIds = new Set<CommandRunbook['id']>([...beforeMap.keys(), ...afterMap.keys()]);
  const deltas = [...runbookIds].map((runbookId) => {
    const beforeRisk = beforeMap.get(runbookId) ?? 0;
    const afterRisk = afterMap.get(runbookId) ?? 0;
    return {
      runbookId,
      beforeRisk,
      afterRisk,
      delta: afterRisk - beforeRisk,
    };
  });

  return {
    before,
    after,
    deltas: deltas.sort((left, right) => right.delta - left.delta),
    profileShift: {
      from: before.profileBand,
      to: after.profileBand,
    },
    riskDelta: after.overallRiskScore - before.overallRiskScore,
  };
};

export interface RiskSignalEnvelope {
  readonly tenantId: string;
  readonly band: SeverityBand;
  readonly simulation: RecoverySimulationResult | null;
  readonly urgency: 'low' | 'medium' | 'high';
  readonly summary: ReadonlyArray<string>;
}

export const summarizeRiskProfile = (
  profile: TopologyRiskProfile,
  simulation: RecoverySimulationResult | null,
): RiskSignalEnvelope => {
  const urgency =
    profile.overallRiskScore >= 7 || (simulation?.riskScore ?? 0) > 0.7
      ? 'high'
      : profile.overallRiskScore >= 4 || (simulation?.slaCompliance ?? 1) < 0.8
        ? 'medium'
        : 'low';

  const summary = [
    `band=${profile.profileBand}`,
    `targeted=${profile.targetedWorkloads.length}`,
    `runbooks=${profile.runbookCount}`,
    `topology-risk=${profile.topologyRiskScore.toFixed(2)}`,
    `overall=${profile.overallRiskScore.toFixed(2)}`,
  ];

  return {
    tenantId: profile.tenantId,
    band: profile.profileBand,
    simulation,
    urgency,
    summary,
  };
};
