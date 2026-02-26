import type { Brand, NoInfer } from '@shared/type-level';
import type { DeepInterfaceChain, DeepNest, RecursiveOdd, RecursiveEven } from '@shared/type-level';
import { type SyntheticPlannerInput, type SyntheticRouteRecord, synthesizePlan } from '@domain/recovery-lab-synthetic-orchestration';

type Dec<N extends number> = N extends 0 ? 0 : number extends N ? N : [...Array<N>]['length'];

export interface ChainSeed {
  readonly chainId: Brand<string, 'ChainId'>;
  readonly stage: number;
}

export interface ChainOne extends ChainSeed {
  readonly one: true;
}

export interface ChainTwo extends ChainOne {
  readonly two: true;
}

export interface ChainThree extends ChainTwo {
  readonly three: true;
}

export interface ChainFour extends ChainThree {
  readonly four: true;
}

export interface ChainFive extends ChainFour {
  readonly five: true;
}

export interface ChainSix extends ChainFive {
  readonly six: true;
}

export interface ChainSeven extends ChainSix {
  readonly seven: true;
}

export interface ChainEight extends ChainSeven {
  readonly eight: true;
}

export interface ChainNine extends ChainEight {
  readonly nine: true;
}

export interface ChainTen extends ChainNine {
  readonly ten: true;
}

export interface ChainEleven extends ChainTen {
  readonly eleven: true;
}

export interface ChainTwelve extends ChainEleven {
  readonly twelve: true;
}

export interface ChainThirteen extends ChainTwelve {
  readonly thirteen: true;
}

export interface ChainFourteen extends ChainThirteen {
  readonly fourteen: true;
}

export interface ChainFifteen extends ChainFourteen {
  readonly fifteen: true;
}

export interface ChainSixteen extends ChainFifteen {
  readonly sixteen: true;
}

export interface ChainSeventeen extends ChainSixteen {
  readonly seventeen: true;
}

export interface ChainEighteen extends ChainSeventeen {
  readonly eighteen: true;
}

export interface ChainNineteen extends ChainEighteen {
  readonly nineteen: true;
}

export interface ChainTwenty extends ChainNineteen {
  readonly twenty: true;
}

export interface ChainTwentyOne extends ChainTwenty {
  readonly twentyOne: true;
}

export interface ChainTwentyTwo extends ChainTwentyOne {
  readonly twentyTwo: true;
}

export interface ChainTwentyThree extends ChainTwentyTwo {
  readonly twentyThree: true;
}

export interface ChainTwentyFour extends ChainTwentyThree {
  readonly twentyFour: true;
}

export interface ChainTwentyFive extends ChainTwentyFour {
  readonly twentyFive: true;
}

export interface ChainTwentySix extends ChainTwentyFive {
  readonly twentySix: true;
}

export interface ChainTwentySeven extends ChainTwentySix {
  readonly twentySeven: true;
}

export interface ChainTwentyEight extends ChainTwentySeven {
  readonly twentyEight: true;
}

export interface ChainTwentyNine extends ChainTwentyEight {
  readonly twentyNine: true;
}

export interface ChainThirty extends ChainTwentyNine {
  readonly thirty: true;
}

export interface ChainThirtyOne extends ChainThirty {
  readonly thirtyOne: true;
}

export interface ChainThirtyTwo extends ChainThirtyOne {
  readonly thirtyTwo: true;
}

export interface ChainThirtyThree extends ChainThirtyTwo {
  readonly thirtyThree: true;
}

export interface ChainThirtyFour extends ChainThirtyThree {
  readonly thirtyFour: true;
}

export interface ChainThirtyFive extends ChainThirtyFour {
  readonly thirtyFive: true;
}

export interface ChainThirtySix extends ChainThirtyFive {
  readonly thirtySix: true;
}

export interface ChainThirtySeven extends ChainThirtySix {
  readonly thirtySeven: true;
}

export interface ChainThirtyEight extends ChainThirtySeven {
  readonly thirtyEight: true;
}

export interface ChainThirtyNine extends ChainThirtyEight {
  readonly thirtyNine: true;
}

export interface ChainForty extends ChainThirtyNine {
  readonly forty: true;
}

export type StressChain = ChainOne &
  ChainTwo &
  ChainThree &
  ChainFour &
  ChainFive &
  ChainSix &
  ChainSeven &
  ChainEight &
  ChainNine &
  ChainTen &
  ChainEleven &
  ChainTwelve &
  ChainThirteen &
  ChainFourteen &
  ChainFifteen &
  ChainSixteen &
  ChainSeventeen &
  ChainEighteen &
  ChainNineteen &
  ChainTwenty &
  ChainTwentyOne &
  ChainTwentyTwo &
  ChainTwentyThree &
  ChainTwentyFour &
  ChainTwentyFive &
  ChainTwentySix &
  ChainTwentySeven &
  ChainTwentyEight &
  ChainTwentyNine &
  ChainThirty &
  ChainThirtyOne &
  ChainThirtyTwo &
  ChainThirtyThree &
  ChainThirtyFour &
  ChainThirtyFive &
  ChainThirtySix &
  ChainThirtySeven &
  ChainThirtyEight &
  ChainThirtyNine &
  ChainForty;

type BrandInput<T extends string> = Brand<string, T>;

export interface StressChainInput<T extends string = 'default'> {
  readonly mode: T;
  readonly chain: StressChain;
}

export interface StressChainNode<TDepth extends number = 0, TTag extends string = 'node'> {
  readonly name: TTag;
  readonly depth: TDepth;
  readonly chain: DeepNest<TTag, Dec<TDepth>>;
}

export interface StressNodeAdapter<TInput extends object> {
  adapt(input: TInput): TInput & { readonly adaptedAt: string };
}

