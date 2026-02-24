import type { NoInfer, RecursivePath } from '@shared/type-level';
import {
  type ConstraintPayload,
  type ConstraintPayloadShape,
  type ConstraintResult,
  type ConstraintSet,
  type ConstraintSpec,
  validateEnvelope,
} from './horizon-constraints.js';
import {
  type HorizonInput,
  type HorizonPlan,
  type HorizonSignal,
  type JsonLike,
  type PluginConfig,
  type PluginContract,
  type PluginStage,
  type RunId,
  type TimeMs,
  horizonBrand,
} from './types.js';
import type { NetworkBlueprint, NetworkPolicy, StageNetworkShape } from './plugin-network.js';

export type SagaStatus =
  | 'initializing'
  | 'planned'
  | 'running'
  | 'awaiting-signal'
  | 'review'
  | 'completed'
  | 'stopped';

type StageEnvelope<TPayload extends JsonLike = JsonLike> = {
  readonly kind: PluginStage;
  readonly runId: RunId;
  readonly signal: HorizonSignal<PluginStage, TPayload>;
  readonly trace: readonly PluginStage[];
};

export type StageResult = {
  readonly stage: PluginStage;
  readonly startedAt: TimeMs;
  readonly elapsedMs: TimeMs;
  readonly ok: boolean;
  readonly errors: readonly string[];
};

export type SagaEvent<TKind extends PluginStage = PluginStage> =
  | { readonly type: 'stage:start'; readonly stage: TKind; readonly at: TimeMs }
  | { readonly type: 'stage:done'; readonly stage: TKind; readonly ok: boolean; readonly at: TimeMs }
  | { readonly type: 'stage:error'; readonly stage: TKind; readonly error: string; readonly at: TimeMs };

export interface SagaRunConfig<
  TPayload extends JsonLike = JsonLike,
  TWindow extends readonly PluginStage[] = readonly PluginStage[],
> {
  readonly tenantId: string;
  readonly window: TWindow;
  readonly owner: string;
  readonly constraints: ConstraintSet<readonly ConstraintSpec[]>;
  readonly network: NetworkBlueprint<TWindow>;
  readonly policies: NetworkPolicy<TWindow>;
  readonly topology: StageNetworkShape<TWindow>;
  readonly onEvent?: (event: SagaEvent) => void;
  readonly defaults?: readonly TPayload[];
}

export interface SagaRuntimeStats {
  readonly status: SagaStatus;
  readonly startedAt: TimeMs;
  readonly endedAt?: TimeMs;
  readonly events: readonly SagaEvent[];
  readonly planCount: number;
}

class SagaScope {
  #events: SagaEvent[] = [];
  #disposed = false;

  record(event: SagaEvent): void {
    if (this.#disposed) {
      return;
    }
    this.#events = [...this.#events, event];
  }

  get events(): readonly SagaEvent[] {
    return this.#events;
  }

  [Symbol.dispose](): void {
    this.#disposed = true;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#disposed = true;
  }
}

const toPlanPayload = <TKind extends PluginStage>(
  contract: PluginContract<TKind, PluginConfig<TKind, JsonLike>, JsonLike>,
): readonly TKind[] =>
  [contract.kind];

export class HorizonSaga<
  TPayload extends JsonLike = JsonLike,
  TWindow extends readonly PluginStage[] = readonly PluginStage[],
