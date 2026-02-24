import {
  type CommandRunbook,
  type OrchestrationPlan,
  type RecoverySimulationResult,
  type RecoverySignal,
  type StressRunState,
  type TenantId,
  type WorkloadTopology,
  type WorkloadTarget,
  summarizeSignals,
  auditRunbooks,
} from '@domain/recovery-stress-lab';
import { createWorkloadId } from '@domain/recovery-stress-lab';
import { createRunbookId } from '@domain/recovery-stress-lab';
import type { RunbookPlanAudit } from '@domain/recovery-stress-lab';

export interface IncidentSurfaceInput {
  readonly tenantId: TenantId;
  readonly runbooks: readonly CommandRunbook[];
  readonly signals: readonly RecoverySignal[];
  readonly topology: WorkloadTopology;
  readonly targets: readonly WorkloadTarget[];
  readonly plan: OrchestrationPlan | null;
  readonly simulation: RecoverySimulationResult | null;
  readonly state: StressRunState | null;
}

export interface WindowSignal {
  readonly window: string;
  readonly riskScore: number;
  readonly notes: readonly string[];
}

export interface SurfaceOutput {
  readonly tenantId: TenantId;
  readonly health: 'good' | 'warning' | 'critical';
  readonly topologyExposure: number;
  readonly runbookAudit: readonly string[];
  readonly windows: readonly WindowSignal[];
  readonly recommendations: readonly string[];
  readonly driftTrend: readonly number[];
}

const buildWindows = (ticks: number, state: StressRunState | null): readonly WindowSignal[] => {
  if (ticks <= 0) {
    return [];
  }

  return Array.from({ length: ticks }, (_, index) => {
    const base = (index + 1) / Math.max(1, ticks + 1);
    const riskScore = Number((base * 100).toFixed(2));
    return {
      window: `w-${index}`,
      riskScore,
      notes: [
        `tick=${index}`,
        state?.selectedBand ? `band=${state.selectedBand}` : 'band=none',
        `signals=${state?.selectedSignals.length ?? 0}`,
      ],
    };
  });
};

const buildRecommendations = (audit: RunbookPlanAudit, simulation: RecoverySimulationResult | null): readonly string[] => {
  const recommendations: string[] = [];

  if (audit.runbooks.length === 0) {
    recommendations.push('Seed runbooks before simulation');
  }
  if ((simulation?.riskScore ?? 1) > 0.65) {
    recommendations.push('Risk score is high; reduce concurrency and review blocked windows');
  }
  if ((simulation?.slaCompliance ?? 1) < 0.75) {
    recommendations.push('SLA compliance dropped below target; increase cadence or adjust topology');
  }
  if (audit.status === 'warn' || audit.status === 'fail') {
    recommendations.push('Address runbook plan warnings before continuing');
  }
  if (recommendations.length === 0) {
    recommendations.push('Surface is stable; continue with next drill stage');
  }

  return recommendations;
};

const fallbackTargets = (tenantId: TenantId): readonly WorkloadTarget[] => [
  {
    tenantId,
    workloadId: createWorkloadId(`${tenantId}:fallback`),
    commandRunbookId: createRunbookId(`${tenantId}:runbook-fallback`),
    name: 'fallback-target',
    criticality: 1,
    region: 'global',
    azAffinity: [],
    baselineRtoMinutes: 15,
    dependencies: [],
  },
];

export const buildIncidentSurface = (input: IncidentSurfaceInput): SurfaceOutput => {
  const signalDigest = summarizeSignals(input.tenantId, input.signals);
  const topologyNodes = input.topology.nodes.length;
  const topologyEdges = input.topology.edges.length;
  const mappedTargets = input.targets.length > 0 ? input.targets : fallbackTargets(input.tenantId);
  const audit = auditRunbooks({
    tenantId: input.tenantId,
    runbooks: input.runbooks,
    signals: input.signals,
    targets: mappedTargets,
  });

  const recommendations = buildRecommendations(audit, input.simulation);
  const exposure = topologyNodes + topologyEdges + signalDigest.totalSignals;

  const windows = buildWindows(Math.max(1, Math.min(8, Math.max(1, input.signals.length))), input.state);
  const driftTrend = windows.map((window) => window.riskScore);

  const health: SurfaceOutput['health'] =
    audit.status === 'fail' || recommendations.length > 5
      ? 'critical'
      : audit.status === 'warn'
        ? 'warning'
        : 'good';

  return {
    tenantId: input.tenantId,
    health,
    topologyExposure: exposure,
    runbookAudit: summarizeRunbookAuditSafe(audit),
    windows,
    recommendations,
    driftTrend,
  };
};

const summarizeRunbookAuditSafe = (audit: RunbookPlanAudit): readonly string[] => {
  const base = audit.status === 'pass'
    ? [`tenant=${audit.tenantId}`, `ready=${audit.planReady}`, `runbooks=${audit.runbooks.length}`]
    : [`tenant=${audit.tenantId}`, `ready=${audit.planReady}`, `runbooks=${audit.runbooks.length}`, `nodes=${audit.topology.nodes.length}`];

  return [...base, ...audit.messages.slice(0, 6)];
};

export const summarizeIncidentSurface = (surface: SurfaceOutput): readonly string[] => {
  const topWindow = surface.windows[surface.windows.length - 1];
  return [
    `tenant=${surface.tenantId}`,
    `health=${surface.health}`,
    `windows=${surface.windows.length}`,
    `exposure=${surface.topologyExposure}`,
    `trend=${surface.driftTrend.at(-1) ?? 0}`,
    `topologyWindow=${topWindow ? topWindow.window : 'none'}`,
    `recommendations=${surface.recommendations.length}`,
  ];
};
