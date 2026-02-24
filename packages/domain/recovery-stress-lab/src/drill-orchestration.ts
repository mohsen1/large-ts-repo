import {
  CommandRunbook,
  CommandRunbookId,
  OrchestrationPlan,
  RecoverySimulationResult,
  RecoverySignal,
  TenantId,
  WorkloadTarget,
  WorkloadTopology,
  WorkloadTopologyEdge,
  WorkloadTopologyNode,
  SeverityBand,
  WorkloadId,
  createWorkloadId,
} from './models';
import { buildStressEnvelope, buildExecutionDrift, type StressEnvelope } from './orchestration-metrics';
import { compileWorkspace, type FusionWorkspace } from './runbook-fusion';
import { planTemplateFromTargets } from './scenario-catalog';
import { compileValidationBundle } from './validation-suite';
import { mapTargetsToNodes } from './topology-intelligence';

export type DrillStatus = 'queued' | 'ready' | 'running' | 'complete' | 'failed';

export interface DriftSnapshot {
  readonly tick: number;
  readonly risk: number;
  readonly sla: number;
  readonly blockedSignals: number;
}

export interface DrillOverview {
  readonly tenantId: TenantId;
  readonly requestedBy?: string;
  readonly status: DrillStatus;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly topology: WorkloadTopology;
  readonly runbookIds: readonly CommandRunbookId[];
  readonly drift: readonly DriftSnapshot[];
  readonly plan: OrchestrationPlan | null;
  readonly simulation: RecoverySimulationResult | null;
  readonly report: StressEnvelope;
}

export interface DrillInput {
  readonly tenantId: TenantId;
  readonly runbooks: readonly CommandRunbook[];
  readonly targets: readonly WorkloadTarget[];
  readonly signals: readonly RecoverySignal[];
  readonly requestedBy: string;
}

const fallbackTarget = (tenantId: TenantId): WorkloadTopologyNode[] => [
  {
    id: createWorkloadId(`${tenantId}:fallback` as WorkloadId),
    name: 'fallback-workload',
    ownerTeam: 'recovery-stress-lab',
    criticality: 1,
    active: true,
  },
];

const buildTopology = (tenantId: TenantId, targets: readonly WorkloadTarget[]): WorkloadTopology => {
  const mapped = mapTargetsToNodes(targets);
  const nodes = mapped.nodes.length === 0 ? fallbackTarget(tenantId) : mapped.nodes;
  const edges: WorkloadTopologyEdge[] = mapped.edges.map((edge) => ({
    from: edge.from,
    to: edge.to,
    coupling: Math.max(0.01, Math.min(1, edge.coupling)),
    reason: edge.reason,
  }));

  return {
    tenantId,
    nodes,
    edges,
  };
};

const buildRunbookOrder = (runbooks: readonly CommandRunbook[]): readonly CommandRunbookId[] =>
  [...runbooks]
    .sort((left, right) => right.steps.length - left.steps.length)
    .map((runbook) => runbook.id);

const inferBand = (signals: readonly RecoverySignal[]): SeverityBand => {
  const aggregate = signals.reduce((acc, signal) => {
    if (signal.severity === 'critical') return acc + 4;
    if (signal.severity === 'high') return acc + 3;
    if (signal.severity === 'medium') return acc + 2;
    return acc + 1;
  }, 0);
  const normalized = Math.max(1, aggregate / Math.max(1, signals.length));
  if (normalized >= 3.5) return 'critical';
  if (normalized >= 2.8) return 'high';
  if (normalized >= 2) return 'medium';
  return 'low';
};

const buildPlanForWorkspace = (input: { tenantId: TenantId; runbooks: readonly CommandRunbook[]; topology: WorkloadTopology }): OrchestrationPlan => {
  const schedule = input.runbooks.map((runbook, index) => ({
    runbookId: runbook.id,
    startAt: new Date(Date.UTC(2026, 0, 1 + index)).toISOString(),
    endAt: new Date(Date.UTC(2026, 0, 1 + index, 0, 45)).toISOString(),
    phaseOrder: ['observe', 'isolate', 'migrate', 'verify'] as const,
  }));

  return {
    tenantId: input.tenantId,
    scenarioName: `drill-${input.tenantId}`,
    schedule,
    runbooks: [...input.runbooks],
    dependencies: {
      nodes: input.topology.nodes.map((node) => node.id),
      edges: input.topology.edges.map((edge) => ({
        from: edge.from,
        to: edge.to,
        weight: edge.coupling,
      })),
    },
    estimatedCompletionMinutes: Math.max(1, input.runbooks.length * 8),
  };
};

