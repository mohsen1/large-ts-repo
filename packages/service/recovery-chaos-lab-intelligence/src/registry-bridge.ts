import { asNamespace, asSimulationId, type ChaosRunToken } from '@domain/recovery-chaos-sim-models';
import { fail, ok, type Result } from '@shared/result';
import type {
  PluginExecutionContext,
  RegistryEntry,
  ChaosSimulationRegistry,
  RegistryId,
  PluginPriority
} from '@domain/recovery-chaos-sim-models';

export interface PluginDescriptor<TPayload = unknown, TOutput = unknown> {
  readonly id: string;
  readonly namespace: string;
  readonly simulationId: string;
  readonly pluginName: string;
  readonly priority: PluginPriority;
  readonly capabilities: readonly string[];
  readonly run: (payload: TPayload, context: PluginExecutionContext) => Promise<TOutput>;
}

export interface BoundPlugin<TPayload = unknown, TOutput = unknown> {
  readonly pluginName: string;
  readonly execute: (payload: TPayload) => Promise<Result<TOutput, Error>>;
}

export function adaptPlugin<TPayload = unknown, TOutput = unknown>(
  descriptor: PluginDescriptor<TPayload, TOutput>
): RegistryEntry<string, TPayload, TOutput> {
  return {
    id: `${descriptor.namespace}:${descriptor.pluginName}`,
    pluginName: descriptor.pluginName,
    namespace: asNamespace(descriptor.namespace),
    simulationId: asSimulationId(descriptor.simulationId),
    payload: descriptor as unknown as TPayload,
    outputType: undefined as unknown as TOutput,
    capabilities: descriptor.capabilities,
    priority: descriptor.priority
  };
}

export function bindPluginRegistry<TItems extends readonly RegistryEntry<string, unknown, unknown>[]>() {
  return (registry: ChaosSimulationRegistry<TItems>, descriptors: readonly PluginDescriptor<unknown, unknown>[]): Result<ChaosSimulationRegistry<TItems>, Error> => {
    try {
      for (const descriptor of descriptors) {
        const entry = adaptPlugin(descriptor);
        registry.register(entry, {
          execute: async (payload: unknown) => {
            const output = await descriptor.run(payload as never, {
              namespace: asNamespace(descriptor.namespace),
              runId: `${descriptor.simulationId}:${Date.now()}` as ChaosRunToken,
              startedAt: Date.now()
            } as PluginExecutionContext);
            return ok(output as never);
          }
        } as never);
      }

      return ok(registry);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('plugin binding failed'));
    }
  };
}

export function makeRegistryId(namespace: string, simulationId: string): RegistryId {
  return `${namespace}:${simulationId}` as RegistryId;
}
