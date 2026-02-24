import {
  formatISO,
  type AnyGraphPlugin,
  type ExecutionContext,
  type GraphOutput,
  type OrchestratorHints,
  type OrchestratorInput,
  type PluginExecutionEnvelope,
  type PluginExecutionSummary,
  type PluginOutputEnvelope,
  type PluginResult,
  type PluginId,
  type ProfileHint,
  type RecoveryGraphEvent,
  type RecoveryWorkflow,
  type StageFingerprint,
  type Stage,
  type TenantScope,
  type GraphPluginDescriptor,
  withDefaults,
} from './types';
import { assertNonEmpty, safeHead } from './tuple-utils';
import { RecoveryGraphPluginRegistry } from './plugin-registry';
import { AsyncAdapterHub, withScope } from './adapter';

export type RuntimePlan<TPlugins extends readonly AnyGraphPlugin[]> = {
  readonly context: ExecutionContext;
  readonly runId: string;
  readonly plugins: readonly TPlugins[number][];
  readonly hints: OrchestratorHints;
  readonly limit: number;
};

export interface RuntimeResult<TPlugins extends readonly AnyGraphPlugin[]> {
  readonly workspaceId: string;
  readonly pluginOutputs: PluginOutputEnvelope<TPlugins>;
  readonly summaries: readonly PluginExecutionSummary[];
  readonly output: GraphOutput;
  readonly diagnostics: readonly RecoveryGraphEvent[];
}

const normalizeContext = (workflow: RecoveryWorkflow, profile: ProfileHint, hints: OrchestratorHints): ExecutionContext => ({
  traceId: `${workflow.id}:trace:${profile.profileId}` as ExecutionContext['traceId'],
  workspaceId: workflow.id,
  startedAt: formatISO(new Date()),
  requestId: `${workflow.runId}:request:${hints.parallelism}` as ExecutionContext['requestId'],
  stage: safeHead(workflow.stages) ?? 'observe',
  trace: ['start', workflow.tenantId as string, workflow.incidentId as string],
});

const buildPluginTimeline = (plugins: readonly AnyGraphPlugin[]): readonly RecoveryGraphEvent[] =>
  plugins.map((plugin) => ({
    stage: plugin.stage,
    name: `graph:${plugin.name as string}` as RecoveryGraphEvent<string, unknown>['name'],
    payload: {
      plugin: plugin.name,
      stage: plugin.stage,
    },
    timestamp: formatISO(new Date()),
  }));

export class RecoveryOrchestratorEngine<TPlugins extends readonly AnyGraphPlugin[]> {
  readonly #registry: RecoveryGraphPluginRegistry<TPlugins>;
  readonly #hints: OrchestratorHints;