const ensureRunbooks = (tenantId: TenantId, targets: readonly WorkloadTarget[], signals: readonly RecoverySignal[], existing: readonly CommandRunbook[]): readonly CommandRunbook[] => {
  if (existing.length > 0) {
    return existing;
  }

  const template = planTemplateFromTargets(tenantId, targets, signals);
  return template.runbooks;
};

const normalizeWorkspaceTopology = (workspace: FusionWorkspace): WorkloadTopology => {
  const fallback = buildTopology(workspace.tenantId, workspace.topology.nodes.length === 0 ? [] : []);
  return {
    tenantId: workspace.tenantId,
    nodes: workspace.topology.nodes.length > 0 ? workspace.topology.nodes : fallback.nodes,
    edges: workspace.topology.edges.length > 0 ? workspace.topology.edges : fallback.edges,
  };
};

export const runRecoveryDrill = (input: DrillInput): DrillOverview => {
  const startedAt = new Date().toISOString();
  const topology = buildTopology(input.tenantId, input.targets);
  const runbooks = ensureRunbooks(input.tenantId, input.targets, input.signals, input.runbooks);
  const band = inferBand(input.signals);

  const workspace = compileWorkspace({
    tenantId: input.tenantId,
    targets: input.targets,
    signals: input.signals,
    selectedRunbooks: runbooks,
    profileHint: band === 'low' ? 'conservative' : band === 'critical' ? 'agile' : 'normal',
  });

  const workspaceTopology = normalizeWorkspaceTopology(workspace);
  const validation = compileValidationBundle(input.tenantId, {
    topology,
    runbooks,
    signals: input.signals,
    band,
    plan: workspace.plan ?? undefined,
    signalDigest: undefined,
  });

  const fallbackPlan = buildPlanForWorkspace({
    tenantId: input.tenantId,
    runbooks,
    topology,
  });

  const plan = workspace.plan ?? fallbackPlan;
  const simulation = workspace.simulation;
  const report = buildStressEnvelope({
    tenantId: input.tenantId,
    plan,
    runbooks,
    signals: input.signals,
    topology: workspaceTopology,
    tickBudget: Math.max(10, runbooks.length * 12),
  });

  const drift = buildExecutionDrift(report);
  const runbookIds = buildRunbookOrder(workspace.runbooks.length > 0 ? workspace.runbooks : runbooks);

  const status: DrillStatus =
    plan.runbooks.length > 0 && simulation !== null
      ? 'running'
      : validation.valid
        ? 'ready'
        : 'queued';

  return {
    tenantId: input.tenantId,
    requestedBy: input.requestedBy,
    status: simulation?.riskScore === 1 ? 'failed' : status,
    startedAt,
    completedAt: validation.valid && simulation !== null ? new Date().toISOString() : undefined,
    topology: workspaceTopology,
    runbookIds,
    drift,
    plan,
    simulation,
    report,
  };
};

export const summarizeDrill = (overview: DrillOverview): readonly string[] => {
  const queueCoverage = overview.drift.length > 0
    ? overview.drift.reduce((acc, sample) => acc + sample.risk, 0) / overview.drift.length
    : 0;

  return [
    `tenant=${overview.tenantId}`,
    `status=${overview.status}`,
    `runbooks=${overview.runbookIds.length}`,
    `ticks=${overview.drift.length}`,
    `risk=${queueCoverage.toFixed(2)}`,
    `nodes=${overview.topology.nodes.length}`,
    `edges=${overview.topology.edges.length}`,
    `requestedBy=${overview.requestedBy ?? 'unknown'}`,
  ];
};
