import { TenantId, CommandRunbook, RecoverySignal, WorkloadTopology, SeverityBand } from './models';
import { inferRiskBandFromSignals, mapNodeExposure } from './topology-intelligence';
import { computeSignalCoverage, buildSignalDensityMatrix } from './signal-matrix';
import { buildMeshBlueprint, rankMeshRoutes } from './mesh-types';

export interface PolicyEnvelope {
  readonly tenantId: TenantId;
  readonly profileName: string;
  readonly generatedAt: string;
  readonly targetBand: SeverityBand;
  readonly signalCoverage: ReturnType<typeof computeSignalCoverage>;
  readonly meshRisk: number;
  readonly routeRanks: ReturnType<typeof rankMeshRoutes>;
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface PolicyBundleInput {
  readonly tenantId: TenantId;
  readonly profileName: string;
  readonly runbooks: readonly CommandRunbook[];
  readonly topology: WorkloadTopology;
  readonly signals: readonly RecoverySignal[];
}

export interface PolicyDecision {
  readonly accepted: boolean;
  readonly envelope: PolicyEnvelope;
  readonly blockReasons: readonly string[];
}

interface BundleSignalWeight {
  readonly signalId: string;
  readonly classWeight: number;
  readonly bandWeight: number;
  readonly classCount: number;
  readonly recency: number;
}

const normalizeId = (tenantId: TenantId): string => String(tenantId).trim().toLowerCase();

const computeSignalsWeight = (signals: readonly RecoverySignal[]): number => {
  const density = buildSignalDensityMatrix('policy', signals);
  return density.cells.reduce((acc, cell) => acc + cell.density / Math.max(1, cell.ageMinutes || 1), 0);
};

const weightedSignals = (signals: readonly RecoverySignal[]): BundleSignalWeight[] => {
  return signals.map((signal) => ({
    signalId: signal.id,
    classWeight: signal.class.length,
    bandWeight: signal.severity === 'critical' ? 4 : signal.severity === 'high' ? 3 : signal.severity === 'medium' ? 2 : 1,
    classCount: signal.class.length * signal.class.length,
    recency: Date.now() - Date.parse(signal.createdAt),
  }));
};

const evaluateReadiness = (
  runbooks: readonly CommandRunbook[],
  topology: WorkloadTopology,
): readonly string[] => {
  const reasons: string[] = [];
  if (runbooks.length === 0) {
    reasons.push('No runbooks provided for policy envelope');
  }
  if (topology.nodes.length === 0) {
    reasons.push('Topology nodes are empty');
  }
  if (topology.edges.length === 0) {
    reasons.push('Topology edges are empty');
  }
  if (runbooks.some((runbook) => runbook.steps.length === 0)) {
    reasons.push('One or more runbooks has no steps');
  }
  return reasons;
}

export const buildPolicyEnvelope = (input: PolicyBundleInput): PolicyEnvelope => {
  const exposure = mapNodeExposure(input.topology);
  const coverage = computeSignalCoverage(input.tenantId, input.topology, input.signals, input.runbooks);
  const mesh = buildMeshBlueprint(input.tenantId, input.topology, input.runbooks, input.signals);
  const ranks = rankMeshRoutes(mesh.routes);
  const band = inferRiskBandFromSignals(input.signals);
  const signalWeight = computeSignalsWeight(input.signals);
  const highestClassSignal = weightedSignals(input.signals).sort((left, right) => right.classCount - left.classCount)[0];

  return {
    tenantId: input.tenantId,
    profileName: input.profileName,
    generatedAt: new Date().toISOString(),
    targetBand: band,
    signalCoverage: coverage,
    meshRisk: (signalWeight + exposure.length + (highestClassSignal?.classWeight ?? 0) / 100) / Math.max(1, ranks.length),
    routeRanks: ranks,
    metadata: {
      runbookCount: input.runbooks.length,
      topologyNodeCount: input.topology.nodes.length,
      topologyEdgeCount: input.topology.edges.length,
      meshVersion: mesh.createdAt,
      coverageByBandLow: coverage.byBand.low,
      coverageByBandCritical: coverage.byBand.critical,
      signalWeight: Number(signalWeight.toFixed(4)),
      hasCriticalExposure: exposure.some((entry) => entry.incoming > 0 && entry.isolationRisk > 1),
      topologyNormalizedTenant: input.topology.tenantId,
      recencySample: highestClassSignal ? highestClassSignal.recency : 0,
    },
  };
};

export const evaluatePolicyEnvelope = (input: PolicyBundleInput): PolicyDecision => {
  const blockers = evaluateReadiness(input.runbooks, input.topology);
  const envelope = buildPolicyEnvelope(input);
  const accepted = blockers.length === 0 && envelope.meshRisk <= 20 && envelope.routeRanks.length > 0;
  return {
    accepted,
    envelope,
    blockReasons: accepted ? [] : blockers,
  };
};

export const describePolicyEnvelope = (envelope: PolicyEnvelope): string[] => {
  return [
    `tenant=${normalizeId(envelope.tenantId)}`,
    `risk=${envelope.meshRisk.toFixed(3)}`,
    `band=${envelope.targetBand}`,
    `routes=${envelope.routeRanks.length}`,
    `criticalRunbooks=${envelope.signalCoverage.criticalRunbookMatches.length}`,
    `topologyDensity=${envelope.signalCoverage.topologyDensity.toFixed(2)}`,
  ];
};
