import { runPipeline, Pipeline, AsyncMapper } from '@shared/type-level';
import {
  buildSignalDensityMatrix,
  pickTopSignalIds,
  computeSignalCoverage,
} from '@domain/recovery-stress-lab';
import {
  CommandRunbook,
  WorkloadTopology,
  RecoverySignal,
  SeverityBand,
  TenantId,
  OrchestrationPlan,
  RecoverySimulationResult,
  DraftTemplate,
  createRunbookId,
} from '@domain/recovery-stress-lab';
import { buildOrchestrationPlan, runSimulation } from './execution';
import { BuildDecision } from './execution';
import { StressLabDraft, StressLabEngineConfig, StressLabDecision } from './types';

export interface MeshPipelineInput {
  readonly tenantId: TenantId;
  readonly band: SeverityBand;
  readonly runbooks: readonly CommandRunbook[];
  readonly topology: WorkloadTopology;
  readonly signals: readonly RecoverySignal[];
  readonly draft: Pick<StressLabDraft, 'name' | 'description'>;
  readonly config: Pick<StressLabEngineConfig, 'band' | 'profileHint' | 'selectedRunbooks'>;
}

export interface MeshPipelineOutput {
  readonly tenantId: TenantId;
  readonly band: SeverityBand;
  readonly draft: StressLabDraft;
  readonly decision: StressLabDecision;
  readonly topSignals: readonly RecoverySignal['id'][];
  readonly signalCoverage: ReturnType<typeof computeSignalCoverage>;
  readonly routedPlan: OrchestrationPlan | null;
  readonly sim: RecoverySimulationResult | null;
}

const normalizeInput = (input: MeshPipelineInput): MeshPipelineInput => {
  const normalizedSignals = input.signals
    .map((signal) => signal)
    .filter((signal) => Boolean(signal.id))
    .sort((left, right) => {
      if (left.createdAt === right.createdAt) return left.id.localeCompare(right.id);
      return left.severity.localeCompare(right.severity);
    });

  return {
    ...input,
    signals: normalizedSignals,
  };
};

const buildDraft = (input: MeshPipelineInput): StressLabDraft => {
  const matrix = buildSignalDensityMatrix(input.tenantId, input.signals);
  const topSignals = pickTopSignalIds(matrix, 8);
    const selectedRunbooks = [...input.config.selectedRunbooks].map((runbookId) => createRunbookId(runbookId));
  return {
    name: input.draft.name,
    description: input.draft.description,
    band: input.band,
    selectedSignals: [...topSignals],
    selectedRunbookIds: selectedRunbooks,
  };
};

const buildDecision = (input: MeshPipelineInput, draft: StressLabDraft): BuildDecision | null => {
  const planTemplate: DraftTemplate = {
    tenantId: input.tenantId,
    title: draft.name,
    band: draft.band,
    selectedRunbooks: [...draft.selectedRunbookIds],
    selectedSignals: [...draft.selectedSignals],
  };

  return buildOrchestrationPlan({
    tenantId: input.tenantId,
    band: input.band,
    riskBias: input.config.profileHint,
    draft: planTemplate,
    runbooks: input.runbooks,
    topology: input.topology,
    signals: input.signals,
  });
};

const buildCoverage = (input: MeshPipelineInput): ReturnType<typeof computeSignalCoverage> => {
  return computeSignalCoverage(
    input.tenantId,
    input.topology,
    input.signals,
    input.runbooks,
  );
};

const buildSimulation = (input: MeshPipelineInput, buildDecision: BuildDecision): RecoverySimulationResult | null => {
  if (!buildDecision.plan) {
    return null;
  }

  return runSimulation({
    tenantId: input.tenantId,
    band: input.band,
    selectedSignals: input.signals.slice(0, 8),
    plan: buildDecision.plan,
    riskBias: input.config.profileHint,
  });
};

const buildStressDecision = (input: MeshPipelineInput, draft: StressLabDraft, buildDecision: BuildDecision): StressLabDecision => {
  const sim = buildSimulation(input, buildDecision);
  return {
    plan: buildDecision.plan,
    simulation: sim,
    errors: buildDecision.errors,
  };
};

export const executeMeshPipeline = async (input: MeshPipelineInput): Promise<MeshPipelineOutput> => {
  const pipeline: Array<(input: any) => Promise<any>> = [
    async (candidate) => normalizeInput(candidate),
    async (candidate) => candidate,
    async (candidate) => {
      const draft = buildDraft(candidate);
      const build = buildDecision(candidate, draft);
      const decision = build ? buildStressDecision(candidate, draft, build) : {
        plan: null,
        simulation: null,
        errors: ['Unable to construct plan'],
      };
      return {
        tenantId: candidate.tenantId,
        band: candidate.band,
        draft,
        decision,
        topSignals: pickTopSignalIds(buildSignalDensityMatrix(candidate.tenantId, candidate.signals), 10),
        signalCoverage: buildCoverage(candidate),
        routedPlan: decision.plan,
        sim: decision.simulation,
      };
    },
  ];

  const runner = new Pipeline<MeshPipelineInput, MeshPipelineOutput>('stress-lab-mesh', pipeline);
  return runner.execute(input);
};

export const evaluateMeshPlan = async (output: MeshPipelineOutput) => {
  const summary = {
    totalSignals: output.topSignals.length,
  };
  const score = output.signalCoverage.byBand[output.band];
  const alerts = [output.routedPlan?.scenarioName, output.decision.errors.length, String(score)]
    .map(String)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const compare = await runPipeline(
    'stress-lab-mesh-snapshot',
    [
      async (item: string) => ({ length: item.length }),
      async (item: { length: number }) => ({ summary: item.length > 0 ? 'positive' : 'neutral' }),
    ],
    String(output.routedPlan?.scenarioName ?? 'none'),
  );

  return {
    hasPlan: Boolean(output.routedPlan),
    hasSimulation: Boolean(output.sim),
    signalAlerts: alerts.join(';'),
    compare,
    score,
    signalCount: summary.totalSignals,
  };
};