export abstract class ChainStep<TInput extends object, TOutput extends object, TDepth extends number> {
  constructor(
    public readonly name: string,
    public readonly depth: TDepth,
  ) {}

  abstract execute(input: TInput): Promise<TOutput>;

  protected logState(value: TInput): string {
    return `${this.name}:${this.depth}:${Object.keys(value).length}`;
  }
}

export class PlanningStep<TInput extends StressChainInput<'planning'>, TOutput extends StressChainInput<'runtime'>>
  extends ChainStep<TInput, TOutput, 1>
{
  async execute(input: TInput): Promise<TOutput> {
    const nested = {
      ...(input as Record<string, unknown>),
      chain: {
        chainId: `${input.mode}:runtime` as Brand<string, 'ChainId'>,
        stage: 1,
      },
      mode: 'runtime',
      metadata: this.logState(input),
    } as unknown as TOutput;
    return nested;
  }
}

type PlannerMode<TInput> = TInput extends { readonly mode: infer M extends string } ? M : 'default';
type PlannerResult<TMode extends string, TDomain extends string> = {
  readonly mode: TMode;
  readonly domain: TDomain;
  readonly summary: string;
};

export class PlannerAdapter<TInput extends Record<string, unknown>, TDomain extends string = string> extends ChainStep<
  TInput,
  PlannerResult<PlannerMode<TInput>, TDomain>,
  2
> {
  constructor(
    public readonly domain: TDomain,
    public readonly mode: string,
  ) {
    super(mode, 2);
  }

  async execute(input: TInput): Promise<PlannerResult<PlannerMode<TInput>, TDomain>> {
    return {
      mode: (input as TInput & { readonly mode: PlannerMode<TInput> }).mode,
      domain: this.domain,
      summary: `${this.logState(input)}-${this.domain}`,
    };
  }
}

export class SyntheticChain {
  private readonly nodes = new Map<string, BrandInput<'SyntheticNode'>>();

  constructor(private readonly routes: readonly SyntheticRouteRecord[]) {}

  addRoute(route: SyntheticRouteRecord): void {
    this.nodes.set(route.id, route.id as unknown as BrandInput<'SyntheticNode'>);
  }

  seedRoutes(): void {
    for (const route of this.routes) {
      this.nodes.set(route.id, route.id as unknown as BrandInput<'SyntheticNode'>);
    }
  }

  toDraft(tenant: Brand<string, 'SyntheticTenant'>): ReadonlyArray<SyntheticPlannerInput> {
    return this.routes.map((route) => ({
      tenantId: tenant,
      namespace: 'stress',
      command: route.command,
      topology: {
        tenantId: tenant,
        nodes: [],
        edges: [],
      },
    }));
  }

  summarize(): Readonly<Record<string, number>> {
    const byDomain = new Map<string, number>();
    for (const route of this.nodes.keys()) {
      const parts = route.split(':');
      const domain = parts[1] ?? 'unknown';
      byDomain.set(domain, (byDomain.get(domain) ?? 0) + 1);
    }
    return Object.fromEntries(byDomain.entries());
  }
}

export const buildStressChainNode = <TDepth extends number>(depth: TDepth): StressChainNode<TDepth> => {
  const chain = {
    depth,
    payload: {
      depth,
      payload: {} as unknown as DeepNest<'node', Dec<TDepth extends 0 ? 1 : TDepth>>,
      marker: `depth:${depth}`,
    },
    marker: `depth:${depth}`,
  } as unknown as DeepNest<'node', Dec<TDepth>>;
  return {
    name: 'node' as const,
    depth,
    chain,
  };
};

export const buildStressChain = <T extends number>(depth: NoInfer<T>): readonly StressChainNode<T>[] => {
  const out: StressChainNode<T>[] = [];
  for (let level = 0; level < depth; level += 1) {
    out.push(buildStressChainNode(level as T));
  }
  return out;
};

export const buildRecursiveChain = (level: number): RecursiveOdd<DeepInterfaceChain, 6> | RecursiveEven<DeepInterfaceChain, 6> => {
  const payload: DeepInterfaceChain = {} as DeepInterfaceChain;
  if (level % 2 === 0) {
    return {
      terminal: payload,
      direction: 'even',
    } as unknown as RecursiveEven<DeepInterfaceChain, 6>;
  }
  return {
    terminal: { body: payload, depth: level } as { body: DeepInterfaceChain; depth: number },
    direction: 'odd',
    next: {
      terminal: { body: payload, depth: Math.max(level - 1, 0) },
      direction: 'even',
    },
  } as unknown as RecursiveOdd<DeepInterfaceChain, 6>;
};

export const buildDraftFromRecord = (input: SyntheticRouteRecord, payload: string): ReturnType<typeof buildStressChainNode<1>> => {
  const chain = buildStressChainNode(1);
  return ({
    ...chain,
    name: chain.name,
      chain: {
        ...chain.chain,
        payload: {
          ...(chain.chain.payload as unknown as Record<string, unknown>),
          marker: payload,
        } as unknown as typeof chain.chain.payload,
      },
  } ) as unknown as ReturnType<typeof buildStressChainNode<1>>;
};

export const adaptDraft = (input: StressChainInput): StressChainInput => {
  return {
    ...input,
    chain: {
      ...input.chain,
      chainId: `${input.chain.chainId}-adapted` as Brand<string, 'ChainId'>,
    },
  };
};

export const compileChainMap = (value: StressChainInput): ReadonlyMap<string, StressChainInput> => {
  const output = new Map<string, StressChainInput>();
  for (let index = 0; index < 16; index += 1) {
    output.set(`${value.mode}:${index}`, {
      ...value,
      mode: `${value.mode}-${index}` as StressChainInput['mode'],
    });
  }
  return output;
};
