import type { PluginStage, PluginContract, PluginConfig, PluginPayload } from '@domain/recovery-horizon-engine';
import {
  type PluginDescriptor,
  type ProfileId,
  type WorkspaceId,
  type RunSessionId,
  type StageRoute,
  type StageByKindMatrix,
  stageWeights,
  collectPluginKinds,
} from './types.js';

type RegistryEntry = Readonly<{
  readonly kind: PluginStage;
  readonly descriptor: PluginDescriptor<PluginStage, PluginPayload>;
  readonly profile: ProfileId;
}>;

type RegistryBag<TContracts extends readonly PluginContract<any, any, any>[]> = {
  [K in TContracts[number] as K['kind']]: PluginDescriptor<K['kind'], PluginPayload>;
};

interface RegistryHandle {
  readonly profileId: ProfileId;
  readonly workspaceId: WorkspaceId;
  readonly sessionId: RunSessionId;
  close: () => Promise<void>;
}

class RegistryScope {
  #closed = false;

  constructor(
    private readonly profileId: ProfileId,
    private readonly workspaceId: WorkspaceId,
  ) {}

  verify() {
    if (this.#closed) {
      throw new Error(`registry scope is closed for ${this.profileId}/${this.workspaceId}`);
    }
  }

  [Symbol.dispose](): void {
    this.#closed = true;
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#closed = true;
    return Promise.resolve();
  }
}

export class PluginRegistry<TStages extends readonly PluginStage[]> {
  readonly #map = new Map<StageRoute<PluginStage>, RegistryEntry>();

  constructor(
    public readonly stages: TStages,
    public readonly profileId: ProfileId,
  ) {}

  get handleCount() {
    return this.#map.size;
  }

  register<TKind extends PluginStage>(descriptor: PluginDescriptor<TKind, PluginPayload>): void {
    const route = descriptor.route;
    this.#map.set(route, {
      kind: descriptor.stage,
      descriptor: descriptor as unknown as PluginDescriptor<PluginStage, PluginPayload>,
      profile: this.profileId,
    });
  }

  snapshot() {
    const weights = stageWeights(this.stages);
    const weightByKind = Object.fromEntries(weights.map((entry) => [entry.route, entry.weight]));
    return collectPluginKinds(this.stages).reduce<
      {
        readonly count: number;
        readonly byStage: Record<PluginStage, number>;
      } & Record<string, unknown>
    >(
      (acc, stage) => ({
        ...acc,
        byStage: {
          ...acc.byStage,
          [stage]: (acc.byStage[stage] ?? 0) + 1,
        },
      }),
      {
        count: this.#map.size,
        byStage: collectPluginKinds(this.stages).reduce<Record<PluginStage, number>>(
          (by, stage) => ({
            ...by,
            [stage]: 0,
          }),
          {
            ingest: 0,
            analyze: 0,
            resolve: 0,
            optimize: 0,
            execute: 0,
          },
        ),
        weightByKind,
      } as { readonly count: number; readonly byStage: Record<PluginStage, number> } & Record<string, unknown>,
    );
  }

  resolve(kind: PluginStage): readonly PluginDescriptor<PluginStage, PluginPayload>[] {
    return [...this.#map.values()]
      .filter((entry) => entry.kind === kind)
      .toSorted((left, right) => Number(String(left.kind).localeCompare(String(right.kind))))
      .map((entry) => entry.descriptor);
  }

  byProfile(profileId: ProfileId): readonly PluginDescriptor<PluginStage, PluginPayload>[] {
    return [...this.#map.values()]
      .filter((entry) => entry.profile === profileId)
      .map((entry) => entry.descriptor);
  }

  has(kind: PluginStage): boolean {
    return this.resolve(kind).length > 0;
  }

  async withScope<T>(
    workspaceId: WorkspaceId,
    sessionId: RunSessionId,
    work: (handle: RegistryHandle) => Promise<T>,
  ): Promise<T> {
    const handle: RegistryHandle = {
      profileId: this.profileId,
      workspaceId,
      sessionId,
      close: async () => this.close(),
    };

    await using scope = new RegistryScope(this.profileId, workspaceId);
    scope.verify();
    return work(handle);
  }

  close() {
    this.#map.clear();
  }
}

export const registryFromContracts = <
  TContracts extends readonly PluginContract<PluginStage, PluginConfig<PluginStage, PluginPayload>, PluginPayload>[],
>(
  contracts: TContracts,
  profileId: ProfileId,
): RegistryBag<TContracts> => {
  const descriptors = contracts.reduce((acc, contract, index) => {
    const route = `${contract.kind}/${String(index)}` as StageRoute<PluginStage>;
    const descriptor: PluginDescriptor<typeof contract.kind, PluginPayload> = {
      id: `${profileId}-${contract.id}` as PluginDescriptor<typeof contract.kind, PluginPayload>['id'],
      stage: contract.kind,
      name: `${contract.kind}-contract-${index}`,
      contract,
      route,
      profile: profileId,
    };

    return {
      ...acc,
      [contract.kind]: descriptor,
    } as RegistryBag<TContracts>;
  }, {} as RegistryBag<TContracts>);

  return descriptors;
};

export const byKindMap = <T extends readonly PluginContract<any, any, any>[]>(
  contracts: T,
): StageByKindMatrix<readonly PluginStage[]> => {
  return contracts.reduce((acc, contract) => {
    return {
      ...acc,
      [contract.kind.toUpperCase() as StageRoute<PluginStage>]: {
        stage: contract.kind,
        payloadType: contract.defaults.payload,
        profile: 'default' as ProfileId,
      },
    };
  }, {} as StageByKindMatrix<readonly PluginStage[]>);
};
