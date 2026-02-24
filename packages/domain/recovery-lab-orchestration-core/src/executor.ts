import {
  createConvergenceRunId,
  type ConvergenceInput,
  type ConvergenceOutput,
  type ConvergenceScope,
  type ConvergenceStage,
} from './types';
import {
  ConvergencePluginCatalog,
} from './registry';
import { buildConvergenceManifest, createTenantRunInput, bootstrapCatalog } from './loader';
import { summarizeConstraints, summarizeTrace } from './adapters';
import { withConvergenceTelemetry, summarizeTelemetry } from './telemetry';
import { type TenantId, type WorkloadTopology } from '@domain/recovery-stress-lab';
import { normalizeLimit } from '@shared/core';
import type { PluginContext } from '@shared/stress-lab-runtime';

export interface ExecutionSummary {
  readonly runId: string;
  readonly stageTrail: readonly ConvergenceStage[];
  readonly manifestCount: number;
  readonly traceDigest: string;
  readonly diagnostics: readonly string[];
}

export interface ExecutionResult<TStage extends ConvergenceStage = ConvergenceStage> {
  readonly input: ConvergenceInput<TStage>;
  readonly output: ConvergenceOutput<TStage>;
  readonly summary: ExecutionSummary;
}

const stageFromKind = (kind: string): ConvergenceStage => {
  if (kind.endsWith('/input')) return 'input';
  if (kind.endsWith('/resolve')) return 'resolve';
  if (kind.endsWith('/simulate')) return 'simulate';
  if (kind.endsWith('/recommend')) return 'recommend';
  return 'report';
};

const clampLimit = (value: number): readonly ConvergenceStage[] =>
  ['input', 'resolve', 'simulate', 'recommend', 'report'].slice(0, Math.min(5, Math.max(1, normalizeLimit(value)))) as readonly ConvergenceStage[];

export const runConvergenceWorkflow = async <
  TInput extends ConvergenceInput,
>(
  catalog: ConvergencePluginCatalog,
  input: TInput,
  preferredStages: readonly ConvergenceStage[] = clampLimit(5),
): Promise<ExecutionResult<TInput['stage']>> => {
  const runId = createConvergenceRunId(input.tenantId, 'workflow');
  const chain = catalog.buildChain(input, preferredStages);

  return withConvergenceTelemetry(runId, async (telemetry) => {
    let current: ConvergenceOutput | ConvergenceInput = input;
    let output: ConvergenceOutput = {
      runId: input.runId,
      tenantId: input.tenantId,
      stage: input.stage,
      score: 0,
      confidence: 0,
      diagnostics: [],
      simulation: null,
      selectedRunbooks: input.activeRunbooks,
      signalDigest: {
        input: 0,
        resolve: 0,
        simulate: 0,
        recommend: 0,
        report: 0,
      },
    };
    const stageTrail: ConvergenceStage[] = [];
    const runtimeContext: PluginContext<Record<string, unknown>> = {
      tenantId: input.tenantId,
      requestId: `${runId}::${input.stage}`,
      namespace: bootstrapCatalog.namespace as any,
      startedAt: new Date().toISOString(),
      config: {
        runId,
        scope: input.scope,
        traceId: `${runId}::trace`,
        signalCount: input.signals.length,
        config: {},
      },
    };

    for (const plugin of chain) {
      const stage = stageFromKind(plugin.kind);
      telemetry.push('plugin.started', { stage, plugin: plugin.id, request: runId });

      const response = await plugin.run(runtimeContext, current as ConvergenceInput);
      if (!response.ok || response.value === undefined) {
        telemetry.push('plugin.failed', { plugin: plugin.id, reason: String(response.errors?.join(',')) });
        throw new Error(response.errors?.join(',') ?? 'convergence plugin failed');
      }

      telemetry.push('plugin.completed', { stage, plugin: plugin.id, status: 'ok' });
      stageTrail.push(stage);
      output = response.value;
      current = response.value;
    }

    telemetry.push('plugin.completed', { plugin: 'convergence-summary', status: `stageCount:${stageTrail.length}` });
    const traced = await summarizeTelemetry(telemetry);
    const finalOutput = output;
    const diagnostics = [
      ...finalOutput.diagnostics,
      ...summarizeConstraints(input.anchorConstraints),
      ...summarizeTrace(stageTrail),
      ...chain.map((entry) => entry.name),
      `trace:${traced}`,
    ];

    return {
      input,
      output: { ...finalOutput, diagnostics } as ConvergenceOutput<TInput['stage']>,
      summary: {
        runId,
        stageTrail,
        manifestCount: chain.length,
        traceDigest: traced,
        diagnostics,
      },
    };
  });
};

export const runConvergenceSeed = async (
  tenantId: TenantId,
  topology: WorkloadTopology,
  scope: ConvergenceScope = 'tenant',
) => {
  const input = createTenantRunInput(tenantId, topology, scope);
  return runConvergenceWorkflow(bootstrapCatalog, input);
};

export const runCatalogManifestBuild = async (): Promise<number> => {
  const manifest = await buildConvergenceManifest();
  return manifest.plugins.length;
};
