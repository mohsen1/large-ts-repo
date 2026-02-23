import {
  RecoverySignal,
  WorkloadTarget,
  CommandRunbook,
  TenantId,
  createTenantId,
  buildTopologyGraph,
  compileWorkspace,
  buildFusionDelta,
  auditWorkspace,
  prioritizeFindings,
  summarizeAudit,
  WorkloadTopology,
} from '@domain/recovery-stress-lab';
import { StressLabEngineConfig } from '@service/recovery-stress-lab-orchestrator';
import { DefaultSessionCoordinator } from '@service/recovery-stress-lab-orchestrator';
import { StreamStressLabWorkspace } from '../types/stressLab';

export interface StressLabServiceInput {
  readonly tenantId: TenantId;
  readonly streamId: string;
  readonly config: StressLabEngineConfig;
  readonly runbooks: readonly CommandRunbook[];
  readonly signals: readonly RecoverySignal[];
}

export const buildMockTargets = (signals: readonly RecoverySignal[]): readonly WorkloadTarget[] => {
  const deduped = new Set<string>();
  return signals
    .map((signal, index) => ({
      tenantId: createTenantId(`tenant-${signal.id}`),
      workloadId: `node-${signal.id}` as unknown as WorkloadTarget['workloadId'],
      commandRunbookId: `${signal.id}-runbook` as unknown as WorkloadTarget['commandRunbookId'],
      name: `workload-${index + 1}`,
      criticality: ((index % 5) + 1) as 1 | 2 | 3 | 4 | 5,
      region: 'us-east-1',
      azAffinity: ['a', 'b'],
      baselineRtoMinutes: 25,
      dependencies: index === 0 ? [] : [`node-${signals[index - 1]?.id ?? '0'}` as unknown as WorkloadTarget['dependencies'][number]],
    }))
    .filter((target) => {
      if (deduped.has(target.workloadId)) return false;
      deduped.add(target.workloadId);
      return true;
    });
};

export const mapSignalsByClass = (signals: readonly RecoverySignal[]) => {
  const byClass = new Map<string, number>();
  for (const signal of signals) {
    byClass.set(signal.class, (byClass.get(signal.class) ?? 0) + 1);
  }
  return [...byClass.entries()].map(([key, value]) => ({ key, value }));
};

export const buildWorkspaceFromDomain = (tenantId: TenantId, _streamId: string, signals: readonly RecoverySignal[]): StreamStressLabWorkspace => {
  const targets = buildMockTargets(signals);
  const workspace = compileWorkspace({
    tenantId,
    targets,
    signals,
    selectedRunbooks: [],
    profileHint: 'normal',
  });

  const nodes = targets.map((target) => ({
    id: target.workloadId,
    name: target.name,
    ownerTeam: 'platform',
    criticality: target.criticality,
    active: true,
  }));
  const topology: WorkloadTopology = { tenantId, nodes, edges: [] };
  buildTopologyGraph(topology);

  return {
    tenantId,
    plan: workspace.plan,
    simulation: workspace.simulation,
    runbooks: workspace.runbooks,
    runbookSignals: signals,
    targets,
    configBand: workspace.state.selectedBand,
    state: workspace.state,
  };
};

export interface LaunchResult {
  readonly workspace: StreamStressLabWorkspace;
  readonly report: string;
  readonly findings: ReturnType<typeof prioritizeFindings>;
  readonly recommendations: ReturnType<typeof buildFusionDelta>;
}

export const launchStressLabRun = async (input: StressLabServiceInput): Promise<LaunchResult> => {
  const coordinator = new DefaultSessionCoordinator();
  const targets = buildMockTargets(input.signals);
  const topology: WorkloadTopology = {
    tenantId: input.tenantId,
    nodes: targets.map((target, index) => ({
      id: target.workloadId,
      name: `${target.name}-${index}`,
      ownerTeam: 'platform',
      criticality: target.criticality,
      active: true,
    })),
    edges: targets
      .slice(1)
      .map((target, index) => ({
        from: targets[index]?.workloadId ?? target.workloadId,
        to: target.workloadId,
        coupling: 0.2 + (index % 3) * 0.25,
        reason: `edge-${index}`,
      })),
  };
  buildTopologyGraph(topology);

  const result = await coordinator.bootstrap({
    tenantId: input.tenantId,
    config: input.config,
    runbooks: input.runbooks.map((runbook) => ({
      id: String(runbook.id),
      title: runbook.name,
      steps: runbook.steps,
      cadence: runbook.cadence,
    })),
    targets,
    topology,
    signals: input.signals,
  });

  const workspace: StreamStressLabWorkspace = {
    tenantId: input.tenantId,
    plan: result.context.plan,
    simulation: result.context.simulation,
    runbooks: result.context.runbooks,
    runbookSignals: input.signals,
    targets,
    configBand: result.context.config.band,
    state: {
      tenantId: input.tenantId,
      selectedBand: result.context.config.band,
      selectedSignals: input.signals,
      plan: result.context.plan,
      simulation: result.context.simulation,
    },
  };

  const audit = auditWorkspace(
    input.tenantId,
    workspace.plan,
    workspace.simulation,
    workspace.runbooks,
    workspace.runbookSignals,
    result.context.plan,
  );

  const recommendations = buildFusionDelta({
    tenantId: input.tenantId,
    topology,
    runbooks: workspace.runbooks,
    selectedSignals: input.signals,
    plan: workspace.plan,
    simulation: workspace.simulation,
    state: workspace.state,
  });

  return {
    workspace,
    report: summarizeAudit(audit),
    findings: prioritizeFindings(audit.findings),
    recommendations,
  };
};
