import { Brand, normalizeLimit } from '@shared/core';
import {
  CommandRunbook,
  CommandRunbookId,
  WorkloadTopology,
  WorkloadTarget,
  RecoverySignal,
  OrchestrationPlan,
  TenantId,
  StressRunState,
  RecoverySimulationResult,
  createRunbookId,
  createTenantId,
  WorkloadId,
} from './models';
import { buildTopologyGraph, inferRiskBandFromSignals, mapTargetsToNodes } from './topology-intelligence';
import { buildReadinessWindows, mergeWindows, scheduleCoverageScore } from './schedule';
import { simulateRunbook } from './simulation';
import { defaultProfileFromTeam } from './policy';

export interface FusionWorkspace {
  readonly tenantId: TenantId;
  readonly topology: WorkloadTopology;
  readonly runbooks: readonly CommandRunbook[];
  readonly selectedSignals: readonly RecoverySignal[];
  readonly plan: OrchestrationPlan | null;
  readonly simulation: RecoverySimulationResult | null;
  readonly state: StressRunState;
}

export interface FusionInput {
  readonly tenantId: TenantId;
  readonly targets: readonly WorkloadTarget[];
  readonly signals: readonly RecoverySignal[];
  readonly selectedRunbooks: readonly CommandRunbook[];
  readonly profileHint: 'conservative' | 'normal' | 'agile';
}

export interface FusionDelta {
  readonly tenantId: TenantId;
  readonly selectedSignals: number;
  readonly windows: number;
  readonly topologyNodes: number;
  readonly edges: number;
  readonly score: number;
}

const EMPTY_PLAN: OrchestrationPlan = {
  tenantId: createTenantId('unknown') as TenantId,
  scenarioName: 'empty',
  schedule: [],
  runbooks: [],
  dependencies: { nodes: [], edges: [] },
  estimatedCompletionMinutes: 0,
};

const makeRunbookId = (seed: Brand<string, 'TenantId'>, runbook: CommandRunbook, index: number): CommandRunbookId => {
  const normalized = `${seed}-${runbook.name}-${index}`.toLowerCase().replace(/\W+/g, '-');
  return createRunbookId(normalized);
};

export const fuseSignalsToTopology = (signals: readonly RecoverySignal[], targets: readonly WorkloadTarget[]): WorkloadTopology => {
  const topology = mapTargetsToNodes(targets);
  const bands = inferRiskBandFromSignals(signals);
  const ordered = [...topology.nodes].sort((left, right) => right.criticality - left.criticality);
  const withHints = ordered.map((node, index) => {
    const signal = signals[index % Math.max(1, signals.length)];
    return {
      ...node,
      active: signal ? signal.severity !== 'low' : node.active,
      name: `${node.name} · ${bands}`,
    };
  });

  return {
    tenantId: targets[0]?.tenantId ?? createTenantId('fallback'),
    nodes: withHints,
    edges: topology.edges,
  };
};

