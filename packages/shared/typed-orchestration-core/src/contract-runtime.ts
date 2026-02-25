import type { NoInfer } from './tuple-utils';
import {
  PluginLattice,
  normalizePluginNode,
  type PluginName,
  type PluginNode,
  type PluginResult,
  type PluginStage,
} from './plugin-lattice';

export type ContractNamespace = 'contract';
export type ContractStage = 'discover' | 'shape' | 'score' | 'simulate' | 'execute' | 'verify' | 'report';
export type ContractLevel = 'low' | 'medium' | 'high' | 'critical';
export type ContractId<Name extends string = string> = `${ContractNamespace}:${Name}`;

export type ContractRouteSegments<T extends readonly string[]> = T extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Tail['length'] extends 0
    ? `${Head & string}`
    : `${Head & string}/${ContractRouteSegments<Tail extends readonly string[] ? Tail : readonly []>}`
  : never;

export type ContractEnvelopeInput<TMetadata extends object = object> = {
  readonly seed: object;
  readonly route: readonly string[];
  readonly metadata: NoInfer<TMetadata>;
  readonly stage: ContractStage;
  readonly base: object;
};

export interface ContractRunContext<TMetadata extends object = object> {
  readonly contextId: string;
  readonly tenant: string;
  readonly stage: ContractStage;
  readonly route: string;
  readonly metadata: TMetadata;
}

export interface ContractRunEvent<TInput, TMetadata extends object = object> {
  readonly name: ContractId<string>;
  readonly input: TInput;
  readonly context: ContractRunContext<TMetadata>;
}

export interface ContractResult<TOutput> {
  readonly ok: boolean;
  readonly output?: TOutput;
  readonly diagnostics: readonly string[];
  readonly level: ContractLevel;
}

export interface ContractDescriptor<
  TInput extends object = object,
  TOutput = unknown,
  TContext = object,
  TMetadata extends object = object,
> {
  readonly name: ContractId<string>;
  readonly slot: string;
  readonly stage: ContractStage;
  readonly dependsOn: readonly ContractId<string>[];
  readonly weight: number;
  readonly run: (payload: ContractRunEvent<TInput, TMetadata>, context: ContractRunContext<TMetadata>) => Promise<ContractResult<TOutput>>;
  readonly metadata: NoInfer<TMetadata> & {
    readonly tier: ContractLevel;
    readonly owner: string;
  };
  readonly contextHint?: TContext;
}

export interface ContractExecutionOptions<TInput extends object, TMetadata extends object> {
  readonly seed: NoInfer<TInput>;
  readonly metadata: TMetadata;
  readonly stage: ContractStage;
  readonly routeLabel?: string;
}

export type ContractByName<TContracts extends readonly ContractDescriptor[]> = {
  [TEntry in TContracts[number] as TEntry['name']]: TEntry;
};

export type ContractOutputFor<
  TContracts extends readonly ContractDescriptor<any, any, any, any>[],
  TName extends TContracts[number]['name'],
> = TContracts[number] extends infer TDescriptor
  ? TDescriptor extends ContractDescriptor<infer TInput, infer TOutput, infer TContext, infer TMetadata> & {
      readonly name: TName;
    }
    ? TOutput
    : never
  : never;

export type ContractByStage<TContracts extends readonly ContractDescriptor<any, any, any, any>[], TStage extends ContractStage> =
  Extract<TContracts[number], { readonly stage: TStage }>['name'];

export type ContractExecutionInput<
  TInput extends object,
  TMetadata extends object,
> = {
  readonly seed: TInput;
  readonly metadata: TMetadata;
  readonly stage: ContractStage;
  readonly route: readonly string[];
};

export type ContractResultMap<TContracts extends readonly ContractDescriptor<any, any, any, any>[]> = ReadonlyMap<
  ContractId,
  unknown
> & {
  get<TKey extends TContracts[number]['name']>(key: TKey): ContractOutputFor<TContracts, TKey> | undefined;
};

export type StageDictionary = {
  readonly discover: 0;
  readonly shape: 10;
  readonly score: 20;
  readonly simulate: 30;
  readonly execute: 40;
  readonly verify: 50;
  readonly report: 60;
};

export const STAGE_RANK: StageDictionary = {
  discover: 0,
  shape: 10,
  score: 20,
  simulate: 30,
  execute: 40,
  verify: 50,
  report: 60,
};

const nowIso = (): string => new Date().toISOString();
const toContractName = (value: string): ContractId<string> => {
  const normalized = String(value).trim();
  return normalized.startsWith('contract:') ? (normalized as ContractId<string>) : `contract:${normalized}` as ContractId<string>;
};

const asPluginName = (value: ContractId<string>): PluginName => `plugin:${value}` as PluginName;
const asContractName = (value: PluginName): ContractId<string> => {
  const inner = String(value).replace(/^plugin:/, '');
  return toContractName(inner);
};
const stageFromContract = (value: ContractStage): PluginStage => `stage:${value}` as PluginStage;
const normalizeRoute = (route: readonly string[]): string => route.join('::');

