import {
  executePluginChain,
  type CompatibleChain,
  type PluginDefinition,
} from './plugin-registry';
import { canonicalizeNamespace, type PluginNamespace } from './ids';
import { mapIterable, pairwise } from './iterator-utils';
import { PluginSession, pluginSessionConfigFrom } from './lifecycle';

type NoInfer<T> = [T][T extends any ? 0 : never];

export type Iterative<T> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...Iterative<Tail>]
  : readonly [];

export type ChainInput<TChain extends readonly PluginDefinition[]> = TChain extends readonly [
  infer Head extends PluginDefinition<infer TInput, any, any, any>,
  ...any[],
]
  ? TInput
  : never;

export type ChainOutput<TChain extends readonly PluginDefinition[]> = TChain extends readonly [...any[], infer Tail]
  ? Tail extends PluginDefinition<any, infer TOutput, any, any>
    ? TOutput
    : never
  : never;

export type ChainEventStatus = 'ok' | 'warn' | 'error' | 'pending';

export interface ChainEvent {
  readonly pluginId: string;
  readonly stage: number;
  readonly at: string;
  readonly status: ChainEventStatus;
  readonly message: string;
}

export interface ChainExecutionState<
  TChain extends readonly PluginDefinition[],
  TInput = ChainInput<TChain>,
> {
  readonly input: TInput;
  readonly output?: ChainOutput<TChain>;
  readonly ok: boolean;
  readonly traces: readonly ChainEvent[];
  readonly errors: readonly string[];
}

class StageTrace {
  readonly #events: ChainEvent[] = [];

  push(kind: 'start' | 'step' | 'fail' | 'done', status: ChainEventStatus, pluginId: string, message: string): void {
    this.#events.push({
      pluginId,
      stage: this.#events.length,
      at: new Date().toISOString(),
      status,
      message: `${kind}:${message}`,
    });
  }

  toList(): readonly ChainEvent[] {
    return [...this.#events];
  }

  static toMatrix<T>(values: readonly T[]): readonly (readonly [T, T])[] {
    return [...pairwise(values)] as readonly (readonly [T, T])[];
  }
}

const toChainRunContext = (tenantId: string, runId: string) => ({
  tenantId,
  requestId: runId,
  namespace: canonicalizeNamespace('recovery:stress:lab:runtime'),
  startedAt: new Date().toISOString(),
  config: {
    route: ['runtime', 'chain'],
  },
});

export const executeTypedChain = async <
  const TChain extends readonly PluginDefinition[],
  TInput = ChainInput<TChain>,
>(
  tenantId: string,
  chain: TChain,
  input: TInput,
): Promise<ChainExecutionState<TChain, TInput>> => {
  const runId = `run:${tenantId}:${Date.now()}`;
  const trace = new StageTrace();
  const namespace = canonicalizeNamespace('recovery:stress:lab:runtime');
  const context = toChainRunContext(tenantId, runId);

  try {
    using _scope = new PluginSession(
      pluginSessionConfigFrom(tenantId, namespace, runId),
    );

    const compatibleChain = chain as unknown as CompatibleChain<TChain> & readonly PluginDefinition[];
    const inputSeed = input as ChainInput<TChain>;
    const result = await executePluginChain<TChain, ChainInput<TChain>>(compatibleChain, context, inputSeed);

    if (!result.ok || result.value === undefined) {
      trace.push('fail', 'error', 'chain', String(result.errors?.join('|') ?? 'chain failure'));
      return {
        input,
        ok: false,
        traces: trace.toList(),
        errors: result.errors ?? ['chain-failed'],
      };
    }

    trace.push('done', 'ok', 'chain', `output:${Object.keys(result.value as Record<string, unknown>).length}`);
    return {
      input,
      output: result.value as ChainOutput<TChain>,
      ok: true,
      traces: trace.toList(),
      errors: [],
    };
  } catch (error) {
    trace.push('fail', 'error', 'chain', error instanceof Error ? error.message : String(error));
    return {
      input,
      ok: false,
      traces: trace.toList(),
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
};

export const executeTypedChainVerbose = async <
  TChain extends readonly PluginDefinition[],
  TInput extends ChainInput<TChain>,
>(tenantId: string, chain: TChain, input: TInput): Promise<ChainExecutionState<TChain, TInput>> => {
  const result = await executeTypedChain(tenantId, chain, input as NoInfer<TInput>);
  const next = mapIterable(result.traces, (entry) => entry.message);
  const details = [...next].join('\n');
  return {
    ...result,
    errors: details ? [...result.errors, details] : result.errors,
  };
};

export const auditChainSteps = async <TChain extends readonly PluginDefinition[]>(
  tenantId: string,
  chain: TChain,
  input: ChainInput<TChain>,
): Promise<readonly ChainEvent[]> => {
  const result = await executeTypedChain(tenantId, chain, input);
  const pairs = StageTrace.toMatrix(result.traces);
  return pairs.map(([left, right], index) => ({
    pluginId: `${left.pluginId}->${right.pluginId}`,
    stage: index,
    at: right.at,
    status: right.status,
    message: `${left.message} | ${right.message}`,
  }));
};

export const buildChainInputError = (seed: Record<string, unknown>): string => {
  const ordered = Object.entries(seed)
    .filter((entry) => entry[1] !== undefined)
    .map(([name, value]) => `${name}=${String(typeof value)}`)
    .toSorted();
  return ordered.join(';');
};

export const runTypedChain = async <
  TDefinitions extends readonly PluginDefinition[],
  TInput = ChainInput<TDefinitions>,
>(
  tenantId: string,
  chain: TDefinitions,
  input: TInput,
): Promise<ChainExecutionState<TDefinitions, TInput>> => {
  return executeTypedChain<TDefinitions, TInput>(tenantId, chain, input);
};

export const runWorkspace = async <
  TDefinitions extends readonly PluginDefinition[],
  TInput = ChainInput<TDefinitions>,
>(
  tenantId: string,
  chain: TDefinitions,
  input: TInput,
): Promise<ChainExecutionState<TDefinitions, TInput>> => {
  return runTypedChain<TDefinitions, TInput>(tenantId, chain, input);
};