> {
  readonly #plan: HorizonPlan<PluginStage>;
  readonly #config: SagaRunConfig<TPayload, TWindow>;
  readonly #contracts: readonly PluginContract<PluginStage, PluginConfig<PluginStage, JsonLike>, JsonLike>[];
  readonly #runId: RunId;
  #status: SagaStatus = 'initializing';
  readonly #envelopes = new Map<PluginStage, StageEnvelope<TPayload>[]>();

  constructor(
    plan: HorizonPlan<PluginStage>,
    config: SagaRunConfig<TPayload, TWindow>,
    contracts: readonly PluginContract<PluginStage, PluginConfig<PluginStage, JsonLike>, JsonLike>[],
  ) {
    this.#plan = plan;
    this.#config = config;
    this.#contracts = contracts;
    this.#runId = plan.id as unknown as RunId;
  }

  get plan() {
    return this.#plan;
  }

  get status() {
    return this.#status;
  }

  get runId() {
    return this.#runId;
  }

  private seedEnvelopes(signal: HorizonSignal<PluginStage, TPayload>): readonly StageEnvelope<TPayload>[] {
    return this.#config.window.map((stage) => ({
      kind: stage,
      runId: this.#runId,
      signal,
      trace: [stage],
    }));
  }

  async run(signal: HorizonSignal<PluginStage, TPayload>): Promise<{
    readonly stats: SagaRuntimeStats;
    readonly outcomes: readonly StageResult[];
  }> {
    const startedAt = horizonBrand.fromTime(Date.now()) as TimeMs;
    const scope = new SagaScope();
    const outputs: StageResult[] = [];
    const stages = this.#config.window;
    const envelopes = this.seedEnvelopes(signal);

    for (const [index, stage] of stages.entries()) {
      const contract = this.#contracts.find((entry) => entry.kind === stage);
      if (!contract) {
        const error = `missing contract ${stage}`;
        scope.record({ type: 'stage:error', stage, error, at: horizonBrand.fromTime(Date.now()) });
        this.#status = 'stopped';
        return {
          stats: {
            status: this.#status,
            startedAt,
            endedAt: horizonBrand.fromTime(Date.now()),
            events: scope.events,
            planCount: stages.length,
          },
          outcomes: [...outputs],
        };
      }

      const candidates = envelopes.filter((entry) => entry.kind === stage);
      const envelope = candidates[0];
      if (!envelope) {
        const error = 'missing envelope';
        scope.record({ type: 'stage:error', stage, error, at: horizonBrand.fromTime(Date.now()) });
        outputs.push({
          stage,
          startedAt: horizonBrand.fromTime(Date.now()),
          elapsedMs: horizonBrand.fromTime(0),
          ok: false,
          errors: [error],
        });
        this.#status = 'stopped';
        break;
      }

      this.#status = 'running';
      scope.record({ type: 'stage:start', stage, at: horizonBrand.fromTime(Date.now()) });

      const validation = validateEnvelope(
        {
          stage,
          input: {
            version: '1.0.0',
            runId: this.#runId,
            tenantId: this.#config.tenantId,
            stage,
            tags: [this.#config.owner, String(index), ...toPlanPayload(contract)],
            metadata: {
              topology: this.#config.network.tenantId,
            },
          } satisfies HorizonInput<PluginStage>,
          signal: envelope.signal,
        },
        this.#config.constraints.entries,
      );
      if (!validation.ok) {
        const error = validation.errors[0]?.message ?? 'constraint failure';
        scope.record({ type: 'stage:error', stage, error, at: horizonBrand.fromTime(Date.now()) });
        outputs.push({
          stage,
          startedAt,
          elapsedMs: horizonBrand.fromTime(0),
          ok: false,
          errors: validation.errors.map((entry) => String(entry.code)),
        });
        this.#status = 'review';
        break;
      }

      const [candidate] = await contract.execute(
        [
          {
            pluginKind: stage,
            payload: envelope.signal.payload,
            retryWindowMs: horizonBrand.fromTime(250),
          },
        ],
        new AbortController().signal,
      ) as readonly HorizonSignal<PluginStage, JsonLike>[];

      this.#envelopes.set(stage, [
        {
          kind: stage,
          runId: this.#runId,
          signal: candidate as HorizonSignal<PluginStage, TPayload>,
          trace: [...envelope.trace, stage],
        },
      ]);

      scope.record({ type: 'stage:done', stage, ok: true, at: horizonBrand.fromTime(Date.now()) });
      const emitted = candidate ? 1 : 0;
      outputs.push({
        stage,
        startedAt,
        elapsedMs: horizonBrand.fromTime(Math.max(1, emitted)),
        ok: true,
        errors: [],
      });
      this.#status = index + 1 < stages.length ? 'awaiting-signal' : 'review';
      this.#config.onEvent?.(scope.events[scope.events.length - 1]);
    }

    const endedAt = horizonBrand.fromTime(Date.now());
    if (this.#status !== 'review' && this.#status !== 'stopped') {
      this.#status = 'completed';
    }

    return {
      stats: {
        status: this.#status,
        startedAt,
        endedAt,
        events: scope.events,
        planCount: this.#config.window.length,
      },
      outcomes: outputs,
    };
  }
}

const toConstraintId = (value: string): ConstraintPayload<never>['code'] =>
  `constraint:${value}` as ConstraintPayload<never>['code'];

export const withSaga = async <
  TPayload extends JsonLike,
  TWindow extends readonly PluginStage[] = readonly PluginStage[],
>(
  plan: HorizonPlan<PluginStage>,
  config: SagaRunConfig<TPayload, TWindow>,
  contracts: NoInfer<readonly PluginContract<PluginStage, PluginConfig<PluginStage, JsonLike>, JsonLike>[]>,
  signal: HorizonSignal<PluginStage, TPayload>,
): Promise<ConstraintResult<{
  readonly stats: SagaRuntimeStats;
  readonly outcomes: readonly StageResult[];
}>> => {
  const saga = new HorizonSaga(plan, config, contracts);
  const result = await saga.run(signal);

  if (!result.outcomes.length) {
  const runtimePayload = {
      stage: saga.plan.pluginSpan.stage,
      code: 'saga-no-outcomes',
      tags: ['saga', 'pipeline'],
      path: 'stage' as RecursivePath<ConstraintPayloadShape>,
    } satisfies ConstraintPayload<'saga-no-outcomes'>;

    return {
      ok: false,
      errors: [{
        id: toConstraintId(`saga:${signal.id}`),
        code: 'saga-no-outcomes',
        level: 'strict',
        message: 'No outcomes generated for saga run',
        payload: runtimePayload,
        context: {
          tenantId: config.tenantId,
          runId: saga.runId,
          stage: saga.plan.pluginSpan.stage,
          issuedAt: horizonBrand.fromTime(Date.now()),
        },
      }],
    };
  }

  return { ok: true, value: result };
};

export const buildSagaNetwork = <TWindow extends readonly PluginStage[]>(
  topology: StageNetworkShape<TWindow>,
): StageNetworkShape<TWindow> => ({
  ...topology,
  nodes: topology.nodes as StageNetworkShape<TWindow>['nodes'],
  edges: [...topology.edges],
});
