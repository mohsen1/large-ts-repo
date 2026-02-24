import { z } from 'zod';
import {
  type PluginStage,
  type PluginConfig,
  type PluginPayload,
  type PluginHandle,
  type JsonLike,
  type HorizonSignal,
  type RunId,
  type HorizonInput,
  type IsoDatetime,
  horizonBrand,
} from '@domain/recovery-horizon-engine';
import { type JsonValue } from '@shared/type-level';
import {
  type PluginDescriptor,
  type ProfileId,
  type StageRoute,
  asProfileId,
} from './types.js';

export interface WorkspaceAdapter<TKind extends PluginStage = PluginStage, TPayload = PluginPayload> {
  readonly id: string;
  readonly stage: TKind;
  readonly priority: number;
  readonly profile: ProfileId;
  readonly label: string;
  readonly execute: PluginHandle<TKind, TPayload>;
}

export interface AdapterEvent<TKind extends PluginStage = PluginStage> {
  readonly adapterId: string;
  readonly stage: TKind;
  readonly route: StageRoute<TKind>;
  readonly accepted: number;
}

type ParsedAdapterRecord = {
  readonly adapterId: string;
  readonly stage: PluginStage;
  readonly priority: number;
  readonly profile: string;
  readonly label?: string;
};

const adapterConfigSchema = z.object({
  adapterId: z.string().min(1),
  stage: z.enum(['ingest', 'analyze', 'resolve', 'optimize', 'execute']),
  priority: z.number().nonnegative().int().max(100),
  profile: z.string().min(1),
  label: z.string().optional(),
});

export const parseAdapterConfig = (value: unknown): PluginDescriptor<PluginStage> => {
  const parsed = adapterConfigSchema.parse(value) as ParsedAdapterRecord;
  const adapterId = parsed.adapterId as string;
  return {
    id: adapterId as PluginDescriptor<PluginStage>['id'],
    stage: parsed.stage,
    name: parsed.label ?? `adapter-${adapterId}`,
    contract: {
      kind: parsed.stage,
      id: adapterId as PluginDescriptor<PluginStage>['id'],
      capabilities: [
        {
          key: parsed.stage,
          description: 'generated',
          configSchema: {},
        },
      ],
      defaults: {
        pluginKind: parsed.stage,
        payload: { adapterId },
        retryWindowMs: horizonBrand.fromTime(1200),
      },
      execute: async () => [],
    },
    route: `${parsed.stage.toUpperCase()}/${adapterId}` as StageRoute<PluginStage>,
    profile: asProfileId(parsed.profile),
  };
};

type ErasedWorkspaceAdapter = WorkspaceAdapter<PluginStage, PluginPayload>;

const asErased = <TKind extends PluginStage>(value: WorkspaceAdapter<TKind, PluginPayload>): ErasedWorkspaceAdapter =>
  value as unknown as ErasedWorkspaceAdapter;

export class AdapterRegistry<TStages extends readonly PluginStage[]> {
  #adapters = new Map<string, ErasedWorkspaceAdapter>();

  constructor(readonly stages: TStages) {}

  register<TKind extends PluginStage>(adapter: WorkspaceAdapter<TKind>): void {
    this.#adapters.set(adapter.id, asErased(adapter));
  }

  listByStage<TKind extends PluginStage>(stage: TKind): readonly WorkspaceAdapter<TKind>[] {
    return [...this.#adapters.values()]
      .filter((entry) => entry.stage === stage)
      .toSorted((left, right) => right.priority - left.priority)
      .map((entry) => entry as unknown as WorkspaceAdapter<TKind>);
  }

  listByProfile(profileId: ProfileId): readonly WorkspaceAdapter<PluginStage>[] {
    return [...this.#adapters.values()].filter((entry) => entry.profile === profileId);
  }

  list(): readonly WorkspaceAdapter<PluginStage>[] {
    return [...this.#adapters.values()].toSorted((left, right) => right.priority - left.priority);
  }

  route<TKind extends PluginStage>(stage: TKind, payload: PluginPayload): StageRoute<TKind> {
    return `${stage.toUpperCase()}/${JSON.stringify(payload).slice(0, 8)}` as StageRoute<TKind>;
  }

  async run(
    stage: PluginStage,
    payload: PluginPayload,
    runId: RunId,
    signal: AbortSignal,
  ): Promise<readonly HorizonSignal<PluginStage, JsonLike>[]> {
    const candidates = this.listByStage(stage);
    const outputs: HorizonSignal<PluginStage, JsonLike>[] = [];

    for (const [index, adapter] of candidates.entries()) {
      const records = await adapter.execute(
        [{ pluginKind: stage, payload, retryWindowMs: horizonBrand.fromTime(1200) }],
        signal,
      );

      outputs.push(
        ...records.map((entry) => ({
          ...entry,
          kind: stage,
          input: {
            ...entry.input,
            runId,
            stage,
          } as HorizonInput<PluginStage>,
          payload: horizonBrand.fromJson(entry.payload as JsonValue),
          startedAt: horizonBrand.fromDate(String(entry.startedAt)) as IsoDatetime,
          severity: entry.severity,
        })),
      );
      void index;
    }

    return outputs;
  }

  clear() {
    this.#adapters.clear();
  }
}

export const withAdapterScope = async <T>(
  registry: AdapterRegistry<readonly PluginStage[]>,
  profile: ProfileId,
  runId: string,
  work: (
    adapters: readonly WorkspaceAdapter[],
    emit: (event: AdapterEvent<PluginStage>) => void,
  ) => Promise<T>,
): Promise<T> => {
  const events = (event: AdapterEvent<PluginStage>) => {
    void event;
  };

  const scope = {
    [Symbol.asyncDispose]: async () => {
      void runId;
      registry.list().forEach((entry) => {
        void entry;
      });
    },
    [Symbol.dispose](): void {
      registry.listByProfile(profile);
    },
  };

  await using _scope = scope;
  return work(registry.list(), events);
};

export const buildFallbackAdapters = <TKind extends PluginStage>(
  stages: readonly TKind[],
): readonly WorkspaceAdapter<TKind>[] => {
  return stages.toSorted((left, right) => left.localeCompare(right)).map((stage, index) => ({
    id: `fallback-${stage}-${index}`,
    stage,
    priority: 10 + index,
    profile: asProfileId(`fallback-${stage}`),
    label: `fallback:${stage}`,
    execute: async (input, signal) => {
      if (signal.aborted) {
        throw signal.reason;
      }

      await signal.throwIfAborted();
      return input.map((entry, inner) => ({
        id: horizonBrand.fromPlanId(`fallback-${stage}-${index}-${inner}`),
        kind: stage,
        payload: {
          fallback: true,
          stage,
          value: entry.payload,
        },
        input: {
          version: '1.0.0',
          runId: horizonBrand.fromRunId(`fallback:${entry.pluginKind}:${inner}`),
          tenantId: 'tenant-001',
          stage,
          tags: ['fallback'],
          metadata: { index, stage: stage },
        },
        severity: 'low',
        startedAt: horizonBrand.fromDate(new Date().toISOString()),
      }));
    },
  }));
};
