export type Brand<T, Tag extends string> = T & { readonly __brand: Tag };

export interface ChainContract<TInput extends object, TOutput> {
  readonly key: string;
  accept(input: TInput): TOutput;
}

export interface StageA<TData extends Record<string, unknown>> extends ChainContract<TData, Brand<TData, 'Layer1'>> {
  readonly markerA: 'A';
}
export interface StageB<TData extends Record<string, unknown>> extends StageA<TData> {
  readonly markerB: 'B';
}
export interface StageC<TData extends Record<string, unknown>> extends StageB<TData> {
  readonly markerC: 'C';
}
export interface StageD<TData extends Record<string, unknown>> extends StageC<TData> {
  readonly markerD: 'D';
}
export interface StageE<TData extends Record<string, unknown>> extends StageD<TData> {
  readonly markerE: 'E';
}
export interface StageF<TData extends Record<string, unknown>> extends StageE<TData> {
  readonly markerF: 'F';
}
export interface StageG<TData extends Record<string, unknown>> extends StageF<TData> {
  readonly markerG: 'G';
}
export interface StageH<TData extends Record<string, unknown>> extends StageG<TData> {
  readonly markerH: 'H';
}
export interface StageI<TData extends Record<string, unknown>> extends StageH<TData> {
  readonly markerI: 'I';
}
export interface StageJ<TData extends Record<string, unknown>> extends StageI<TData> {
  readonly markerJ: 'J';
}
export interface StageK<TData extends Record<string, unknown>> extends StageJ<TData> {
  readonly markerK: 'K';
}
export interface StageL<TData extends Record<string, unknown>> extends StageK<TData> {
  readonly markerL: 'L';
}
export interface StageM<TData extends Record<string, unknown>> extends StageL<TData> {
  readonly markerM: 'M';
}
export interface StageN<TData extends Record<string, unknown>> extends StageM<TData> {
  readonly markerN: 'N';
}
export interface StageO<TData extends Record<string, unknown>> extends StageN<TData> {
  readonly markerO: 'O';
}
export interface StageP<TData extends Record<string, unknown>> extends StageO<TData> {
  readonly markerP: 'P';
}
export interface StageQ<TData extends Record<string, unknown>> extends StageP<TData> {
  readonly markerQ: 'Q';
}
export interface StageR<TData extends Record<string, unknown>> extends StageQ<TData> {
  readonly markerR: 'R';
}
export interface StageS<TData extends Record<string, unknown>> extends StageR<TData> {
  readonly markerS: 'S';
}
export interface StageT<TData extends Record<string, unknown>> extends StageS<TData> {
  readonly markerT: 'T';
}
export interface StageU<TData extends Record<string, unknown>> extends StageT<TData> {
  readonly markerU: 'U';
}
export interface StageV<TData extends Record<string, unknown>> extends StageU<TData> {
  readonly markerV: 'V';
}
export interface StageW<TData extends Record<string, unknown>> extends StageV<TData> {
  readonly markerW: 'W';
}
export interface StageX<TData extends Record<string, unknown>> extends StageW<TData> {
  readonly markerX: 'X';
}
export interface StageY<TData extends Record<string, unknown>> extends StageX<TData> {
  readonly markerY: 'Y';
}
export interface StageZ<TData extends Record<string, unknown>> extends StageY<TData> {
  readonly markerZ: 'Z';
}
export interface StageAA<TData extends Record<string, unknown>> extends StageZ<TData> {
  readonly markerAA: 'AA';
}
export interface StageAB<TData extends Record<string, unknown>> extends StageAA<TData> {
  readonly markerAB: 'AB';
}
export interface StageAC<TData extends Record<string, unknown>> extends StageAB<TData> {
  readonly markerAC: 'AC';
}
export interface StageAD<TData extends Record<string, unknown>> extends StageAC<TData> {
  readonly markerAD: 'AD';
}
export interface StageAE<TData extends Record<string, unknown>> extends StageAD<TData> {
  readonly markerAE: 'AE';
}
export interface StageAF<TData extends Record<string, unknown>> extends StageAE<TData> {
  readonly markerAF: 'AF';
}
export interface StageAG<TData extends Record<string, unknown>> extends StageAF<TData> {
  readonly markerAG: 'AG';
}
export interface StageAH<TData extends Record<string, unknown>> extends StageAG<TData> {
  readonly markerAH: 'AH';
}
export interface StageAI<TData extends Record<string, unknown>> extends StageAH<TData> {
  readonly markerAI: 'AI';
}
export interface StageAJ<TData extends Record<string, unknown>> extends StageAI<TData> {
  readonly markerAJ: 'AJ';
}
export interface StageAK<TData extends Record<string, unknown>> extends StageAJ<TData> {
  readonly markerAK: 'AK';
}
export interface StageAL<TData extends Record<string, unknown>> extends StageAK<TData> {
  readonly markerAL: 'AL';
}
export interface StageAM<TData extends Record<string, unknown>> extends StageAL<TData> {
  readonly markerAM: 'AM';
}
export interface StageAN<TData extends Record<string, unknown>> extends StageAM<TData> {
  readonly markerAN: 'AN';
}
export interface StageAO<TData extends Record<string, unknown>> extends StageAN<TData> {
  readonly markerAO: 'AO';
}
export interface StageAP<TData extends Record<string, unknown>> extends StageAO<TData> {
  readonly markerAP: 'AP';
}
export interface StageAQ<TData extends Record<string, unknown>> extends StageAP<TData> {
  readonly markerAQ: 'AQ';
}

