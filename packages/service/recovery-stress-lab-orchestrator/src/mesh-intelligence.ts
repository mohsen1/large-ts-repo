import {
  CommandRunbook,
  OrchestrationPlan,
  RecoverySimulationResult,
  RecoverySignal,
  SeverityBand,
  TenantId,
  WorkloadTopology,
} from '@domain/recovery-stress-lab';
import { compareAgainstHistory, evaluateLabContext } from './analytics';
import { buildMeshBlueprint } from '@domain/recovery-stress-lab';
import { rankRunbooksByReadiness } from './analytics';

export interface MeshHealthInput {
  readonly tenantId: TenantId;
  readonly band: SeverityBand;
  readonly plan: OrchestrationPlan | null;
  readonly topology: WorkloadTopology;
  readonly signals: readonly RecoverySignal[];
  readonly runbooks: readonly CommandRunbook[];
  readonly simulation: RecoverySimulationResult | null;
}

export interface MeshHealthSummary {
  readonly tenantId: TenantId;
  readonly band: SeverityBand;
  readonly readynessScore: number;
  readonly routeCount: number;
  readonly driftRisk: number;
  readonly runbookPriority: readonly { id: string; score: number }[];
  readonly readinessReasons: readonly string[];
  readonly simulation: RecoverySimulationResult | null;
}

const evaluateReadiness = (plan: OrchestrationPlan | null, band: SeverityBand): number => {
  if (!plan) {
    return band === 'critical' ? 10 : band === 'high' ? 6 : band === 'medium' ? 4 : 2;
  }
  const steps = plan.schedule.reduce((acc, entry) => acc + entry.phaseOrder.length, 0);
  return steps + plan.runbooks.length + (band === 'critical' ? 10 : band === 'high' ? 6 : band === 'medium' ? 4 : 2);
};

const evaluateReadinessWindow = (topology: WorkloadTopology): number => {
  const totalNodes = topology.nodes.length;
  const totalEdges = topology.edges.length;
  if (totalNodes === 0) return 0;
  return totalEdges / Math.max(1, totalNodes);
};

export const summarizeMeshHealth = (input: MeshHealthInput): MeshHealthSummary => {
  const readiness = evaluateLabContext({
    tenantId: input.tenantId,
    band: input.band,
    runbooks: input.runbooks,
    targets: [],
    topology: input.topology,
    signals: input.signals,
    simulation: input.simulation,
    plan: input.plan,
  });

  const drift = input.simulation
    ? compareAgainstHistory(input.tenantId, input.simulation, null)
    : {
        changed: false,
        reason: 'No simulation baseline available',
        metrics: { riskDelta: 0, slaDelta: 0, durationDelta: 0 },
      };
  const topologyWindow = evaluateReadinessWindow(input.topology);
  const baseline = evaluateReadiness(input.plan, input.band);
  const blueprint = buildMeshBlueprint(input.tenantId, input.topology, input.runbooks, input.signals);
  const runbookPriority = rankRunbooksByReadiness(input.runbooks);

  return {
    tenantId: input.tenantId,
    band: input.band,
    readynessScore: Number((readiness.metrics.plan.windowCoverage + topologyWindow + baseline).toFixed(2)),
    routeCount: blueprint.routes.length,
    driftRisk: drift.metrics.riskDelta,
    runbookPriority: runbookPriority.map((entry) => ({ id: entry.id, score: entry.score })),
    readinessReasons: readiness.issues,
    simulation: input.simulation,
  };
};

export const compareMeshes = (
  tenantId: TenantId,
  left: RecoverySimulationResult | null,
  right: RecoverySimulationResult | null,
): {
  readonly tenantId: TenantId;
  readonly changed: boolean;
  readonly summary: string;
  readonly riskDelta: number;
} => {
  if (!left || !right) {
    return {
      tenantId,
      changed: false,
      summary: 'No comparable simulation pair available.',
      riskDelta: 0,
    };
  }

  const delta = compareAgainstHistory(tenantId, right, left);
  return {
    tenantId,
    changed: delta.changed,
    summary: delta.reason,
    riskDelta: delta.metrics.riskDelta,
  };
};
