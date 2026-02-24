import { useMemo } from 'react';
import type { StageBoundary } from '@domain/recovery-chaos-lab';
import type { RunContext } from '@service/recovery-chaos-orchestrator';
import type { RegistryLike } from '@service/recovery-chaos-orchestrator';
import { ok } from '@shared/result';

type StageByName<T extends readonly StageBoundary<string, unknown, unknown>[], TName extends T[number]['name']> = Extract<
  T[number],
  { readonly name: TName }
>;

export interface PluginFactoryInput<T extends StageBoundary<string, unknown, unknown>> {
  readonly stage: T['name'];
  readonly execute: (input: T['input']) => Promise<T['output']>;
}

export interface PluginRegistryState<T extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly registry: RegistryLike<T>;
}

export interface StageOutcome {
  readonly stage: string;
  readonly latencyMs: number;
  readonly tags: readonly string[];
}

export function useChaosPluginRegistry<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  factories: ReadonlyArray<PluginFactoryInput<T[number]>>
): PluginRegistryState<T> {
  const registry = useMemo<RegistryLike<T>>(() => {
    const backing = new Map<string, (input: unknown, context: RunContext) => Promise<unknown>>();

    for (const factory of factories) {
      backing.set(String(factory.stage), async (input) => {
        const value = await factory.execute(input as never);
        return value;
      });
    }

    return {
      get(name) {
        const handler = backing.get(String(name));
        if (!handler) {
          return undefined;
        }

        return {
          plugin: name,
          execute: async (input: StageByName<T, typeof name>['input'], _context: RunContext) => {
            const value = (await handler(input, _context)) as unknown;
            return ok(value as StageByName<T, typeof name>['output']);
          }
        } as never;
      }
    };
  }, [factories]);

  return { registry };
}

export function usePluginHealth<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  stages: T
): readonly StageOutcome[] {
  return stages.map((stage) => ({
    stage: stage.name,
    latencyMs: Math.max(1, ((stage.weight ?? 1) * 42)),
    tags: ['default', String(stage.name).includes(':') ? 'mapped' : 'flat']
  }));
}