export type DeepHierarchicalChain<T extends Record<string, unknown>> = StageA<T> &
  StageB<T> &
  StageC<T> &
  StageD<T> &
  StageE<T> &
  StageF<T> &
  StageG<T> &
  StageH<T> &
  StageI<T> &
  StageJ<T> &
  StageK<T> &
  StageL<T> &
  StageM<T> &
  StageN<T> &
  StageO<T> &
  StageP<T> &
  StageQ<T> &
  StageR<T> &
  StageS<T> &
  StageT<T> &
  StageU<T> &
  StageV<T> &
  StageW<T> &
  StageX<T> &
  StageY<T> &
  StageZ<T> &
  StageAA<T> &
  StageAB<T> &
  StageAC<T> &
  StageAD<T> &
  StageAE<T> &
  StageAF<T> &
  StageAG<T> &
  StageAH<T> &
  StageAI<T> &
  StageAJ<T> &
  StageAK<T> &
  StageAL<T> &
  StageAM<T> &
  StageAN<T> &
  StageAO<T> &
  StageAP<T> &
  StageAQ<T>;

export class BaseNode<TInput extends Record<string, unknown>, TOutput> implements ChainContract<TInput, TOutput> {
  public readonly key: string;

  public constructor(key: string) {
    this.key = key;
  }

  public accept(input: TInput): TOutput {
    return input as unknown as TOutput;
  }
}

const brandOut = <T extends Record<string, unknown>, B extends string>(input: T, brand: B): T & { readonly __brand: B } => {
  return {
    ...(input as Record<string, unknown>),
    __brand: brand,
  } as T & { readonly __brand: B };
};

export class ChainNode1<TData extends Record<string, unknown>> extends BaseNode<TData, Brand<TData, 'Layer1'>> {
  public constructor() {
    super('chain-1');
  }
  public override accept(input: TData): Brand<TData, 'Layer1'> {
    return brandOut(input, 'Layer1');
  }
}
export class ChainNode2<TData extends Record<string, unknown>> extends BaseNode<Brand<TData, 'Layer1'>, Brand<TData, 'Layer2'>> {
  public constructor() {
    super('chain-2');
  }
  public override accept(input: Brand<TData, 'Layer1'>): Brand<TData, 'Layer2'> {
    return brandOut(input, 'Layer2');
  }
}
export class ChainNode3<TData extends Record<string, unknown>> extends BaseNode<Brand<TData, 'Layer2'>, Brand<TData, 'Layer3'>> {
  public constructor() {
    super('chain-3');
  }
  public override accept(input: Brand<TData, 'Layer2'>): Brand<TData, 'Layer3'> {
    return brandOut(input, 'Layer3');
  }
}
export class ChainNode4<TData extends Record<string, unknown>> extends BaseNode<Brand<TData, 'Layer3'>, Brand<TData, 'Layer4'>> {
  public constructor() {
    super('chain-4');
  }
  public override accept(input: Brand<TData, 'Layer3'>): Brand<TData, 'Layer4'> {
    return brandOut(input, 'Layer4');
  }
}
export class ChainNode5<TData extends Record<string, unknown>> extends BaseNode<Brand<TData, 'Layer4'>, Brand<TData, 'Layer5'>> {
  public constructor() {
    super('chain-5');
  }
  public override accept(input: Brand<TData, 'Layer4'>): Brand<TData, 'Layer5'> {
    return brandOut(input, 'Layer5');
  }
}
export class ChainNode6<TData extends Record<string, unknown>> extends BaseNode<Brand<TData, 'Layer5'>, Brand<TData, 'Layer6'>> {
  public constructor() {
    super('chain-6');
  }
  public override accept(input: Brand<TData, 'Layer5'>): Brand<TData, 'Layer6'> {
    return brandOut(input, 'Layer6');
  }
}
export class ChainNode7<TData extends Record<string, unknown>> extends BaseNode<Brand<TData, 'Layer6'>, Brand<TData, 'Layer7'>> {
  public constructor() {
    super('chain-7');
  }
  public override accept(input: Brand<TData, 'Layer6'>): Brand<TData, 'Layer7'> {
    return brandOut(input, 'Layer7');
  }
}
export class ChainNode8<TData extends Record<string, unknown>> extends BaseNode<Brand<TData, 'Layer7'>, Brand<TData, 'Layer8'>> {
  public constructor() {
    super('chain-8');
  }
  public override accept(input: Brand<TData, 'Layer7'>): Brand<TData, 'Layer8'> {
    return brandOut(input, 'Layer8');
  }
}

