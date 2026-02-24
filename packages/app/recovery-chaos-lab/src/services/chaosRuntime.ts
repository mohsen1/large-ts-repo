import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import {
  asNamespace,
  asScenarioId,
  type ChaosScenarioDefinition,
  type StageBoundary,
  resolveSeedBlueprint
} from '@domain/recovery-chaos-lab';
import {
  runChaosScenario,
  streamChaosScenario,
  type ChaosRunEvent,
  type ChaosRunReport,
  type RegistryLike,
  type ChaosSchedulerOptions
} from '@service/recovery-chaos-orchestrator';

export interface ChaosLabTemplate<T extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly scenarioId: string;
  readonly namespace: string;
  readonly stages: T;
  readonly metadata?: Record<string, string>;
}

export interface ChaosLabSessionConfig {
  readonly scenarioId: string;
  readonly namespace: string;
  readonly options?: ChaosSchedulerOptions;
}

export interface ChaosLabSessionResult<T extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly events: readonly ChaosRunEvent[];
  readonly report: ChaosRunReport<T>;
}

export const runtimeCatalog = [
  {
    id: 'chaos-lab::default',
    namespace: 'platform-chaos',
    metadata: { tier: 'control' }
  },
  {
    id: 'chaos-lab::drain',
    namespace: 'compute-chaos',
    metadata: { tier: 'targeted' }
  }
] as const;

export function catalogDigest(): readonly string[] {
  return runtimeCatalog.map((item) => `${item.namespace}/${item.id}`);
}

interface SeedBlueprint {
  readonly namespace: ReturnType<typeof asNamespace>;
  readonly scenarioId: ReturnType<typeof asScenarioId>;
  readonly title: string;
  readonly stages: readonly StageBoundary<string, unknown, unknown>[];
}

export async function loadBlueprint(
  namespace: string,
  scenarioId: string
): Promise<ChaosScenarioDefinition & { stages: readonly StageBoundary<string, unknown, unknown>[] }> {
  const selected = await resolveSeedBlueprint(asNamespace(namespace), asScenarioId(scenarioId), {
    plugins: ['latency-loom', 'packet-fuzz', 'node-vacuum']
  });

  if (!selected) {
    throw new Error(`Cannot load scenario ${namespace}/${scenarioId}`);
  }

  const seeded = selected as SeedBlueprint;
  return {
    namespace: seeded.namespace,
    id: seeded.scenarioId,
    title: seeded.title,
    version: '1.0.0',
    stages: selected.stages,
    createdAt: Date.now() as never
  };
}

export function buildRuntimeScope<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  scenario: ChaosScenarioDefinition & { stages: T },
  registry: ServiceRegistryLike<T>
): RuntimeSession<T> {
  return {
    scenario,
    registry,
    async run(options: ChaosSchedulerOptions = {}) {
      return runChaosScenario(scenario.namespace, scenario, registry, options);
    }
  };
}

export interface RuntimeSession<T extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly scenario: ChaosScenarioDefinition & { stages: T };
  readonly registry: ServiceRegistryLike<T>;
  readonly run: (options?: ChaosSchedulerOptions) => Promise<ChaosRunReport<T>>;
}

type ServiceRegistryLike<T extends readonly StageBoundary<string, unknown, unknown>[]> = RegistryLike<T>;

export type RegistryFactoryMap<T extends readonly StageBoundary<string, unknown, unknown>[]> = {
  [K in T[number]['name']]: (
    input: Extract<T[number], { name: K }>['input'],
    context: {
      namespace: string;
      scenarioId: string;
      runId: string;
      signal?: AbortSignal;
    }
  ) => Promise<Result<Extract<T[number], { name: K }>['output']>>;
};

export function createRegistryFromPlugins<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  blueprint: ChaosLabTemplate<T>,
  pluginMap: RegistryFactoryMap<T>
): ServiceRegistryLike<T> {
  const backing = new Map<string, (input: unknown, context: { namespace: string; scenarioId: string; runId: string; signal?: AbortSignal }) => Promise<Result<unknown>>>();

  for (const stage of blueprint.stages) {
    const execute = (pluginMap as RegistryFactoryMap<T>)[stage.name as T[number]['name']];
    if (execute) {
      backing.set(
        stage.name,
        (input, context) => execute(input as never, context as never) as Promise<Result<unknown>>
      );
    }
  }

  return {
    get(name) {
      const execute = backing.get(name as string);
      if (!execute) {
        return undefined;
      }
      return {
        plugin: name,
        execute: async (
          input: unknown,
          context: {
            namespace: string;
            scenarioId: string;
            runId: string;
            signal?: AbortSignal;
          }
        ) => {
          try {
            const result = await execute(input, context as never);
            return result.ok
              ? ok(result.value)
              : fail(result.error as Error);
          } catch (error) {
            return fail(error as Error);
          }
        }
      } as never;
    }
  };
}

export async function runChaosSession<T extends readonly StageBoundary<string, unknown, unknown>[]>(
  session: RuntimeSession<T>,
  options: ChaosSchedulerOptions = {}
): Promise<ChaosLabSessionResult<T>> {
  const streamResult = await streamChaosScenario(session.scenario.namespace, session.scenario, session.registry, options);
  return {
    events: streamResult.events,
    report: streamResult.report
  };
}