export const compileWorkspace = (input: FusionInput): FusionWorkspace => {
  const topology = fuseSignalsToTopology(input.signals, input.targets);
  const profile = defaultProfileFromTeam(input.tenantId, input.profileHint);
  const candidateRunbooks: CommandRunbook[] = input.selectedRunbooks.map((runbook, index) => ({
    ...runbook,
    id: makeRunbookId(createTenantId(input.tenantId), runbook, index),
    tenantId: input.tenantId,
    name: runbook.name,
    cadence: {
      weekday: index % 7,
      windowStartMinute: 90 + (index % 3) * 15,
      windowEndMinute: 210 + (index % 4) * 20,
    },
  }));

  const graph = buildTopologyGraph(topology);
  const windows = candidateRunbooks.flatMap((runbook) => buildReadinessWindows(runbook, inferRiskBandFromSignals(input.signals)));
  const merged = mergeWindows(
    windows.map((entry) => ({
      startMinute: new Date(entry.startAt).getUTCHours() * 60 + new Date(entry.startAt).getUTCMinutes(),
      endMinute: new Date(entry.endAt).getUTCHours() * 60 + new Date(entry.endAt).getUTCMinutes(),
      dayIndex: new Date(entry.startAt).getUTCDay(),
    })),
    [],
  );

  const schedule = merged.map((entry, index) => {
      const node = graph.nodes[index % graph.nodes.length] ?? input.targets[0]?.workloadId ?? (createRunbookId(`fallback-${index}`) as unknown as WorkloadId);
    return {
      runbookId: createRunbookId(`${String(node)}-r${index}`),
      startAt: new Date(Date.UTC(2026, 0, 1 + entry.dayIndex, Math.floor(entry.startMinute / 60), entry.startMinute % 60)).toISOString(),
      endAt: new Date(Date.UTC(2026, 0, 1 + entry.dayIndex, Math.floor(entry.endMinute / 60), entry.endMinute % 60)).toISOString(),
      phaseOrder: ['observe', 'isolate', 'migrate', 'verify'] as const,
    };
  });

  const plan = candidateRunbooks.length === 0
    ? null
    : {
      tenantId: input.tenantId,
      scenarioName: `fused-${input.tenantId}`,
      schedule,
      runbooks: candidateRunbooks,
      dependencies: {
        nodes: graph.nodes,
        edges: graph.edges.map((edge) => ({
          from: edge.from,
          to: edge.to,
          weight: edge.payload?.coupling ?? 0,
          coupling: edge.payload?.coupling ?? 0.2,
          reason: edge.payload?.reason ?? `dependency-${String(edge.from)}-${String(edge.to)}`,
        })),
      },
      estimatedCompletionMinutes: normalizeLimit(schedule.length * 30),
    };

  const simulation = plan
    ? simulateRunbook({
      tenantId: input.tenantId,
      band: inferRiskBandFromSignals(input.signals),
      selectedSignals: input.signals,
      runbooks: candidateRunbooks,
      profile,
      nowIso: new Date().toISOString(),
    })
    : null;

  const state: StressRunState = {
    tenantId: input.tenantId,
    selectedBand: inferRiskBandFromSignals(input.signals),
    selectedSignals: input.signals,
    plan,
    simulation,
  };

  return {
    tenantId: input.tenantId,
    topology,
    runbooks: candidateRunbooks,
    selectedSignals: input.signals,
    plan,
    simulation,
    state,
  };
};

export const buildFusionDelta = (workspace: FusionWorkspace): FusionDelta => {
  const selectedSignals = workspace.selectedSignals.length;
  const windows = workspace.plan?.schedule.length ?? 0;
  const topologyNodes = workspace.topology.nodes.length;
  const edges = workspace.topology.edges.length;
  const score = scheduleCoverageScore(
    workspace.plan
      ? workspace.plan.schedule.map((entry) => ({
        runbookId: entry.runbookId,
        workloadIds: [entry.runbookId as unknown as WorkloadId],
        window: {
          startMinute: new Date(entry.startAt).getMinutes(),
          endMinute: new Date(entry.endAt).getMinutes(),
          dayIndex: new Date(entry.startAt).getUTCDay(),
        },
      }))
      : [],
    Math.max(1, windows + edges),
  );

  return {
    tenantId: workspace.tenantId,
    selectedSignals,
    windows,
    topologyNodes,
    edges,
    score,
  };
};

export const normalizeWorkspace = (workspace: FusionWorkspace): FusionWorkspace => {
  const topology = fuseSignalsToTopology(workspace.selectedSignals, workspace.topology.nodes.map((node) => ({
    tenantId: workspace.tenantId,
    workloadId: node.id,
    commandRunbookId: createRunbookId(`runbook-${node.id}`),
    name: node.name,
    criticality: node.criticality,
    region: 'us-east-1',
    azAffinity: ['a', 'b'],
    baselineRtoMinutes: 30,
    dependencies: [],
  })));

  const runbooks = workspace.runbooks.map((runbook, index) => ({
    ...runbook,
    id: createRunbookId(`${runbook.id}-${index}`),
  }));

  return {
    ...workspace,
    topology,
    runbooks,
    state: {
      ...workspace.state,
      selectedBand: workspace.state.selectedBand,
      selectedSignals: workspace.state.selectedSignals,
      plan: workspace.state.plan ?? EMPTY_PLAN,
      simulation: workspace.state.simulation,
    },
  };
};