type PipelinePath = [
  ChainNode1<Record<string, unknown>>,
  ChainNode2<Record<string, unknown>>,
  ChainNode3<Record<string, unknown>>,
  ChainNode4<Record<string, unknown>>,
  ChainNode5<Record<string, unknown>>,
  ChainNode6<Record<string, unknown>>,
  ChainNode7<Record<string, unknown>>,
  ChainNode8<Record<string, unknown>>,
];

export const chainRuntime = (seed: Record<string, unknown>): ReturnType<ChainNode8<Record<string, unknown>>['accept']> => {
  const path: PipelinePath = [
    new ChainNode1(),
    new ChainNode2(),
    new ChainNode3(),
    new ChainNode4(),
    new ChainNode5(),
    new ChainNode6(),
    new ChainNode7(),
    new ChainNode8(),
  ];

  let cursor: unknown = seed;
  for (const node of path) {
    cursor = node.accept(cursor as never);
  }
  return cursor as ReturnType<ChainNode8<Record<string, unknown>>['accept']>;
};

export type CompatibleChain<T extends Record<string, unknown>, U extends DeepHierarchicalChain<T> = DeepHierarchicalChain<T>> = U & T;
export const ensureChain = <T extends Record<string, unknown>>(value: T): CompatibleChain<T> => value as CompatibleChain<T>;

export const verifyChainCompatibility = (left: DeepHierarchicalChain<Record<string, unknown>>): boolean => {
  return Object.keys(left).includes('key');
};

export type InterfaceGrid<T extends Record<string, unknown>> = {
  readonly a: StageA<T>;
  readonly b: StageB<T>;
  readonly c: StageC<T>;
  readonly d: StageD<T>;
  readonly e: StageE<T>;
  readonly f: StageF<T>;
  readonly g: StageG<T>;
  readonly h: StageH<T>;
  readonly i: StageI<T>;
  readonly j: StageJ<T>;
};

export type ChainGraph<T extends Record<string, unknown>> = {
  readonly depth36: DeepHierarchicalChain<T>;
  readonly classes: PipelinePath;
  readonly compatibility: boolean;
};

export const buildChainGraph = <T extends Record<string, unknown>>(seed: T): ChainGraph<T> => {
  const runtime = chainRuntime(seed);
  return {
    depth36: ensureChain(seed) as DeepHierarchicalChain<T>,
    classes: [
      new ChainNode1(),
      new ChainNode2(),
      new ChainNode3(),
      new ChainNode4(),
      new ChainNode5(),
      new ChainNode6(),
      new ChainNode7(),
      new ChainNode8(),
    ] as PipelinePath,
    compatibility: runtime !== undefined,
  };
};

export type ChainProjection<T extends Record<string, unknown>> = {
  readonly chain: InterfaceGrid<T>;
  readonly graph: ChainGraph<T>;
  readonly markers: string[];
};

export const projectChain = <T extends Record<string, unknown>>(seed: T): ChainProjection<T> => {
  const runtime = chainRuntime(seed);
  const graph = buildChainGraph(seed);

  const markers = Object.keys(graph.depth36).filter((key) => key.startsWith('marker'));

  return {
    chain: {
      a: graph.depth36,
      b: graph.depth36,
      c: graph.depth36,
      d: graph.depth36,
      e: graph.depth36,
      f: graph.depth36,
      g: graph.depth36,
      h: graph.depth36,
      i: graph.depth36,
      j: graph.depth36,
    },
    graph,
    markers,
  };
};

export const chainProjectionValue = projectChain({ name: 'atlas', stage: 1, trace: ['a', 'b', 'c'], active: true });