const asRuntimeInput = <TInput extends object, TMetadata extends object>(
  options: ContractExecutionOptions<TInput, TMetadata>,
): ContractExecutionInput<TInput, TMetadata> => ({
  seed: options.seed,
  metadata: options.metadata,
  stage: options.stage,
  route: options.routeLabel ? [options.routeLabel] : ['contract:runtime'],
});

const toNodeNodes = <
  TInput extends object,
  TMetadata extends object,
  TContracts extends readonly ContractDescriptor<TInput, unknown, object, TMetadata>[],
>(contracts: TContracts): readonly PluginNode<ContractExecutionInput<TInput, TMetadata>, unknown, PluginName>[] => {
  return contracts.map((descriptor, index) => {
    const node = normalizePluginNode<
      ContractExecutionInput<TInput, TMetadata>,
      unknown,
      PluginName
    >({
      name: asPluginName(descriptor.name),
      slot: descriptor.slot,
      stage: stageFromContract(descriptor.stage),
      dependsOn: descriptor.dependsOn,
      weight: descriptor.weight,
      run: async (payload, context) => {
        const event: ContractRunEvent<TInput, TMetadata> = {
          name: descriptor.name,
          input: payload.seed as TInput,
          context: {
            contextId: `${descriptor.name}:${context.executionId}`,
            tenant: String(context.node).replace(/^plugin:/, '').replace(/^contract:/, '').split(':')[0],
            stage: descriptor.stage,
            route: normalizeRoute([context.node, ...payload.route]),
            metadata: payload.input.metadata as TMetadata,
          },
        };

        const contractContext: ContractRunContext<TMetadata> = {
          contextId: `context:${descriptor.name}:${index}`,
          tenant: event.context.tenant,
          stage: descriptor.stage,
          route: normalizeRoute(payload.route),
          metadata: payload.input.metadata as TMetadata,
        };

        const output = await descriptor.run(event, contractContext);
        if (!output.ok) {
          return {
            status: 'err',
            error: output.diagnostics.length > 0
              ? new Error(output.diagnostics[0])
              : new Error(`contract:${descriptor.name}:failure`),
            logs: output.diagnostics,
          } as PluginResult<unknown>;
        }

        return {
          status: 'ok',
          output: output.output as unknown,
          logs: output.diagnostics,
        } as PluginResult<unknown>;
      },
    });

    return node;
  });
};

type BootstrapContractMetadata = { readonly tier: ContractLevel; readonly owner: string };

const createBootstrapContracts = <TInput extends object, TMetadata extends object = object>(): readonly ContractDescriptor<
  TInput,
  object,
  object,
  TMetadata
>[] => [
  {
    name: toContractName('bootstrap-discover'),
    stage: 'discover',
    slot: 'bootstrap',
    dependsOn: [] as const,
    weight: 1,
    metadata: ({
      tier: 'low',
      owner: 'shared-runtime',
    } as unknown) as NoInfer<TMetadata> & BootstrapContractMetadata,
    run: async () => ({
      ok: true,
      output: { kind: 'bootstrap-discover' },
      diagnostics: ['bootstrap-discover'],
      level: 'low',
    }),
  },
  {
    name: toContractName('bootstrap-score'),
    stage: 'score',
    slot: 'bootstrap',
    dependsOn: [toContractName('bootstrap-discover')],
    weight: 1,
    metadata: ({
      tier: 'low',
      owner: 'shared-runtime',
    } as unknown) as NoInfer<TMetadata> & BootstrapContractMetadata,
    run: async () => ({
      ok: true,
      output: { kind: 'bootstrap-score' },
      diagnostics: ['bootstrap-score'],
      level: 'low',
    }),
  },
  {
    name: toContractName('bootstrap-report'),
    stage: 'report',
    slot: 'bootstrap',
    dependsOn: [toContractName('bootstrap-score')],
    weight: 1,
    metadata: ({
      tier: 'low',
      owner: 'shared-runtime',
    } as unknown) as NoInfer<TMetadata> & BootstrapContractMetadata,
    run: async () => ({
      ok: true,
      output: { kind: 'bootstrap-report' },
      diagnostics: ['bootstrap-report'],
      level: 'low',
    }),
  },
] as const;

export class ContractLatticeRuntime<
  TInput extends object,
  TMetadata extends object,
  TContracts extends readonly ContractDescriptor<TInput, unknown, object, TMetadata>[],
