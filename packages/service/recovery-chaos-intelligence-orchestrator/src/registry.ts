import type { StageBoundary, ChaosStatus } from '@domain/recovery-chaos-lab';
import { type Result, fail, ok } from '@shared/result';
import type { PluginAdapter, RegistryLike } from '@service/recovery-chaos-orchestrator';

export interface RegistrySignal<T extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly runId: string;
  readonly stageCount: number;
  readonly statusByStage: Readonly<Record<T[number]['name'], ChaosStatus>>;
}

export interface RegistryEnvelope<T extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly registry: RegistryLike<T>;
  readonly createdAt: number;
  readonly tags: readonly string[];
}

export type RegistryMutation<T extends readonly StageBoundary<string, unknown, unknown>[]> =
  | { readonly kind: 'bind'; readonly name: T[number]['name']; readonly status: ChaosStatus }
  | { readonly kind: 'rebind'; readonly name: T[number]['name'] };

type RegistryStage<T extends readonly StageBoundary<string, unknown, unknown>[], TName extends T[number]['name']> = Extract<
  T[number],
  { name: TName }
>;

export class RuntimeRegistryHub<T extends readonly StageBoundary<string, unknown, unknown>[]> implements Iterable<RegistrySignal<T>> {
  readonly #createdAt = Date.now();
  readonly #seen = new Map<string, RegistrySignal<T>>();
  readonly #registry: RegistryLike<T>;
  readonly #tags = new Set<string>();

  constructor(registry: RegistryLike<T>) {
    this.#registry = registry;
    this.#tags.add('chaos');
    this.#tags.add('runtime');
  }

  attach(tag: string): void {
    this.#tags.add(tag);
  }

  observe(name: T[number]['name'], status: ChaosStatus): Result<void> {
    const key = String(name);
    const current = this.#seen.get(key);
    if (current) {
      this.#seen.set(key, {
        ...current,
        statusByStage: {
          ...current.statusByStage,
          [name]: status
        }
      });
      return ok(undefined);
    }
    this.#seen.set(key, {
      runId: `runtime:${key}`,
      stageCount: 1,
      statusByStage: { [name]: status } as Readonly<Record<T[number]['name'], ChaosStatus>>
    });
    return ok(undefined);
  }

  mutate(name: T[number]['name'], mutation: RegistryMutation<T>): Result<void> {
    this.#tags.add(mutation.kind);
    if (mutation.kind === 'bind') {
      this.#seen.set(String(name), {
        runId: `runtime:${String(name)}`,
        stageCount: this.#seen.size + 1,
        statusByStage: {
          ...((this.#seen.get(String(name))?.statusByStage) ?? {}),
          [name]: mutation.kind === 'bind' ? (mutation.status as ChaosStatus) : 'active'
        } as Readonly<Record<T[number]['name'], ChaosStatus>>
      });
      return ok(undefined);
    }

    if (mutation.kind === 'rebind') {
      this.#seen.set(String(name), {
        runId: `runtime:${String(name)}`,
        stageCount: this.#seen.size + 1,
        statusByStage: {
          ...((this.#seen.get(String(name))?.statusByStage) ?? {}),
          [name]: 'active'
        } as Readonly<Record<T[number]['name'], ChaosStatus>>
      });
      return ok(undefined);
    }

    return fail(new Error('unsupported mutation'));
  }

  get<Name extends T[number]['name']>(name: Name): Result<PluginAdapter<RegistryStage<T, Name>>> {
    const adapter = this.#registry.get(name);
    if (!adapter) {
      return fail(new Error(`plugin ${String(name)} missing`));
    }
    return ok(adapter as PluginAdapter<RegistryStage<T, Name>>);
  }

  entries(): readonly RegistrySignal<T>[] {
    return [...this.#seen.values()];
  }

  toEnvelope(): RegistryEnvelope<T> {
    return {
      registry: this.#registry,
      createdAt: this.#createdAt,
      tags: [...this.#tags]
    };
  }

  readout(): readonly RegistrySignal<T>[] {
    return this.entries();
  }

  [Symbol.iterator](): IterableIterator<RegistrySignal<T>> {
    return this.readout().values();
  }
}
