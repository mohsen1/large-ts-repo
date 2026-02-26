export interface ChainNode<TName extends string = string> {
  readonly name: TName;
  readonly index: number;
  readonly next?: unknown;
}

export type NodeA = ChainNode<'A'>;
export type NodeB = ChainNode<'B'>;
export type NodeC = ChainNode<'C'>;
export type NodeD = ChainNode<'D'>;
export type NodeE = ChainNode<'E'>;
export type NodeF = ChainNode<'F'>;
export type NodeG = ChainNode<'G'>;
export type NodeH = ChainNode<'H'>;
export type NodeI = ChainNode<'I'>;
export type NodeJ = ChainNode<'J'>;
export type NodeK = ChainNode<'K'>;
export type NodeL = ChainNode<'L'>;
export type NodeM = ChainNode<'M'>;
export type NodeN = ChainNode<'N'>;
export type NodeO = ChainNode<'O'>;
export type NodeP = ChainNode<'P'>;
export type NodeQ = ChainNode<'Q'>;
export type NodeR = ChainNode<'R'>;
export type NodeS = ChainNode<'S'>;
export type NodeT = ChainNode<'T'>;
export type NodeU = ChainNode<'U'>;
export type NodeV = ChainNode<'V'>;
export type NodeW = ChainNode<'W'>;
export type NodeX = ChainNode<'X'>;
export type NodeY = ChainNode<'Y'>;
export type NodeZ = ChainNode<'Z'>;
export type NodeAA = ChainNode<'AA'>;
export type NodeAB = ChainNode<'AB'>;
export type NodeAC = ChainNode<'AC'>;
export type NodeAD = ChainNode<'AD'>;
export type NodeAE = ChainNode<'AE'>;
export type NodeAF = ChainNode<'AF'>;
export type NodeAG = ChainNode<'AG'>;
export type NodeAH = ChainNode<'AH'>;
export type NodeAI = ChainNode<'AI'>;
export type NodeAJ = ChainNode<'AJ'>;
export type NodeAK = ChainNode<'AK'>;
export type NodeAL = ChainNode<'AL'>;
export type NodeAM = ChainNode<'AM'>;
export type NodeAN = ChainNode<'AN'>;

export type NodeChainDepth =
  | NodeA
  | NodeB
  | NodeC
  | NodeD
  | NodeE
  | NodeF
  | NodeG
  | NodeH
  | NodeI
  | NodeJ
  | NodeK
  | NodeL
  | NodeM
  | NodeN
  | NodeO
  | NodeP
  | NodeQ
  | NodeR
  | NodeS
  | NodeT
  | NodeU
  | NodeV
  | NodeW
  | NodeX
  | NodeY
  | NodeZ
  | NodeAA
  | NodeAB
  | NodeAC
  | NodeAD
  | NodeAE
  | NodeAF
  | NodeAG
  | NodeAH
  | NodeAI
  | NodeAJ
  | NodeAK
  | NodeAL
  | NodeAM
  | NodeAN;

export type WalkNode<T extends ChainNode> = T extends { next: infer Next }
  ? Next extends ChainNode
    ? [T, ...WalkNode<Next>]
    : [T]
  : [T];

export interface GenericLayer<T extends string = 'root', D extends number = 1> {
  readonly tag: T;
  readonly domain: 'domain';
  readonly depth: D;
}

export interface HierarchyCell<TTag extends string = 'root', TDepth extends number = 1> extends GenericLayer<TTag, TDepth> {
  readonly children: ReadonlyArray<HierarchyCell<string, number>>;
}

export interface HierarchyCellA<T extends string = 'A', TParent extends HierarchyCell<string, number> = HierarchyCell<'root', 1>> extends HierarchyCell<T, 1> {
  readonly parent?: TParent;
}

export interface HierarchyCellB<T extends string = 'B', TParent extends HierarchyCell<string, number> = HierarchyCellA<'A'>> extends HierarchyCell<T, 2> {
  readonly parent: TParent;
}