  constructor(readonly plugins: TPlugins, hints?: Partial<OrchestratorHints>) {
    this.#registry = new RecoveryGraphPluginRegistry<TPlugins>(plugins);
    this.#hints = {
      dryRun: false,
      trace: true,
      timeoutMs: 1500,
      parallelism: 2,
      ...hints,
    } satisfies OrchestratorHints;
  }

  buildPlan(input: OrchestratorInput): RuntimePlan<TPlugins> {
    const normalized = withDefaults(input);
    const mapped = normalized.requestedPlugins
      .map((pluginId) => this.#registry.getPlugin(pluginId as string))
      .filter((plugin): plugin is TPlugins[number] => plugin !== undefined);

    const selected = mapped.length > 0 ? mapped : this.plugins;
    const selectedPlugins = assertNonEmpty(selected);
    const limit = Math.min(normalized.limit, selectedPlugins.length);

    return {
      context: normalizeContext(input.workflow, input.profile, this.#hints),
      runId: `${input.workflow.runId}:runtime` as string,
      plugins: selectedPlugins.slice(0, limit),
      hints: this.#hints,
      limit,
    };
  }

  async run(input: OrchestratorInput): Promise<RuntimeResult<TPlugins>> {
    const plan = this.buildPlan(input);
    const timeline = buildPluginTimeline(plan.plugins);
    const adapter = new AsyncAdapterHub<TPlugins>();
    const pluginOutputManifest = this.#registry.createOutputManifest();

    const summaries = await withScope(adapter, async () => {
      const rows: PluginExecutionSummary[] = [];

      for (const plugin of plan.plugins) {
        const result = await executePlugin(plugin, input.workflow, plan.context, input.profile, plan.hints);
        const key = plugin.id as TPlugins[number]['id'] & string;

        const prior = pluginOutputManifest[key] as readonly PluginResult[] | undefined;
        pluginOutputManifest[key] = [...(prior ?? []), result] as PluginOutputEnvelope<TPlugins>[TPlugins[number]['id'] & string];

        adapter.append(plugin, result);

        rows.push({
          pluginId: plugin.id,
          status: plan.hints.dryRun ? 'skipped' : 'ok',
          metrics: [
            {
              metric: `${key}:duration`,
              value: result.diagnostics.reduce((acc, item) => acc + item.durationMs, 0),
              unit: 'ms',
            },
          ],
        });
      }

      return rows;
    });

    const output: GraphOutput = {
      runId: `${input.workflow.runId}` as PluginResult['runId'],
      records: plan.plugins.map((plugin) => ({
        pluginId: plugin.id,
        pluginName: plugin.name,
        outputCount: 1,
        averagePayload: 1,
        producedAt: formatISO(new Date()),
      })),
      diagnostics: plan.plugins.map((plugin) => ({
        pluginId: plugin.id,
        startedAt: formatISO(new Date()),
        durationMs: 1,
        stage: plugin.stage,
        memo: {
          plugin: plugin.name,
          workflow: input.workflow.id,
        },
      })),
    };

    const envelope: PluginExecutionEnvelope<TPlugins> = {
      runId: output.runId,
      pluginOutputs: pluginOutputManifest,
      pluginSummaries: summaries,
      output,
    };

    return {
      workspaceId: input.workflow.id,
      pluginOutputs: envelope.pluginOutputs,
      summaries: envelope.pluginSummaries,
      output,
      diagnostics: [...timeline, ...adapter.collectDiagnostics()],
    };
  }
}

async function executePlugin(
  plugin: AnyGraphPlugin,
  workflow: RecoveryWorkflow,
  context: ExecutionContext,
  profile: ProfileHint,
  hints: OrchestratorHints,
): Promise<PluginResult> {
  const startedAt = performance.now();

  const scope = {
    tenantScope: {
      tenantId: workflow.tenantId,
      incidentId: workflow.incidentId,
    } satisfies TenantScope,
    stage: plugin.stage,
    parallelism: hints.parallelism,
    dryRun: hints.dryRun,
    trace: hints.trace,
  };

  let rawResult: PluginResult;

  try {
    rawResult = await plugin.run(
      workflow,
      {
        ...context,
        stage: context.stage,
        trace: [...context.trace, plugin.id as string],
      },
      profile,
      scope,
    );
  } catch (error) {
    const end = performance.now();
    const message = error instanceof Error ? error.message : String(error);
    return {
      pluginId: plugin.id,
      runId: workflow.runId,
      records: [],
      diagnostics: [
        {
          pluginId: plugin.id,
          startedAt: formatISO(new Date()),
          durationMs: Math.max(1, end - startedAt),
          stage: plugin.stage,
          memo: {
            plugin: plugin.name,
            profile: profile.profileId,
            error: message,
          },
        },
      ],
    };
  }

  const elapsed = Math.max(1, performance.now() - startedAt);
  const diagnostics = [
    {
      pluginId: plugin.id,
      startedAt: formatISO(new Date()),
      durationMs: elapsed,
      stage: plugin.stage,
      memo: {
        plugin: plugin.name,
        parallelism: hints.parallelism,
      },
    },
    ...rawResult.diagnostics,
  ] as PluginResult['diagnostics'];

  return {
    ...rawResult,
    diagnostics,
  };
}

export const buildFingerprint = (tenantId: string, pluginId: PluginId): StageFingerprint => `${tenantId}:${pluginId}` as StageFingerprint;

export const createEngine = <TPlugins extends readonly AnyGraphPlugin[]>(plugins: TPlugins, hints?: Partial<OrchestratorHints>) =>
  new RecoveryOrchestratorEngine<TPlugins>(plugins, hints);

export { GraphPluginDescriptor };
