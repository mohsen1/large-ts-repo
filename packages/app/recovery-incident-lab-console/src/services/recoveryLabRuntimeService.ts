import { runLabRuntime, type OrchestratorInput } from '@domain/recovery-lab-console-runtime';
import { catalogEntries, validateCatalog, catalogSnapshot, buildRuntimePlan, summarizePlan, type RuntimeManifest } from '@domain/recovery-lab-console-runtime';
import type { IncidentLabScenario, IncidentLabPlan } from '@domain/recovery-incident-lab-core';
import type { RuntimeRunId, RuntimeSessionId, RuntimeWorkspaceId } from '@domain/recovery-lab-console-runtime';

export interface RuntimeExecutionRequest {
  readonly tenantId: string;
  readonly workspace: string;
  readonly scenario: IncidentLabScenario;
  readonly plan: IncidentLabPlan;
}

export interface RuntimeExecutionResponse {
  readonly runId: RuntimeRunId;
  readonly workspaceId: RuntimeWorkspaceId;
  readonly sessionId: RuntimeSessionId;
  readonly output: unknown;
  readonly report: {
    readonly summary: string;
    readonly manifestCount: number;
    readonly pluginCount: number;
    readonly mode: string;
    readonly snapshots: readonly {
      readonly id: string;
      readonly name: string;
      readonly scope: string;
      readonly stage: string;
      readonly weight: number;
    }[];
  };
  readonly planText: string;
  readonly diagnostics: {
    readonly pluginCount: number;
    readonly durationMs: number;
    readonly stageCount: number;
  };
}

const normalizeScenarioPlan = (scenario: IncidentLabScenario): Record<string, unknown> => ({
  scenarioId: scenario.id,
  severity: scenario.severity,
  steps: scenario.steps.map((step) => ({
    id: step.id,
    command: step.command,
    owner: step.owner,
    expectedDurationMinutes: step.expectedDurationMinutes,
  })),
  topologyTags: [...scenario.topologyTags],
});

const normalizePlan = (plan: IncidentLabPlan): Record<string, unknown> => ({
  planId: plan.id,
  queueLength: plan.queue.length,
  selectedLength: plan.selected.length,
  state: plan.state,
  scheduledBy: plan.scheduledBy,
});

const buildInput = (request: RuntimeExecutionRequest): { input: OrchestratorInput['input']; tenantId: string; workspace: string; mode: OrchestratorInput['mode']; plugins: RuntimeManifest[] } => {
  const pluginCatalog = validateCatalog(catalogEntries).manifests;
  const ordered = buildRuntimePlan(pluginCatalog, {
    tenantId: request.tenantId,
    workspace: request.workspace,
  });
  return {
    input: {
      request: {
        scenario: normalizeScenarioPlan(request.scenario),
        plan: normalizePlan(request.plan),
      },
      executedAt: new Date().toISOString(),
      pluginCount: pluginCatalog.length,
      planSummary: summarizePlan(ordered),
    },
    tenantId: request.tenantId,
    workspace: request.workspace,
    mode: 'predictive',
    plugins: [...ordered.selected],
  };
};

export const executeLabRuntime = async (request: RuntimeExecutionRequest): Promise<RuntimeExecutionResponse> => {
  const validatedPlugins = validateCatalog(catalogEntries).manifests;
  const snapshot = catalogSnapshot();
  const payload = buildInput(request);

  const result = await runLabRuntime({
    tenantId: payload.tenantId,
    workspace: payload.workspace,
    plugins: payload.plugins,
    mode: payload.mode,
    input: payload.input,
  });

  if (!result.ok) {
    throw result.error;
  }

  const output = result.value;
  return {
    runId: output.runId,
    workspaceId: output.workspaceId,
    sessionId: output.sessionId,
    output: output.output,
    report: {
      summary: summarizePlan(buildRuntimePlan(validatedPlugins, payload)),
      manifestCount: output.manifests.length,
      pluginCount: output.manifests.length,
      mode: payload.mode,
      snapshots: snapshot,
    },
    planText: JSON.stringify({
      plan: output.manifests.map((manifest) => manifest.name),
    }, null, 2),
    diagnostics: {
      pluginCount: output.diagnostics.pluginCount,
      durationMs: output.diagnostics.durationMs,
      stageCount: output.diagnostics.stageCount,
    },
  };
};