export interface HierarchyCellC<T extends string = 'C', TParent extends HierarchyCell<string, number> = HierarchyCellB<'B'>> extends HierarchyCell<T, 3> {
  readonly parent: TParent;
}

export interface HierarchyCellD<T extends string = 'D', TParent extends HierarchyCell<string, number> = HierarchyCellC<'C'>> extends HierarchyCell<T, 4> {
  readonly parent: TParent;
}

export interface HierarchyCellE<T extends string = 'E', TParent extends HierarchyCell<string, number> = HierarchyCellD<'D'>> extends HierarchyCell<T, 5> {
  readonly parent: TParent;
}

export interface HierarchyCellF<T extends string = 'F', TParent extends HierarchyCell<string, number> = HierarchyCellE<'E'>> extends HierarchyCell<T, 6> {
  readonly parent: TParent;
}

export type HierarchyDeepChain =
  HierarchyCellA<'A'> &
  { readonly children: readonly HierarchyCellB<'B'>[] } &
  { readonly children: readonly HierarchyCellC<'C'>[] };

export type LongChain = WalkNode<{ name: 'A'; index: 1; next: { name: 'B'; index: 2; next: { name: 'C'; index: 3 } } }>;

export interface StructuralCompatibility<T extends readonly ChainNode[]> {
  readonly level: T['length'];
  readonly payload: T extends readonly [any, ...infer Rest]
    ? Rest extends readonly ChainNode[]
      ? { readonly depth: T['length']; readonly trace: { readonly name: 'A'; readonly domain: 'layer-4'; readonly value: number } }
      : never
    : never;
}

export type CompatibilityChain<T extends readonly ChainNode[]> = StructuralCompatibility<T>;

export interface DeepHierarchyNode<T extends number = 1> {
  readonly name: string;
  readonly depth: T;
  readonly trace: {
    readonly name: 'A' | 'B' | 'C' | 'D' | 'E';
    readonly domain: 'depth';
    readonly value: number;
  };
  readonly nested?: T extends 40 ? never : DeepHierarchyNode<Increment<T>>;
}

type Increment<T extends number> = T extends 39 ? 40 : T extends 1 ? 2 : T extends 2 ? 3 : T extends 3 ? 4 : T extends 4 ? 5 : T extends 5 ? 6 : T extends 6 ? 7 : T extends 7 ? 8 : T extends 8 ? 9 : 10;

export type ChainEnvelope<T extends number = 1> =
  T extends 40
    ? { readonly resolved: true; readonly terminal: { index: T } }
    : { readonly resolved: false; readonly nested: ChainEnvelope<Increment<T>> };

export const materializeChain = (depth: number): ChainEnvelope<1> => {
  const walk = (level: number): unknown =>
    level >= 40 ? { resolved: true, terminal: { index: level } } : { resolved: false, nested: walk(level + 1) };
  return walk(depth) as ChainEnvelope<1>;
};

export const deepHierarchyPayload: DeepHierarchyNode = {
  name: 'A',
  depth: 1,
  trace: {
    name: 'A',
    domain: 'depth',
    value: 1,
  },
  nested: {
    name: 'B',
    depth: 2,
    trace: {
      name: 'B',
      domain: 'depth',
      value: 2,
    },
    nested: {
      name: 'C',
      depth: 3,
      trace: {
        name: 'C',
        domain: 'depth',
        value: 3,
      },
      nested: {
        name: 'D',
        depth: 4,
        trace: {
          name: 'D',
          domain: 'depth',
          value: 4,
        },
      },
    },
  },
};

export const walkChain = <T extends NodeChainDepth>(start: T): ReadonlyArray<T['name']> => {
  return [start.name as T['name']];
};

export const longChainNodes = Array.from({ length: 40 }, (_, index) => ({
  name: String.fromCharCode(65 + (index % 26)),
  index: index + 1,
  next: undefined,
})) as unknown as readonly NodeChainDepth[];
