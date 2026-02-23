import { StressLabOrchestrator } from './orchestrator';
import { buildExecutionPipeline } from './execution-pipeline';
import { buildScenarioWorkflow, buildScenarioWorkflow as buildWorkflow, transitionWorkflow } from '@domain/recovery-stress-lab';
import { StressLabEngineConfig, StressLabWorkspace } from './types';
import { StressLabWorkspaceState } from './orchestrator';
import { TenantId, WorkloadTarget, RecoverySignal, CommandRunbook, WorkloadTopology } from '@domain/recovery-stress-lab';
import { buildStressForecast, buildStressMetricReport, compareStressReports, buildTopologyRiskProfile } from '@domain/recovery-stress-lab';

export interface PipelineStepResult {
  readonly step: string;
  readonly ok: boolean;
  readonly message: string;
}

export interface PipelineCoordinatorInput {
  readonly tenantId: TenantId;
  readonly config: StressLabEngineConfig;
  readonly targets: readonly WorkloadTarget[];
  readonly runbooks: readonly CommandRunbook[];
  readonly topology: WorkloadTopology;
  readonly signals: readonly RecoverySignal[];
}

export interface PipelineCoordinatorOutput {
  readonly tenantId: TenantId;
  readonly state: StressLabWorkspaceState;
  readonly steps: readonly PipelineStepResult[];
  readonly workflowState: ReturnType<typeof buildScenarioWorkflow>;
  readonly forecast: ReturnType<typeof buildStressForecast>;
  readonly reports: {
    readonly metrics: ReturnType<typeof buildStressMetricReport>;
    readonly diff: ReturnType<typeof compareStressReports> | null;
  };
}

export class RecoveryStressPipelineOrchestrator {
  private readonly orchestrator: StressLabOrchestrator;
  private readonly history: Map<TenantId, ReturnType<typeof buildStressMetricReport>>;

  constructor() {
    this.orchestrator = new StressLabOrchestrator();
    this.history = new Map();
  }

  async build(input: PipelineCoordinatorInput): Promise<PipelineCoordinatorOutput> {
    const baseline = this.history.get(input.tenantId) ?? null;
    const steps: PipelineStepResult[] = [];
    const workflow = buildScenarioWorkflow({
      tenantId: input.tenantId,
      band: input.config.band,
      runbooks: input.runbooks,
      signals: input.signals,
      requestedBy: `tenant:${input.tenantId}`,
    });
    steps.push({ step: 'workflow', ok: workflow.blockers.length === 0, message: `${workflow.state}` });

    const context = {
      tenantId: input.tenantId,
      topologyId: String(input.topology.tenantId),
      config: input.config,
      runbooks: input.runbooks.map((runbook) => ({
        id: runbook.id,
        title: runbook.name,
        steps: runbook.steps as readonly unknown[],
        cadence: runbook.cadence,
      })),
      targets: input.targets as unknown as any[],
      topology: input.topology,
      signals: [...input.signals],
    };

    const state = await this.orchestrator.bootstrap(context);
    steps.push({ step: 'orchestrator-bootstrap', ok: Boolean(state.decision.plan), message: `plan=${Boolean(state.decision.plan)}` });
    const pipelineInput = {
      tenantId: input.tenantId,
      config: input.config,
      targets: input.targets,
      runbooks: input.runbooks,
      topology: input.topology,
      signals: input.signals,
      baseline: state.decision.simulation,
    };
    const pipeline = await buildExecutionPipeline(pipelineInput as any);
    steps.push({
      step: 'pipeline-output',
      ok: pipeline.plan.runbooks.length > 0,
      message: `windows=${pipeline.plan.schedule.length}`,
    });

    const forecast = buildStressForecast({
      tenantId: input.tenantId,
      band: input.config.band,
      topology: input.topology,
      signals: input.signals,
      windowMinutes: 15,
    });
    steps.push({ step: 'forecast', ok: forecast.windows.length > 0, message: `trend=${forecast.trend}` });

    const workspace: StressLabWorkspace = {
      tenantId: input.tenantId,
      runbooks: state.decision.plan ? state.decision.plan.runbooks : [],
      targetWorkloads: context.targets as unknown as WorkloadTarget[],
      knownSignals: input.signals,
      config: input.config,
    };

    const nextMetrics = buildStressMetricReport(
      String(input.tenantId),
      input.signals,
      input.topology,
      state.decision.simulation,
      state.decision.plan,
      state.decision.plan?.runbooks ?? [],
    );
    const nextWorkflow = buildWorkflow({
      tenantId: input.tenantId,
      band: input.config.band,
      runbooks: input.runbooks,
      signals: input.signals,
      requestedBy: String(input.tenantId),
    });
    const transition = transitionWorkflow('simulating', nextWorkflow.state, ['execution complete']);
    steps.push({
      step: 'workflow-transition',
      ok: Boolean(transition.to),
      message: `${transition.from}->${transition.to}`,
    });
    const riskProfile = buildTopologyRiskProfile({
      tenantId: input.tenantId,
      band: input.config.band,
      topology: input.topology,
      runbooks: input.runbooks,
      signals: input.signals,
    });

    const diff = baseline
      ? compareStressReports(baseline, nextMetrics)
      : null;

    this.history.set(input.tenantId, nextMetrics);
    return {
      tenantId: input.tenantId,
      state,
      steps,
      workflowState: nextWorkflow,
      forecast,
      reports: {
        metrics: nextMetrics,
        diff: diff
          ? {
              ...diff,
              summary: {
                ...diff.summary,
                topRiskWorkloads: [...new Set([...riskProfile.targetedWorkloads])].slice(0, 5),
              },
            }
          : null,
      },
    };
  }
}
