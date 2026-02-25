import { normalizeRuntimeStatus, type SchedulerInput } from './scheduler';
import { bootstrapEngine, OrchestrationStudioEngine } from './engine';
import type { RecoveryRunbook } from '@domain/recovery-orchestration-design';
import type { EngineTick } from './types';
import { type TelemetryEnvelope, type TelemetryPoint } from './telemetry';
import { withBrand } from '@shared/core';

export type AdapterId<TName extends string = string> = `adapter:${TName}`;
export type AdapterStatus = 'idle' | 'attached' | 'detached' | 'failed';
export type AdapterMode = 'read' | 'write' | 'observe';

export interface AdapterRecord {
  readonly id: AdapterId<string>;
  readonly mode: AdapterMode;
  readonly namespace: string;
  readonly enabled: boolean;
}

export interface AdapterContext {
  readonly id: AdapterId<string>;
  readonly runbook: RecoveryRunbook;
  readonly namespace: string;
  readonly startedAt: string;
}

export interface AdapterRunInput {
  readonly runbook: RecoveryRunbook;
  readonly namespace: string;
}

export type AdapterRunOutput = {
  readonly status: AdapterStatus;
  readonly ticks: readonly EngineTick[];
  readonly runId: string;
};

export type AdapterResolver<TOutput> = (input: AdapterRunInput) => Promise<TOutput>;

export type AdapterDefinition<TOutput = unknown, TId extends AdapterId<string> = AdapterId<string>> = {
  readonly id: TId;
  readonly mode: AdapterMode;
  readonly namespace: string;
  readonly dependsOn: readonly AdapterId<string>[];
  readonly resolve: AdapterResolver<TOutput>;
};

export type AdapterMap<TDefs extends readonly AdapterDefinition[]> = {
  [Def in TDefs[number] as Def['id']]: Def['mode'];
};

export type AdapterOutput<TDefs extends readonly AdapterDefinition[]> = {
  [Def in TDefs[number] as Def['id']]: ReturnType<Def['resolve']>;
};

export type AdapterResult<TDefs extends readonly AdapterDefinition[]> = {
  [K in keyof AdapterOutput<TDefs>]: Awaited<AdapterOutput<TDefs>[K]>;
};

const toAdapterId = (value: string): AdapterId<string> => `adapter:${value}` as AdapterId<string>;

export class AdapterRegistry<TDefs extends readonly AdapterDefinition[]> {
  readonly #definitions: TDefs;
  readonly #engine: OrchestrationStudioEngine;

  public constructor(definitions: TDefs, config?: Parameters<typeof bootstrapEngine>[0]) {
    this.#definitions = definitions;
    this.#engine = bootstrapEngine(config);
  }

  public ids(): readonly AdapterId[] {
    return this.#definitions.map((entry) => entry.id);
  }

  public byNamespace(namespace: string): readonly AdapterDefinition[] {
    return this.#definitions.filter((entry) => entry.namespace === namespace);
  }

  public has(id: AdapterId): boolean {
    return this.#definitions.some((entry) => entry.id === id);
  }

  public async attach<TNamespace extends string>(
    namespace: TNamespace,
    runbook: RecoveryRunbook,
  ): Promise<AdapterResult<TDefs>> {
    const attached = this.byNamespace(namespace) as TDefs;
    const context: AdapterContext = {
      id: toAdapterId(namespace),
      runbook,
      namespace,
      startedAt: new Date().toISOString(),
    };

    const ordered = attached
      .filter((entry) => entry.mode !== 'read')
      .map((entry) => entry.id);

    const iterator = this.#engine.run({ runbook });
    const ticks: EngineTick[] = [];

    try {
      for await (const tick of iterator) {
        ticks.push({ ...tick, metadata: { ...tick.metadata, adapterNamespace: namespace } });
      }

      const byId = attached.reduce<Record<string, AdapterRunOutput>>((memo, entry, index) => {
        memo[entry.id] = {
          status: entry.mode === 'observe' ? 'detached' : ordered.includes(entry.id) ? 'attached' : 'idle',
          ticks,
          runId: `${context.id}:${index}:${Date.now().toString(36)}`,
        };
        return memo;
      }, {});

      return byId as AdapterResult<TDefs>;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const failed = attached.reduce<Record<string, AdapterRunOutput>>((memo, entry) => {
        memo[entry.id] = { status: 'failed', ticks: [], runId: `${context.id}:failed:${reason}` };
        return memo;
      }, {});
      return failed as AdapterResult<TDefs>;
    }
  }
}

export const buildAdapterRecord = <TId extends AdapterId>(
  id: TId,
  mode: AdapterMode,
): AdapterRecord => ({
  id,
  mode,
  namespace: id,
  enabled: true,
});

export const ensureAdapterOrder = <TDefs extends readonly AdapterDefinition[]>(
  input: TDefs,
): TDefs => {
  const seen = new Set<AdapterId>();
  for (const entry of input) {
    if (seen.has(entry.id)) {
      throw new Error(`duplicate-adapter:${entry.id}`);
    }
    seen.add(entry.id);
  }
  return input;
};

export const telemetryFromDefinition = <TDefs extends readonly AdapterDefinition[]>(
  definitions: TDefs,
): ReadonlyMap<AdapterId, AdapterDefinition> => {
  const map = new Map<AdapterId, AdapterDefinition>();
  for (const definition of definitions) {
    map.set(definition.id, definition);
  }
  return map;
};

export const attachAdapters = async <TDefs extends readonly AdapterDefinition[]>(
  definitions: TDefs,
  namespace: string,
  runbook: RecoveryRunbook,
): Promise<AdapterResult<TDefs>> => {
  const registry = new AdapterRegistry(definitions);
  return registry.attach(namespace, runbook);
};

export const toTelemetryEnvelope = (tick: EngineTick): TelemetryEnvelope =>
  ({
    channel: `studio.${tick.phase}`,
    point: {
      at: Date.parse(tick.at),
      phase: tick.phase,
      status: normalizeRuntimeStatus(tick.status),
      plugin: tick.pluginId,
      details: tick.metadata,
    } as TelemetryPoint,
  }) as TelemetryEnvelope;

export const normalizeAdapterStatus = (value: string): AdapterStatus =>
  value === 'idle' || value === 'attached' || value === 'detached' || value === 'failed' ? value : 'idle';

export const adapterSchedulerInput = (runbook: RecoveryRunbook): SchedulerInput => {
  return {
    workload: {
      workspace: withBrand(runbook.workspace, 'EngineWorkspaceId'),
      planId: withBrand(`adapter:${runbook.scenarioId}`, 'WorkloadPlanId'),
      scenarioId: withBrand(runbook.scenarioId, 'WorkloadScenarioId'),
      requestedAt: new Date().toISOString(),
    },
    tags: [`adapter:${runbook.scenarioId}`, 'studio'],
  };
};
