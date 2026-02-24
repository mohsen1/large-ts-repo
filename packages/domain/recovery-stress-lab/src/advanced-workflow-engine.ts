import {
  canonicalizeNamespace,
  PluginContext,
  PluginDefinition,
  PluginRegistry,
  executePluginChain,
  type PluginKind,
} from '@shared/stress-lab-runtime';
import { type Result, fail, ok } from '@shared/result';
import {
  WORKFLOW_STAGES,
  createWorkflowRunId,
  stageEnvelopeRoute,
  summarizeExecutionResult,
  type StageDiagnosticsByStage,
  type WorkflowExecutionResult,
  type WorkflowExecutionStage,
  type WorkflowExecutionTrace,
  type WorkflowFinalizeEnvelope,
  type WorkflowInputEnvelope,
  type WorkflowReportEnvelope,
  type WorkflowStage,
} from './advanced-workflow-models';
import {
  buildAdvancedWorkflowChain,
  collectPluginKinds,
  mapPluginTrace,
} from './advanced-workflow-catalog';
import { withWorkflowAudit } from './advanced-workflow-audit';

const workflowNamespace = canonicalizeNamespace('recovery:stress:lab:advanced');

type WorkflowFinalPayload = WorkflowFinalizeEnvelope | WorkflowReportEnvelope;

type AdvancedPluginConfig = {
  readonly tenantId: string;
  readonly requestId: string;
  readonly stageOrder: readonly WorkflowStage[];
  readonly mode: 'adaptive' | 'conservative' | 'agile';
};

type TypedWorkflowChain = readonly PluginDefinition<
  WorkflowInputEnvelope,
  WorkflowFinalPayload,
  AdvancedPluginConfig,
  PluginKind
>[];

const buildStageTiming = (startedAt: string): WorkflowExecutionStage[] => {
  const base = new Date(startedAt).getTime();
  return WORKFLOW_STAGES.map((entry, index) => ({
    stage: entry,
    route: stageEnvelopeRoute(entry),
    startedAt,
    finishedAt: new Date(base + index * 12).toISOString(),
    elapsedMs: 12,
  }));
};

const emptyStageSummary = (): StageDiagnosticsByStage => {
  const values = WORKFLOW_STAGES.reduce<Record<string, { index: number; stage: WorkflowStage; events: readonly string[] }>>(
    (acc, stage, index) => {
      acc[`stage:${stage}`] = {
        index,
        stage,
        events: [],
      };
      return acc;
    },
    {},
  );
  return values as StageDiagnosticsByStage;
};

const collectTraces = (pluginKinds: readonly string[]): readonly WorkflowExecutionTrace[] =>
  pluginKinds.map((pluginKind, index) => ({
    sequence: index,
    stage: WORKFLOW_STAGES[Math.min(index, WORKFLOW_STAGES.length - 1)],
    pluginId: pluginKind,
    ok: true,
    message: `applied:${pluginKind}`,
  }));

const runDiagnostics = (result: WorkflowFinalPayload): readonly string[] =>
  result.payload.traces.map((entry, index) => `${index}::${entry.message}`);

export const runAdvancedWorkflow = async (
  input: WorkflowInputEnvelope,
): Promise<Result<WorkflowExecutionResult, string>> => {
  const workspaceInput = input.runId
    ? input
    : ({ ...input, runId: createWorkflowRunId(input.workspaceTenantId) } as WorkflowInputEnvelope);

  const chain = buildAdvancedWorkflowChain();
  const registry = PluginRegistry.create(workflowNamespace);
  for (const plugin of chain as unknown as readonly PluginDefinition<unknown, unknown, AdvancedPluginConfig, PluginKind>[]) {
    registry.register(plugin as PluginDefinition<unknown, unknown, AdvancedPluginConfig, PluginKind>);
  }

  const pluginKinds = collectPluginKinds();
  void mapPluginTrace(chain as never);
  const stageTiming = buildStageTiming(new Date().toISOString());

  const context: PluginContext<AdvancedPluginConfig> = {
    tenantId: workspaceInput.workspaceTenantId,
    requestId: workspaceInput.runId,
    namespace: workflowNamespace,
    startedAt: new Date().toISOString(),
    config: {
      tenantId: String(workspaceInput.workspaceTenantId),
      requestId: workspaceInput.runId,
      stageOrder: WORKFLOW_STAGES,
      mode: 'adaptive',
    },
  };

  try {
    const chainOutput = await withWorkflowAudit(
      workspaceInput.runId,
      workspaceInput.workspaceTenantId,
      async () =>
        executePluginChain(
          chain as never,
          context as never,
          workspaceInput as never,
        ),
    );

    if (!chainOutput.ok || chainOutput.value === undefined) {
      return fail(`workflow execution failed: ${(chainOutput.errors ?? ['unknown']).join(', ')}`);
    }

    const output = chainOutput.value as WorkflowFinalPayload;
    const reportPayload = output.payload;
    const summary = summarizeExecutionResult({
      runId: output.runId,
      tenantId: workspaceInput.workspaceTenantId,
      stages: stageTiming,
      traces: output.payload.traces,
      stageSummary: {
        ...emptyStageSummary(),
        'stage:input': {
          index: 0,
          stage: 'input',
          events: ['input'],
        },
      },
      workspace: workspaceInput.payload.workspace,
      simulation: output.payload.simulation ?? null,
      plan: output.payload.plan ?? null,
      recommendations: runDiagnostics(output),
    });

    return ok({
      runId: output.runId,
      tenantId: workspaceInput.workspaceTenantId,
      stages: output.stage === 'finalize' ? output.payload.stages : reportPayload.stages,
      traces: collectTraces(pluginKinds),
      stageSummary: {
        ...emptyStageSummary(),
        'stage:finalize': {
          index: pluginKinds.length,
          stage: 'finalize',
          events: [summary.route],
        },
      },
      workspace: workspaceInput.payload.workspace,
      simulation: output.payload.simulation ?? null,
      plan: output.payload.plan ?? null,
      recommendations: runDiagnostics(output),
    });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
};

export interface AdvancedWorkflowResult {
  readonly runId: string;
  readonly tenantId: string;
  readonly stages: readonly WorkflowExecutionStage[];
  readonly traces: readonly WorkflowExecutionTrace[];
  readonly recommendations: readonly string[];
  readonly summary: string;
}
