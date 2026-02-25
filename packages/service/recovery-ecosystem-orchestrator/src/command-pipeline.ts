import { createInMemoryStore, type EcosystemStorePort } from '@data/recovery-ecosystem-store';
import {
  asHealthScore,
  asPolicyId,
  asRunId,
  asTenantId,
  composeNamespace,
  type EcosystemPlan,
  type LifecyclePhase,
  type PolicyMap,
  type PolicyId,
  type RecoveryRun,
  type StageId,
  withDefaultPlan,
} from '@domain/recovery-ecosystem-core';
import { fail, ok, type Result } from '@shared/result';
import type { JsonValue } from '@shared/type-level';
import type { PluginDependency } from '@shared/typed-orchestration-core';
import { DurableAdapter, asSignal, createAdapter, type AdapterConfig } from './adapters';

export interface PipelineStep {
  readonly stage: `plugin:${string}`;
  readonly dependencies: readonly PluginDependency[];
  readonly timeoutMs: number;
}

export interface PipelineInput {
  readonly tenantId: string;
  readonly namespace: string;
  readonly policyIds: readonly string[];
  readonly dryRun?: boolean;
}

export interface PipelineResult {
  readonly runId: ReturnType<typeof asRunId>;
  readonly namespace: string;
  phase: LifecyclePhase;
  readonly stageCount: number;
  readonly policyCount: number;
  score: ReturnType<typeof asHealthScore>;
  summary: string;
}

export interface PipelineExecution {
  readonly run: RecoveryRun;
  readonly result: PipelineResult;
  readonly events: readonly { readonly at: string; readonly stage: string; readonly phase: LifecyclePhase }[];
}

export type PipelineDiagnostics<TValues extends readonly string[]> = {
  readonly keys: TValues;
  readonly size: TValues['length'];
};

type AsyncScope = {
  [Symbol.asyncDispose](): Promise<void>;
  track?<TScope extends AsyncScope>(scope: TScope): TScope;
};
type AsyncScopeLike = {
  new (): AsyncScope;
};

const AsyncScopeCtor: AsyncScopeLike =
  (globalThis as { AsyncDisposableStack?: AsyncScopeLike }).AsyncDisposableStack ??
  (class {
    readonly #resources: AsyncScope[] = [];

    public track<TScope extends AsyncScope>(scope: TScope): TScope {
      this.#resources.push(scope);
      return scope;
    }

    public async [Symbol.asyncDispose](): Promise<void> {
      for (const scope of this.#resources) {
        await scope[Symbol.asyncDispose]();
      }
      this.#resources.length = 0;
    }
  } as never);

class PipelineScope {
  readonly #runId: ReturnType<typeof asRunId>;
  readonly #startedAt = new Date().toISOString();

  public constructor(runId: ReturnType<typeof asRunId>) {
    this.#runId = runId;
  }

  public [Symbol.asyncDispose](): Promise<void> {
    return Promise.resolve();
  }

  public digest(): string {
    return `${this.#runId}:${this.#startedAt}`;
  }
}

const buildTimelineEvent = (
  runId: ReturnType<typeof asRunId>,
  phase: LifecyclePhase,
  stage: string,
  index: number,
): PipelineExecution['events'][number] => ({
  at: new Date().toISOString(),
  stage: `${runId}:${stage}:${index}`,
  phase,
});

const buildPlanManifest = (policyIds: readonly string[]): PolicyMap<readonly PolicyId[]> => {
  return Object.fromEntries(
    policyIds.map((policy) => [asPolicyId(policy), { enabled: true, policy: asPolicyId(policy) }]),
  ) as PolicyMap<readonly PolicyId[]>;
};

class PipelineRegistry {
  readonly #cache = new Map<string, EcosystemPlan>();

  public get(tenant: string, namespace: string): EcosystemPlan {
    const key = `${tenant}::${namespace}`;
    const cached = this.#cache.get(key);
    if (cached) {
      return cached;
    }
    const plan = withDefaultPlan(asTenantId(tenant), composeNamespace('namespace', namespace));
    this.#cache.set(key, plan);
    return plan;
  }

  public flush(): void {
    this.#cache.clear();
  }
}

export class CommandPipeline {
  readonly #store: EcosystemStorePort;
  readonly #adapter: DurableAdapter;
  readonly #registry = new PipelineRegistry();
  readonly #steps: readonly PipelineStep[];

