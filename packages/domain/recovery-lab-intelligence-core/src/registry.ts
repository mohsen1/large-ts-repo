import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { Brand } from '@shared/core';
import type {
  PluginContract,
  RegistryMap,
  ContractByKind,
  PluginDescriptor,
  StrategyMode,
  StrategyLane,
  StrategyTuple,
} from './contracts';
import { buildContractNamespace } from './contracts';
import type { SignalSource } from './types';

type DescriptorBag<TContracts extends readonly PluginContract<string, any, any, any>[]> = RegistryMap<TContracts>;

type RegistrySnapshot = {
  readonly size: number;
  readonly byLane: Record<StrategyLane, number>;
  readonly byMode: Record<StrategyMode, number>;
};

interface RegistryScope {
  readonly workspace: Brand<string, 'WorkspaceId'>;
  readonly active: boolean;
  close(): void;
  [Symbol.asyncDispose]?(): Promise<void>;
  [Symbol.dispose]?(): void;
}

export class StrategyRegistry<
  TContracts extends readonly PluginContract<string, any, any, any>[],
  const TStages extends readonly StrategyMode[],
> {
  readonly #workspace: Brand<string, 'WorkspaceId'>;
  readonly #descriptors = new Map<string, PluginDescriptor<TContracts[number], Record<string, unknown>>>();
  readonly #phases: readonly StrategyMode[];
  readonly #stack = new AsyncDisposableStack();

  constructor(workspace: Brand<string, 'WorkspaceId'>, stages: TStages, initial: TContracts) {
    this.#workspace = workspace;
    this.#phases = stages;
    for (const contract of initial) {
      this.register(contract, {
        label: `${String(contract.kind)}:${contract.mode}`,
        active: true,
        aliases: [String(contract.kind), contract.mode],
      });
    }
  }

  get workspaceId(): Brand<string, 'WorkspaceId'> {
    return this.#workspace;
  }

  get stages(): readonly StrategyMode[] {
    return this.#phases;
  }

  get descriptors() {
    return this.#descriptors;
  }

  get descriptorCount(): number {
    return this.#descriptors.size;
  }

  #key(contract: PluginContract<string, any, any, any>): string {
    return `${contract.kind}/${contract.id}`;
  }

  register<TContract extends PluginContract<string, any, any, any>>(
    contract: TContract,
    overrides: Partial<
      Omit<
        PluginDescriptor<TContract, Record<string, unknown>>,
        'key' | 'contract' | 'route' | 'label' | 'active' | 'aliases'
      >
    > & {
      readonly signalSource?: SignalSource;
      readonly severity?: PluginDescriptor<TContract, Record<string, unknown>>['severity'];
    } = {},
  ): PluginDescriptor<TContract, Record<string, unknown>> {
    const descriptor: PluginDescriptor<TContract, Record<string, unknown>> = {
      key: `${contract.kind}/${contract.id}` as `${TContract['kind']}:${TContract['id']}`,
      contract,
      route: contract.namespace,
      label: `${contract.id}-${contract.kind}`,
      active: true,
      aliases: [contract.kind, contract.id],
      severity: overrides.severity ?? 'info',
      timeoutMs: 5_000,
      retries: 0,
      ...overrides,
    };

    this.#descriptors.set(this.#key(contract), descriptor);
    this.#stack.defer(() => {
      // no-op marker, stack slot keeps deterministic disposal behavior in async contexts.
    });
    return descriptor;
  }

  list<TKind extends string>(kind?: TKind): readonly PluginDescriptor<
    ContractByKind<TContracts, TKind>,
    Record<string, unknown>
  >[] {
    return [...this.#descriptors.values()].filter(
      (entry): entry is PluginDescriptor<ContractByKind<TContracts, TKind>, Record<string, unknown>> =>
        kind === undefined || (entry.contract as PluginContract<string, any, any, any>).kind === kind,
    );
  }

  resolve<TKind extends string>(
    kind: TKind,
    id: string,
  ): Result<PluginDescriptor<ContractByKind<TContracts, TKind>, Record<string, unknown>>> {
    const entry = this.#descriptors.get(`${String(kind)}/${id}`);
    if (!entry) {
      return fail(new Error(`unknown contract: ${String(kind)}/${id}`));
    }
    return ok(entry as PluginDescriptor<ContractByKind<TContracts, TKind>, Record<string, unknown>>);
  }

  stageDescriptors(): Record<StrategyLane, readonly PluginDescriptor<TContracts[number], Record<string, unknown>>[]> {
    const empty: Record<StrategyLane, readonly PluginDescriptor<TContracts[number], Record<string, unknown>>[]> = {
      forecast: [],
      resilience: [],
      containment: [],
      recovery: [],
      assurance: [],
    };

    return this.reduceByLane(empty);
  }

  private reduceByLane(
    base: Record<StrategyLane, readonly PluginDescriptor<TContracts[number], Record<string, unknown>>[]>,
  ): Record<StrategyLane, readonly PluginDescriptor<TContracts[number], Record<string, unknown>>[]> {
    const laneGroups = [...this.#descriptors.values()].reduce<
      Record<StrategyLane, readonly PluginDescriptor<TContracts[number], Record<string, unknown>>[]>
    >(
      (acc, entry) => {
        const lane = entry.contract.lane;
        const current = acc[lane] as readonly PluginDescriptor<TContracts[number], Record<string, unknown>>[];
        return {
          ...acc,
          [lane]: [...current, entry],
        };
      },
      {
        forecast: [],
        resilience: [],
        containment: [],
        recovery: [],
        assurance: [],
      } as Record<StrategyLane, readonly PluginDescriptor<TContracts[number], Record<string, unknown>>[]>,
    );
    return { ...base, ...laneGroups };
  }

  snapshot(): RegistrySnapshot {
    const entries = [...this.#descriptors.values()];
    const byLane = entries.reduce<Record<StrategyLane, number>>(
      (acc, entry) => ({
        ...acc,
        [entry.contract.lane]: (acc[entry.contract.lane] ?? 0) + 1,
      }),
      {
        forecast: 0,
        resilience: 0,
        containment: 0,
        recovery: 0,
        assurance: 0,
      },
    );
    const byMode = entries.reduce<Record<StrategyMode, number>>(
      (acc, entry) => ({
        ...acc,
        [entry.contract.mode]: (acc[entry.contract.mode] ?? 0) + 1,
      }),
      {
        simulate: 0,
        analyze: 0,
        stress: 0,
        plan: 0,
        synthesize: 0,
      },
    );
    return {
      size: entries.length,
      byLane,
      byMode,
    };
  }

  entries(): IterableIterator<PluginDescriptor<TContracts[number], Record<string, unknown>>> {
    return this.#descriptors.values();
  }

  routeMap(): ReadonlyMap<string, PluginDescriptor<TContracts[number], Record<string, unknown>>> {
    return new Map(this.#descriptors);
  }

  openScope(): Scope {
    return new Scope(this);
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.#descriptors.clear();
    return this.#stack.disposeAsync();
  }
}

class Scope implements RegistryScope {
  #disposed = false;

  constructor(private readonly registry: StrategyRegistry<any, readonly StrategyMode[]>) {}

  get workspace(): Brand<string, 'WorkspaceId'> {
    return this.registry.workspaceId;
  }

  get active() {
    return !this.#disposed;
  }

  close(): void {
    this.#disposed = true;
  }

  withContracts<TContracts extends readonly PluginContract<string, any, any, any>[]>(
    predicate?: (kind: string) => boolean,
  ): DescriptorBag<TContracts> {
    const byKey: Record<string, PluginDescriptor<TContracts[number], Record<string, unknown>>> = {};
    for (const entry of this.registry.entries()) {
      const matches = predicate ? predicate((entry as PluginDescriptor<TContracts[number]>).contract.kind) : true;
      if (matches) {
        byKey[String((entry as PluginDescriptor<TContracts[number]>).contract.kind)] = entry as PluginDescriptor<
          TContracts[number],
          Record<string, unknown>
        >;
      }
    }
    return byKey as unknown as DescriptorBag<TContracts>;
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.close();
    return Promise.resolve();
  }

  [Symbol.dispose](): void {
    this.close();
  }
}

const brandWorkspace = (value: string): Brand<string, 'WorkspaceId'> => value as Brand<string, 'WorkspaceId'>;

export const createRegistry = <const TContracts extends readonly PluginContract<string, any, any, any>[], const TStages extends readonly StrategyMode[]>(
  workspace: string,
  stages: TStages,
  contracts: TContracts,
): StrategyRegistry<TContracts, TStages> => {
  const registered = contracts
    .map((contract) => ({
      ...contract,
      namespace: buildContractNamespace(contract.kind, contract.mode),
    })) as unknown as TContracts;
  return new StrategyRegistry<TContracts, TStages>(brandWorkspace(workspace) as Brand<string, 'WorkspaceId'>, stages, registered);
};

export const registryRouteFromTuple = (tuple: StrategyTuple): StrategyTuple =>
  tuple as unknown as StrategyTuple;
