import { chain } from '@shared/orchestration-kernel';
import type { EngineTick, EngineWorkload, RuntimeStatus } from './types';
import type { RuntimePhase } from './types';

export type TimelinePhase = Exclude<RuntimePhase, 'error' | 'idle'>;
export type TimelineTag<TPhase extends TimelinePhase = TimelinePhase> = `studio://timeline/${TPhase}`;
export type RegistryId = `${string}:registry`;
export type SessionId = `${string}:session`;

export type NoInfer<T> = [T][T extends unknown ? 0 : never];
export type AppendTuple<T extends readonly unknown[], U extends readonly unknown[]> = [...T, ...U];

export interface SchedulerInput {
  readonly workload: EngineWorkload;
  readonly tags: readonly string[];
}

export interface SchedulerOutput<TState = unknown> {
  readonly sessionId: SessionId;
  readonly state: TState;
  readonly ticks: readonly EngineTick[];
}

export interface RuntimeRegistry<TState = unknown> {
  readonly id: RegistryId;
  readonly metadata: Readonly<Record<string, string>>;
  readonly state: TState;
}

export const isComplete = (status: RuntimeStatus): status is 'finished' | 'failed' =>
  status === 'finished' || status === 'failed';

const toRegistryId = (value: string): RegistryId => `${value}:registry`;
const toSessionId = (value: string): SessionId => `${value}:session`;

export class AsyncRegistryStack {
  readonly #entries = new Map<RegistryId, RuntimeRegistry<unknown>>();
  readonly #stack = new AsyncDisposableStack();
  #active = true;

  register<TPayload>(registry: RuntimeRegistry<TPayload>): RuntimeRegistry<TPayload> {
    this.#entries.set(registry.id, registry as RuntimeRegistry<unknown>);
    return registry;
  }

  snapshot(): readonly RuntimeRegistry<unknown>[] {
    return [...this.#entries.values()];
  }

  async dispose(): Promise<void> {
    await this[Symbol.asyncDispose]();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    if (!this.#active) {
      return;
    }
    this.#active = false;
    this.#stack[Symbol.asyncDispose]();
    this.#entries.clear();
  }
}

export const makeRegistry = <TState, TPayload>(payload: TPayload): RuntimeRegistry<TState> => ({
  id: toRegistryId('studio-registry'),
  metadata: {
    source: 'orchestration-studio',
    loadedAt: new Date().toISOString(),
  },
  state: payload as unknown as TState,
});

export const normalizeRuntimeStatus = (raw: string): RuntimeStatus => {
  if (raw === 'running' || raw === 'idle' || raw === 'blocked' || raw === 'finished' || raw === 'failed') {
    return raw;
  }
  return 'idle';
};

export const emitPhasedTick = (
  phase: TimelinePhase,
  at: number,
  base: Omit<EngineTick, 'at' | 'phase'> & { readonly status?: RuntimeStatus },
): EngineTick => ({
  ...base,
  at: new Date(at).toISOString(),
  phase,
  status: base.status ?? (phase === 'observation' ? 'running' : 'finished'),
});

export const sortTicks = (ticks: readonly EngineTick[]): readonly EngineTick[] =>
  [...ticks].toSorted((left, right) => Date.parse(left.at) - Date.parse(right.at));

export const mergeTicks = <TState>(
  seed: TState,
  ticks: readonly EngineTick[],
): [TState, readonly EngineTick[]] => [seed, sortTicks(ticks)];

const parseTimelinePhase = (tag: TimelineTag<TimelinePhase>): TimelinePhase => {
  const [, phase] = tag.split('/timeline/');
  return (phase ?? 'planning') as TimelinePhase;
};

const buildPhases = (): readonly TimelineTag<TimelinePhase>[] =>
  (['planning', 'execution', 'observation', 'complete'] as const).map(
    (phase) => `studio://timeline/${phase}` as TimelineTag<TimelinePhase>,
  );

export const runScheduler = async <TState extends string>(
  input: SchedulerInput,
  buildState: (values: NoInfer<readonly string[]>) => TState,
): Promise<SchedulerOutput<TState>> => {
  const sessionId = toSessionId(input.workload.scenarioId);
  const phases = buildPhases();
  const stack = new AsyncRegistryStack();
  const keys = phases.map((phase) => toRegistryId(`${input.workload.planId}-${phase}`));
  const state = buildState(keys);
  const ticks = phases.map((phase, index) => emitPhasedTick(parseTimelinePhase(phase), Date.now() + index * 100, {
    pluginId: phase,
    metadata: {
      session: sessionId,
      registrationCount: keys.length,
      tags: input.tags,
      phaseTag: `${sessionId}:${phase}`,
    },
    status: normalizeRuntimeStatus(index % 2 ? 'running' : 'finished'),
  }));

  for (const [index, key] of keys.entries()) {
    const registry = makeRegistry<TState, { phase: TimelinePhase; key: string; order: number }>({
      phase: (phases[index] as TimelineTag<TimelinePhase>).replace('studio://timeline/', '') as TimelinePhase,
      key,
      order: index,
    });
    stack.register(registry);
  }

  const ordered = chain(stack.snapshot())
    .toArray()
    .sort((left, right) => right.id.localeCompare(left.id));

  const stateTokens = ordered
    .map((entry) => entry.id)
    .toSpliced(0, 0, ...keys);

  const [nextState, sortedTicks] = mergeTicks(state, sortTicks(ticks));
  void stateTokens;
  await stack.dispose();
  return {
    sessionId,
    state: nextState,
    ticks: sortedTicks,
  };
};
