import {
  OrchestrationPlan,
  RecoverySimulationResult,
  RecoverySignal,
  TenantId,
  CommandRunbook,
  WorkloadTarget,
} from './models';
import {
  WorkspaceInput,
  WorkspaceOverview,
  WorkspaceStage,
  WorkspacePlanSummary,
  WorkspaceId,
  WorkspaceRunId,
  createWorkspaceFromJson,
  buildWorkspaceOverview,
  buildWorkspaceSummary,
  runWorkspacePlugins,
  type WorkspaceStepState,
  type WorkspaceContext,
  type WorkspacePluginPayload,
} from './studio-workspace';
import { createPluginId, canonicalizeNamespace, PluginDefinition } from '@shared/stress-lab-runtime';

export type WorkspaceAdapterState = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly runId: WorkspaceRunId;
  readonly stage: WorkspaceStage;
  readonly ready: boolean;
  readonly createdAt: string;
};

export interface WorkspaceAdapterResult {
  readonly summary: WorkspaceOverview;
  readonly planSummary: WorkspacePlanSummary;
  readonly pluginState: readonly WorkspaceStepState<string>[];
  readonly envelope: WorkspaceAdapterEnvelope;
}

export interface WorkspaceAdapterEnvelope {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly runId: WorkspaceRunId;
  readonly pluginCount: number;
  readonly signatures: readonly string[];
}

const buildEnvelope = (
  tenantId: TenantId,
  workspace: WorkspaceOverview,
  pluginState: readonly WorkspaceStepState<string>[], 
): WorkspaceAdapterEnvelope => ({
  tenantId,
  workspaceId: workspace.workspaceId,
  runId: workspace.runId,
  pluginCount: pluginState.length,
  signatures: pluginState.map((state) => state.name),
});

const normalizeSignals = (signals: readonly RecoverySignal[]): readonly RecoverySignal[] => {
  return signals
    .filter((signal) => signal.severity === 'critical' || signal.severity === 'high' || signal.severity === 'medium' || signal.severity === 'low')
    .map((signal) => ({ ...signal, metadata: { ...signal.metadata, normalized: true } }));
};

export const buildWorkspaceFromPayload = (payload: unknown): WorkspaceInput => {
  if (typeof payload === 'object' && payload !== null) {
    const candidate = payload as Partial<WorkspaceInput>;
    if (candidate.tenantId && candidate.runbooks && candidate.targets && candidate.signals) {
      return payload as WorkspaceInput;
    }
  }

  return createWorkspaceFromJson(payload as Parameters<typeof createWorkspaceFromJson>[0]);
};

export const buildWorkspaceAdapterState = (tenantId: TenantId, workspaceId: WorkspaceId, runId: WorkspaceRunId, stage: WorkspaceStage): WorkspaceAdapterState => ({
  tenantId,
  workspaceId,
  runId,
  stage,
  ready: true,
  createdAt: new Date().toISOString(),
});

const summarizePlanSignals = (plan: OrchestrationPlan | null, simulation: RecoverySimulationResult | null) => {
  if (!plan) {
    return {
      planRunbooks: 0,
      planMinutes: 0,
      simulationTicks: 0,
      simulatedRisk: null,
    };
  }

  const simulationTicks = simulation?.ticks.length ?? 0;
  const risk = simulation?.riskScore ?? null;

  return {
    planRunbooks: plan.runbooks.length,
    planMinutes: plan.estimatedCompletionMinutes,
    simulationTicks,
    simulatedRisk: risk,
  };
};

export const hydrateWorkspaceFromStore = (
  workspace: {
    readonly tenantId: string;
    readonly runbooks: readonly CommandRunbook[];
    readonly signals: readonly RecoverySignal[];
    readonly targets: readonly WorkloadTarget[];
    readonly stage: WorkspaceStage;
  },
): WorkspaceInput => {
  const tenantId = workspace.tenantId as TenantId;
  return {
    tenantId,
    stage: workspace.stage,
    runbooks: [...workspace.runbooks],
    targets: [...workspace.targets],
    signals: normalizeSignals(workspace.signals),
  };
};

export const mapWorkspaceToEnvelope = async (
  context: WorkspaceContext<WorkspaceInput & WorkspacePluginPayload>,
  adapters?: readonly PluginDefinition<WorkspaceInput, WorkspaceStepState<string>, Record<string, unknown>, any>[],
): Promise<WorkspaceAdapterResult> => {
  const input = buildWorkspaceFromPayload(context.payload);
  const summary = buildWorkspaceOverview(input);
  const planSummary = buildWorkspaceSummary(input);
  const pluginState = await runWorkspacePlugins(adapters ?? [], input);

  return {
    summary,
    planSummary,
    pluginState,
    envelope: buildEnvelope(context.tenantId, summary, pluginState),
  };
};

export const resolveWorkspaceNamespace = (tenantId: TenantId, stage: WorkspaceStage) => {
  return canonicalizeNamespace(`recovery:${tenantId}:workspace:${stage}`);
};

export const buildWorkspaceRuntimePayload = (
  tenantId: TenantId,
  workspaceId: WorkspaceId,
  runId: WorkspaceRunId,
  stage: WorkspaceStage,
): WorkspacePluginPayload => ({
  workspaceId,
  tenantId,
  stage,
  runId,
});

export const buildWorkspaceReadiness = (payload: WorkspaceAdapterResult) => {
  const { summary } = payload;
  const quality = summarizePlanSignals(payload.planSummary.plan, payload.planSummary.simulation);
  return {
    ready: summary.signalCount >= 0,
    risk: quality.simulatedRisk,
    runbooks: quality.planRunbooks,
    planMinutes: quality.planMinutes,
    pluginRatio: payload.envelope.pluginCount / Math.max(1, payload.envelope.signatures.length),
  };
};
