import { fail, ok, type Result } from '@shared/result';
import {
  ReadinessLabGraph,
  ReadinessLabPluginCatalog,
  buildPluginOrder,
  makeReadinessLabNamespace,
  type ReadinessLabExecutionContext,
  type ReadinessLabPlugin,
  type ReadinessLabStep,
  type ReadinessLabExecutionInput,
  type ReadinessLabExecutionOutput,
  type ReadinessLabRunId,
} from '@domain/recovery-readiness';
import {
  InMemoryReadinessLabWorkspaceStore,
  type ReadinessLabWorkspaceStore,
} from '@data/recovery-readiness-store';
import { withReadinessLabSession } from './lab-runtime';

export interface ReadinessLabOrchestratorSpec {
  readonly tenant: string;
  readonly namespace: string;
  readonly steps: readonly ReadinessLabStep[];
  readonly planId: string;
}

export interface ReadinessLabOrchestratorReport {
  readonly workspaceId: ReadinessLabRunId;
  readonly runCount: number;
  readonly executed: ReadonlyArray<ReadinessLabExecutionOutput>;
  readonly diagnostics: ReadonlyArray<string>;
}

type LabPlugin = ReadinessLabPlugin<ReadinessLabStep, ReadinessLabExecutionInput, ReadinessLabExecutionOutput>;

const basePlugins = [
  {
    kind: 'discover',
    tag: 'core',
    step: 'discover',
    metadata: {
      pluginId: 'discover-core',
      displayName: 'Readiness Discover',
      version: '0.0.1',
      supportedChannels: ['telemetry', 'signal'],
    },
    execute: async (input) => {
      const graph = new ReadinessLabGraph(input.context.runId, ['discover', 'triage'], [
        { step: 'discover', index: 0, score: 1 },
        { step: 'triage', index: 1, score: 2 },
      ]);

      return {
        runId: input.context.runId,
        planId: `${input.plan.planId}:discover` as ReadinessLabExecutionOutput['planId'],
        generatedSignals: input.plan.signals.slice(0, 1),
        warnings: [`graph-nodes:${graph.nodes.size}`],
      };
    },
  },
  {
    kind: 'triage',
    tag: 'core',
    step: 'triage',
    metadata: {
      pluginId: 'triage-core',
      displayName: 'Readiness Triage',
      version: '0.0.1',
      supportedChannels: ['signal', 'control'],
    },
    execute: async (input) => ({
      runId: input.context.runId,
      planId: `${input.plan.planId}:triage` as ReadinessLabExecutionOutput['planId'],
      generatedSignals: input.plan.signals.filter((signal) => signal.severity !== 'low'),
      warnings: ['triage-complete'],
    }),
  },
  {
    kind: 'simulate',
    tag: 'core',
    step: 'simulate',
    metadata: {
      pluginId: 'simulate-core',
      displayName: 'Readiness Simulate',
      version: '0.0.1',
      supportedChannels: ['telemetry', 'playbook'],
    },
    execute: async (input) => ({
      runId: input.context.runId,
      planId: `${input.plan.planId}:simulate` as ReadinessLabExecutionOutput['planId'],
      generatedSignals: input.plan.signals.map((signal) => ({ ...signal, details: { ...signal.details, simulated: true } })),
      warnings: [`forecast:${input.plan.signals.length}`],
    }),
  },
] satisfies readonly LabPlugin[];

const isWorkspaceStore = (candidate: unknown): candidate is ReadinessLabWorkspaceStore =>
  Boolean(candidate) && typeof candidate === 'object' && 'upsert' in (candidate as object);

export const runReadinessLabOrchestration = async (
  spec: ReadinessLabOrchestratorSpec,
  draft: ReadinessLabExecutionInput,
): Promise<Result<ReadinessLabOrchestratorReport, Error>> => {
  const order = buildPluginOrder(spec.steps);
const catalog = new ReadinessLabPluginCatalog(basePlugins);
  const repository = new InMemoryReadinessLabWorkspaceStore();

  if (!isWorkspaceStore(repository)) {
    return fail(new Error('workspace-store-initialization-failed'));
  }

  try {
    const result = await withReadinessLabSession(
      {
        tenant: spec.tenant,
        namespace: spec.namespace,
        repository,
      },
      catalog,
      async (session) => {
        const boot = await session.bootstrapWorkspace(spec.steps);
        if (!boot.ok) {
          throw boot.error;
        }

        const outputs = await session.execute(
          {
            workspaceId: `${spec.tenant}:${spec.namespace}` as ReadinessLabRunId,
            steps: order,
            runLimit: 100,
          },
          {
            ...draft,
            context: {
              ...draft.context,
              namespace: makeReadinessLabNamespace(spec.tenant, `${spec.namespace}:ns`) as ReadinessLabExecutionContext['namespace'],
              runLimit: 100,
            },
          },
        );

        const summary = outputs.flatMap((output) => output.warnings);
        return {
          workspaceId: boot.value.workspaceId,
          runCount: outputs.length,
          executed: outputs,
          diagnostics: summary,
        };
      },
    );

    return ok(result);
  } catch (error) {
    return fail(error as Error);
  }
};

export interface ReadinessLabConsolidatedInput {
  readonly tenant: string;
  readonly namespace: string;
  readonly runId: ReadinessLabExecutionInput['context']['runId'];
  readonly steps: readonly ReadinessLabStep[];
  readonly seeds: ReadonlyArray<ReadinessLabExecutionInput['context']>;
}

export const runReadinessLabBatch = async (
  input: ReadinessLabConsolidatedInput,
  toRun: ReadonlyArray<ReadinessLabExecutionInput>,
): Promise<Result<ReadonlyArray<ReadinessLabOrchestratorReport>, Error>> => {
  const outputs = await Promise.all(
    toRun.map((execution) =>
      runReadinessLabOrchestration(
        {
          tenant: input.tenant,
          namespace: input.namespace,
          steps: input.steps,
          planId: `batch:${input.tenant}:${input.namespace}`,
        },
        execution,
      ),
    ),
  );

  const succeeded = outputs.flatMap((entry) => (entry.ok ? [entry.value] : []));
  if (succeeded.length === 0) {
    return fail(new Error('batch-empty'));
  }

  return ok(succeeded);
};
