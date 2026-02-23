import { RecoverySignal, CommandRunbook, WorkloadTarget, WorkloadTopology, TenantId, RecoverySimulationResult, OrchestrationPlan, simulateBandCoverage } from '@domain/recovery-stress-lab';
import { compareSimulations } from '@domain/recovery-stress-lab';
import { runSimulation } from './execution';
import { StressLabEngineConfig } from './types';
import { compileWorkspace, buildFusionDelta, normalizeWorkspace } from '@domain/recovery-stress-lab';

export interface PipelineInput {
  readonly tenantId: TenantId;
  readonly config: StressLabEngineConfig;
  readonly targets: readonly WorkloadTarget[];
  readonly runbooks: readonly CommandRunbook[];
  readonly topology: WorkloadTopology;
  readonly signals: readonly RecoverySignal[];
  readonly baseline: RecoverySimulationResult | null;
}

export interface PipelineOutput {
  readonly tenantId: TenantId;
  readonly plan: OrchestrationPlan;
  readonly simulation: RecoverySimulationResult;
  readonly diffReport: ReturnType<typeof compareSimulations>;
  readonly bandCoverage: ReturnType<typeof simulateBandCoverage>;
  readonly delta: ReturnType<typeof buildFusionDelta>;
}

export const buildExecutionPipeline = async (input: PipelineInput): Promise<PipelineOutput> => {
  const workspace = normalizeWorkspace(
    compileWorkspace({
      tenantId: input.tenantId,
      targets: input.targets,
      signals: input.signals,
      selectedRunbooks: input.runbooks,
      profileHint: input.config.profileHint,
    }),
  );
  const plan = workspace.plan ?? {
    tenantId: input.tenantId,
    scenarioName: `fallback-${input.tenantId}`,
    schedule: [],
    runbooks: workspace.runbooks,
    dependencies: { nodes: [], edges: [] },
    estimatedCompletionMinutes: 10,
  };

  const simulation = workspace.simulation ?? runSimulation({
    tenantId: input.tenantId,
    band: input.config.band,
    selectedSignals: input.signals,
    plan,
    riskBias: input.config.profileHint,
  });

  const diffReport = compareSimulations(input.baseline ?? simulation, simulation);
  const bandCoverage = simulateBandCoverage(workspace.runbooks, input.config.band);
  const delta = buildFusionDelta(workspace);

  return {
    tenantId: input.tenantId,
    plan,
    simulation,
    diffReport,
    bandCoverage,
    delta,
  };
};

export interface PipelineState {
  readonly phase: 'build' | 'simulate' | 'audit' | 'persist';
  readonly planCount: number;
  readonly signalCount: number;
}

export const buildPipelineState = (input: PipelineOutput): PipelineState => {
  const hasPlan = input.plan.runbooks.length > 0;
  const isPlanMissing = !hasPlan;
  const phase = isPlanMissing ? 'build' : input.simulation.ticks.length > 0 ? 'persist' : 'simulate';
  return {
    phase,
    planCount: input.plan.runbooks.length,
    signalCount: input.simulation.selectedRunbooks.length,
  };
};

export const isHealthy = (input: PipelineOutput): boolean => {
  return input.simulation.riskScore < 0.7 && input.simulation.slaCompliance > 0.6;
};
