import { asRunId, type LatticeContext, type LatticeTenantId } from './ids';
import { TopologySnapshot, toRouteId, traverseTopology } from './topology';
import type { PlanArtifact, StageDefinition, StageKind } from './planning';
import { runPlan } from './planning';
import { evaluatePolicy, type ConstraintTuple, type NestedPath } from './constraints';

export interface LatticeSessionConfig {
  readonly tenant: LatticeTenantId;
  readonly keepAliveMs: number;
  readonly maxStages: number;
}

export interface LatticeSessionRecord {
  readonly id: ReturnType<typeof asRunId>;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly state: 'active' | 'drained' | 'failed';
}

type AsyncStack = {
  use<T>(resource: T & { [Symbol.asyncDispose]?: () => PromiseLike<void> }): T;
  [Symbol.asyncDispose](): Promise<void>;
};

const getAsyncStack = (): { new (): AsyncStack } => {
  return (
    (globalThis as { AsyncDisposableStack?: { new (): AsyncStack } }).AsyncDisposableStack ??
    class {
      readonly #disposers: Array<() => void | PromiseLike<void>> = [];
      use<T>(resource: T & { [Symbol.asyncDispose]?: () => PromiseLike<void> }): T {
        const dispose = resource?.[Symbol.asyncDispose];
        if (typeof dispose === 'function') {
          this.#disposers.push(() => Promise.resolve(dispose.call(resource)));
        }
        return resource;
      }
      async [Symbol.asyncDispose](): Promise<void> {
        while (this.#disposers.length > 0) {
          const dispose = this.#disposers.pop();
          if (dispose) {
            await dispose();
          }
        }
      }
    }
  );
};

export class LatticeSession implements AsyncDisposable {
  readonly #records = new Map<string, LatticeSessionRecord>();

  constructor(
    private readonly config: LatticeSessionConfig,
    private readonly constraints: readonly ConstraintTuple[],
  ) {}

  appendRecord(id: string, state: LatticeSessionRecord['state']) {
    const startedAt = this.#records.get(id)?.startedAt ?? new Date().toISOString();
    this.#records.set(id, {
      id: asRunId(id),
      startedAt,
      finishedAt: state === 'active' ? undefined : new Date().toISOString(),
      state,
    });
  }

  listRecords(): readonly LatticeSessionRecord[] {
    return [...this.#records.values()];
  }

  runPlan<TContext extends Record<string, unknown>>(
    stages: readonly StageDefinition<TContext, StageKind>[],
    input: TContext,
  ): Promise<PlanArtifact<TContext>> {
    return runPlan(this.config.tenant, stages, input);
  }

  applyPolicy<TContext extends Record<string, unknown>>(context: TContext) {
    if (this.config.maxStages <= 0) return [];
    return evaluatePolicy(context, this.constraints as readonly ConstraintTuple<NestedPath<TContext> & string>[]);
  }

  walkTopology(snapshot: TopologySnapshot): readonly string[] {
    return [...traverseTopology(snapshot)];
  }

  routeIdFromTopology(snapshot: TopologySnapshot): string {
    return toRouteId(snapshot.nodes.map((node) => String(node.id)));
  }

  async [Symbol.asyncDispose](): Promise<void> {
    const stack = new (getAsyncStack())();
    stack.use(this);
    for (const [id, record] of this.#records.entries()) {
      if (record.state === 'active') {
        this.appendRecord(id, 'drained');
      }
    }
    await stack[Symbol.asyncDispose]();
    this.#records.clear();
  }
}

export const withLatticeSession = async <T>(
  config: LatticeSessionConfig,
  handler: (session: LatticeSession) => Promise<T>,
): Promise<T> => {
  const session = new LatticeSession(config, []);
  const AsyncStack = getAsyncStack();
  await using stack = new AsyncStack();
  stack.use(session);
  const keepAlive = {
    startedAt: new Date().toString(),
    config,
  };
  const started = keepAlive.startedAt && config.keepAliveMs > 0;
  return started ? handler(session) : handler(session);
};

export const makeSessionConfig = (tenant: LatticeTenantId): LatticeSessionConfig => ({
  tenant,
  keepAliveMs: 10_000,
  maxStages: 20,
});