  public constructor(store: EcosystemStorePort = createInMemoryStore(), config?: Partial<AdapterConfig>) {
    this.#store = store;
    this.#adapter = createAdapter('recovery-ecosystem-command-pipeline', config?.timeoutMs ?? 16);
    this.#steps = [
      { stage: 'plugin:resolve', dependencies: [], timeoutMs: 32 },
      { stage: 'plugin:prepare', dependencies: ['plugin:resolve'], timeoutMs: 42 },
      { stage: 'plugin:invoke', dependencies: ['plugin:prepare'], timeoutMs: 128 },
      { stage: 'plugin:verify', dependencies: ['plugin:invoke'], timeoutMs: 32 },
      { stage: 'plugin:seal', dependencies: ['plugin:verify'], timeoutMs: 32 },
    ] as const;
  }

  public async run(input: PipelineInput): Promise<Result<PipelineExecution>> {
    const namespace = composeNamespace('namespace', input.namespace);
    const tenant = asTenantId(input.tenantId);
    const plan = this.#registry.get(input.tenantId, input.namespace);
    const manifest = buildPlanManifest(plan.policyIds as unknown as readonly string[]);

    const runId = asRunId(`${tenant}:${Date.now()}`);
    const result: PipelineResult = {
      runId,
      namespace: input.namespace,
      phase: 'queued',
      stageCount: this.#steps.length,
      policyCount: plan.policyIds.length,
      score: asHealthScore(100),
      summary: `namespace:${namespace}:policies:${Object.keys(manifest).length}`,
    };

    const events: Array<PipelineExecution['events'][number]> = [];
    const scope = new PipelineScope(runId);

    const executeStep = async (step: PipelineStep, phase: LifecyclePhase, index: number): Promise<void> => {
      await this.#store.save({
        runId,
        tenant,
        namespace,
        payload: {
          runId,
          policyMap: manifest,
          stage: step.stage,
          phase,
          step: index,
          timeoutMs: step.timeoutMs,
          timestamp: new Date().toISOString(),
        } as JsonValue,
        generatedAt: new Date().toISOString(),
      });
      await this.#store.append({
        namespace,
        runId,
        tenant,
        stageId: step.stage.replace('plugin:', 'stage:') as StageId,
        event: `event:${phase}`,
        at: new Date().toISOString(),
        payload: {
          dependencies: [...step.dependencies] as JsonValue,
          timeoutMs: step.timeoutMs,
          inputPolicyCount: plan.policyIds.length,
        },
      });
      events.push(buildTimelineEvent(runId, phase, step.stage, index));
    };

    const adapterOpen = await this.#adapter.open(runId);
    if (!adapterOpen.ok) {
      return fail(new Error('adapter-open-failed'), 'adapter');
    }

    await using stack = new AsyncScopeCtor();
    await using _ignored = scope;
    stack.track?.(scope);

    for (const [index, step] of this.#steps.entries()) {
      const phase = step.stage.includes('seal') ? 'completed' : index === 0 ? 'preflight' : index % 2 === 0 ? 'running' : 'queued';
      try {
        await executeStep(step, phase, index);
      } catch (error) {
        await this.#adapter.signal(runId, asSignal('run-failed'), {
          stage: step.stage,
          error: String(error),
        });
        result.phase = 'aborted';
        result.summary = `failed:${step.stage}`;
        await this.#adapter.close(runId);
        return fail(new Error('pipeline-step-failed'), 'pipeline');
      }
    }

    result.phase = 'completed';
    result.score = asHealthScore(Math.max(0, 60 + this.#steps.length * 8));
    result.summary = `completed:${phasePayload(8).stage}`;

    const run: RecoveryRun = {
      id: runId,
      tenant,
      namespace,
      plan,
      phase: result.phase,
      policyMode: input.dryRun ? 'quarantine' : 'mandatory',
      snapshots: [],
      records: [],
      warnings: ['pipeline', scope.digest(), ...Object.keys(manifest)] as never,
    } as RecoveryRun;

    const signal = {
      stageCount: this.#steps.length,
      dryRun: Boolean(input.dryRun),
    } as const;

    await this.#adapter.signal(runId, asSignal('run-complete'), {
      tracker: scope.digest(),
      ...signal,
    });
    await this.#adapter.close(runId);

    return ok({
      run,
      result,
      events,
    });
  }

  public async status(runId: string): Promise<boolean> {
    const parsed = asRunId(runId);
    await this.#store.load(parsed);
    return true;
  }

  public withStore<T>(handler: (store: EcosystemStorePort) => Promise<T>): Promise<T> {
    return handler(this.#store);
  }

  public reset(): void {
    this.#registry.flush();
  }
}

const phasePayload = (index: number): {
  readonly stage: `plugin:${string}`;
  readonly index: number;
} =>
  ({
    stage: 'plugin:complete',
    index,
  }) as const;

export const createPipeline = (store?: EcosystemStorePort, config?: Partial<AdapterConfig>): CommandPipeline =>
  new CommandPipeline(store, config);

export const summarizeKeys = <TValues extends readonly string[]>(values: TValues): PipelineDiagnostics<TValues> => ({
  keys: values,
  size: values.length,
});
