import { normalizeLimit, withBrand } from '@shared/core';
import { fail, ok, type Result } from '@shared/result';
import {
  createMeshPluginRegistry,
  runPluginSequence,
  type MeshPluginContext,
  type MeshPluginHandle,
} from './registry';
import {
  type MeshNodeContract,
  type MeshPlanId,
  type MeshPathTuple,
  type MeshRunId,
  type MeshRuntimeConfig,
  type MeshSignalKind,
  type MeshStepInput,
  type MeshTopology,
  type MeshOutcome,
} from './types';

export interface MeshOrchestratorDeps<TTopology extends MeshTopology> {
  readonly topology: TTopology;
  readonly plugins: readonly MeshPluginHandle<any, any, string>[];
}

export interface MeshExecutionSnapshot {
  readonly runId: MeshRunId;
  readonly timeline: readonly MeshRunId[];
  readonly metrics: {
    readonly emitted: number;
    readonly errors: number;
    readonly startedAt: number;
    readonly finishedAt?: number;
  };
}

export type MeshNodeResult<TPayload> = Result<MeshOutcome<MeshSignalKind, TPayload>, Error>;

export class MeshEngine<TTopology extends MeshTopology> {
  readonly #topology: TTopology;
  readonly #registry: ReturnType<typeof createMeshPluginRegistry>;

  constructor(deps: MeshOrchestratorDeps<TTopology>) {
    this.#topology = deps.topology;
    this.#registry = createMeshPluginRegistry(deps.plugins);
  }

  async run<TInput, TOutput>(
    input: MeshStepInput<TInput>,
    context: MeshPluginContext,
  ): Promise<MeshNodeResult<TOutput>> {
    try {
      const outputs = (await runPluginSequence(
        this.#registry,
        input.payload,
        context,
      )) as TOutput[];

      const first = outputs.at(0);
      if (!first) {
        return fail(new Error('mesh-no-output'));
      }

      const outcome: MeshOutcome<'telemetry', TOutput> = {
        kind: 'telemetry',
        value: first,
        path: [
          context.runId,
          context.planId,
          this.#topology.nodes[0]?.id ?? withBrand('', 'MeshNodeId'),
          'telemetry',
        ] as MeshPathTuple,
        generatedAt: Date.now(),
      };

      return ok(outcome);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('mesh-run-failed'));
    }
  }

  private *nodeTraversal(): Iterable<MeshNodeContract> {
    for (const node of this.#topology.nodes) {
      yield node;
    }
  }

  async diagnose(max: number = 25): Promise<readonly MeshNodeContract[]> {
    const limit = normalizeLimit(max);
    return [...this.nodeTraversal()].slice(0, limit);
  }

  async snapshot(context: MeshExecutionSnapshot): Promise<MeshExecutionSnapshot> {
    return {
      runId: context.runId,
      timeline: context.timeline,
      metrics: {
        emitted: context.metrics.emitted,
        errors: context.metrics.errors,
        startedAt: context.metrics.startedAt,
        finishedAt: context.metrics.finishedAt,
      },
    };
  }

  async close(): Promise<void> {
    await this.#registry[Symbol.asyncDispose]();
  }
}

export const createMeshEngine = <TTopology extends MeshTopology>(
  topology: TTopology,
  plugins: readonly MeshPluginHandle<any, any, string>[],
): MeshEngine<TTopology> => new MeshEngine({ topology, plugins });

export async function executeMeshRun<TTopology extends MeshTopology, TInput, TOutput>(
  topology: TTopology,
  runId: MeshRunId,
  planId: MeshPlanId,
  plugins: readonly MeshPluginHandle<any, any, string>[],
  input: TInput,
): Promise<MeshNodeResult<TOutput>> {
  const context: MeshPluginContext = {
    runId,
    planId,
    state: {},
    startedAt: Date.now(),
    logger: (...message) => {
      console.log('[mesh]', ...message);
    },
  };

  const engine = createMeshEngine(topology, plugins);
  try {
    return await engine.run<TInput, TOutput>(
      {
        payload: input,
        path: [runId, planId, topology.nodes[0]?.id ?? withBrand('', 'MeshNodeId'), 'input'],
      },
      context,
    );
  } finally {
    await engine.close();
  }
}

export type { MeshRuntimeConfig };