> {
  #contracts: TContracts;
  #allContracts: ContractDescriptor<TInput, unknown, object, TMetadata>[];
  #contractNames: ContractId<string>[];
  readonly #lattice: PluginLattice<
    ContractExecutionInput<TInput, TMetadata>,
    readonly PluginNode<ContractExecutionInput<TInput, TMetadata>, unknown, PluginName>[]
  >;

  public constructor(contracts: TContracts) {
    const bootstrap = createBootstrapContracts<TInput, TMetadata>();
    this.#contracts = contracts;
    this.#allContracts = [...bootstrap, ...contracts] as const;
    this.#contractNames = this.#allContracts.map((entry) => entry.name);
    this.#lattice = new PluginLattice(toNodeNodes(this.#allContracts as readonly ContractDescriptor<TInput, unknown, object, TMetadata>[]), 'stage:contract-root');
  }

  public async runAll(options: ContractExecutionOptions<TInput, TMetadata>): Promise<ContractResultMap<TContracts>> {
    const payload = asRuntimeInput(options);
    const outputs = await this.#lattice.executeAll(payload);

    const map = new Map<ContractId<string>, unknown>();
    this.#allContracts.forEach((contract, index) => {
      if (index < outputs.length) {
        map.set(contract.name, outputs[index]);
      }
    });

    return map as ContractResultMap<TContracts>;
  }

  public async runOne<TName extends TContracts[number]['name']>(
    name: TName,
    options: ContractExecutionOptions<TInput, TMetadata>,
  ): Promise<ContractResult<ContractOutputFor<TContracts, TName>>> {
    const output = await this.#lattice.execute(asPluginName(name), asRuntimeInput(options));
    const descriptor = this.#allContracts.find((entry): entry is Extract<TContracts[number], { readonly name: TName }> => entry.name === name);
    const mappedOutput = output as ContractOutputFor<TContracts, TName>;
    return {
      ok: true,
      output: mappedOutput,
      diagnostics: ['contract-run-one', String(name)],
      level: descriptor?.metadata.tier ?? 'low',
    } satisfies ContractResult<ContractOutputFor<TContracts, TName>>;
  }

  public byName(name: ContractId<string>): ContractDescriptor<TInput, unknown, object, TMetadata> | undefined {
    return this.#allContracts.find((entry) => entry.name === name);
  }

  public names(): readonly ContractId<string>[] {
    return [...this.#contractNames].toSorted((left, right) => left.localeCompare(right));
  }

  public stageOrder(): readonly ContractStage[] {
    return [...this.#contracts]
      .map((entry) => entry.stage)
      .toSorted((left, right) => (STAGE_RANK[left] ?? Number.MAX_SAFE_INTEGER) - (STAGE_RANK[right] ?? Number.MAX_SAFE_INTEGER));
  }

  public diagnostics(): { readonly total: number; readonly createdAt: string; readonly stages: readonly ContractStage[] } {
    const stages = new Map<ContractStage, number>();
    for (const entry of this.#contracts) {
      stages.set(entry.stage, (stages.get(entry.stage) ?? 0) + 1);
    }
    return {
      total: this.#contracts.length,
      createdAt: nowIso(),
      stages: [...stages.keys()].toSorted((left, right) => (STAGE_RANK[left] ?? 0) - (STAGE_RANK[right] ?? 0)),
    };
  }

  public mergeStages<TOther extends readonly ContractDescriptor<TInput, unknown, object, TMetadata>[]>(
    ...other: TOther
  ): ContractLatticeRuntime<TInput, TMetadata, [...TContracts, ...TOther]> {
    const merged = [...this.#contracts, ...other] as [...TContracts, ...TOther];
    return new ContractLatticeRuntime<TInput, TMetadata, [...TContracts, ...TOther]>(merged);
  }
}

export const createContractRuntime = <
  TInput extends object,
  TMetadata extends object,
  TContracts extends readonly ContractDescriptor<TInput, unknown, object, TMetadata>[],
>(
  contracts: TContracts,
): ContractLatticeRuntime<TInput, TMetadata, TContracts> => new ContractLatticeRuntime<TInput, TMetadata, TContracts>(contracts);

export const pickByStage = <
  TContracts extends readonly ContractDescriptor<any, unknown, object, object>[],
  TTarget extends ContractStage,
>(
  contracts: TContracts,
  stage: TTarget,
): readonly (Extract<TContracts[number], { readonly stage: TTarget }>['name'])[] =>
  contracts
    .filter((entry): entry is Extract<TContracts[number], { readonly stage: TTarget }> => entry.stage === stage)
    .map((entry) => entry.name);

export const inferContractOutput = <
  TDescriptor extends ContractDescriptor<any, any, any, any>,
>(
  descriptor: TDescriptor,
): TDescriptor extends ContractDescriptor<any, infer TOutput, any, any> ? TOutput : never => {
  if (!descriptor) {
    throw new Error('invalid-descriptor');
  }
  return undefined as unknown as TDescriptor extends ContractDescriptor<any, infer TOutput, any, any> ? TOutput : never;
};

export const contractNamesFromContracts = <
  TContracts extends readonly ContractDescriptor<object, unknown, object, object>[],
>(
  contracts: TContracts,
): readonly ContractId<string>[] => contracts.map((entry) => entry.name);

export interface StageRank {
  readonly discover: 0;
  readonly shape: 10;
  readonly score: 20;
  readonly simulate: 30;
  readonly execute: 40;
  readonly verify: 50;
  readonly report: 60;
}

export const STAGE_RANK_DICTIONARY: StageRank = {
  discover: 0,
  shape: 10,
  score: 20,
  simulate: 30,
  execute: 40,
  verify: 50,
  report: 60,
};
