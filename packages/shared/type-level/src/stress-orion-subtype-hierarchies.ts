export interface OrbiNodeBase {
  readonly depth: number;
  readonly marker: 'root';
  readonly stage: number;
  readonly key: string;
}

export interface OrbiNodeOne extends OrbiNodeBase {
}
export interface OrbiNodeTwo extends OrbiNodeOne {
}
export interface OrbiNodeThree extends OrbiNodeTwo {
}
export interface OrbiNodeFour extends OrbiNodeThree {
}
export interface OrbiNodeFive extends OrbiNodeFour {
}
export interface OrbiNodeSix extends OrbiNodeFive {
}
export interface OrbiNodeSeven extends OrbiNodeSix {
}
export interface OrbiNodeEight extends OrbiNodeSeven {
}
export interface OrbiNodeNine extends OrbiNodeEight {
}
export interface OrbiNodeTen extends OrbiNodeNine {
}
export interface OrbiNodeEleven extends OrbiNodeTen {
}
export interface OrbiNodeTwelve extends OrbiNodeEleven {
}
export interface OrbiNodeThirteen extends OrbiNodeTwelve {
}
export interface OrbiNodeFourteen extends OrbiNodeThirteen {
}
export interface OrbiNodeFifteen extends OrbiNodeFourteen {
}
export interface OrbiNodeSixteen extends OrbiNodeFifteen {
}
export interface OrbiNodeSeventeen extends OrbiNodeSixteen {
}
export interface OrbiNodeEighteen extends OrbiNodeSeventeen {
}
export interface OrbiNodeNineteen extends OrbiNodeEighteen {
}
export interface OrbiNodeTwenty extends OrbiNodeNineteen {
}
export interface OrbiNodeTwentyOne extends OrbiNodeTwenty {
}
export interface OrbiNodeTwentyTwo extends OrbiNodeTwentyOne {
}
export interface OrbiNodeTwentyThree extends OrbiNodeTwentyTwo {
}
export interface OrbiNodeTwentyFour extends OrbiNodeTwentyThree {
}
export interface OrbiNodeTwentyFive extends OrbiNodeTwentyFour {
}
export interface OrbiNodeTwentySix extends OrbiNodeTwentyFive {
}
export interface OrbiNodeTwentySeven extends OrbiNodeTwentySix {
}
export interface OrbiNodeTwentyEight extends OrbiNodeTwentySeven {
}
export interface OrbiNodeTwentyNine extends OrbiNodeTwentyEight {
}
export interface OrbiNodeThirty extends OrbiNodeTwentyNine {
}
export interface OrbiNodeThirtyOne extends OrbiNodeThirty {
}
export interface OrbiNodeThirtyTwo extends OrbiNodeThirtyOne {
}
export interface OrbiNodeThirtyThree extends OrbiNodeThirtyTwo {
}
export interface OrbiNodeThirtyFour extends OrbiNodeThirtyThree {
}
export interface OrbiNodeThirtyFive extends OrbiNodeThirtyFour {
}
export interface OrbiNodeThirtySix extends OrbiNodeThirtyFive {
}
export interface OrbiNodeThirtySeven extends OrbiNodeThirtySix {
}
export interface OrbiNodeThirtyEight extends OrbiNodeThirtySeven {
}
export interface OrbiNodeThirtyNine extends OrbiNodeThirtyEight {
}
export interface OrbiNodeForty extends OrbiNodeThirtyNine {
}

export type NodeDepth = OrbiNodeOne | OrbiNodeTwo | OrbiNodeThree | OrbiNodeFour | OrbiNodeFive | OrbiNodeSix | OrbiNodeSeven | OrbiNodeEight | OrbiNodeNine | OrbiNodeTen | OrbiNodeEleven | OrbiNodeTwelve | OrbiNodeThirteen | OrbiNodeFourteen | OrbiNodeFifteen | OrbiNodeSixteen | OrbiNodeSeventeen | OrbiNodeEighteen | OrbiNodeNineteen | OrbiNodeTwenty | OrbiNodeTwentyOne | OrbiNodeTwentyTwo | OrbiNodeTwentyThree | OrbiNodeTwentyFour | OrbiNodeTwentyFive | OrbiNodeTwentySix | OrbiNodeTwentySeven | OrbiNodeTwentyEight | OrbiNodeTwentyNine | OrbiNodeThirty | OrbiNodeThirtyOne | OrbiNodeThirtyTwo | OrbiNodeThirtyThree | OrbiNodeThirtyFour | OrbiNodeThirtyFive | OrbiNodeThirtySix | OrbiNodeThirtySeven | OrbiNodeThirtyEight | OrbiNodeThirtyNine | OrbiNodeForty;

export type Decrement<T extends number> = [
  never,
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
  20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
  30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
  40,
][T];

type NextStage<T extends OrbiNodeBase> =
  T extends OrbiNodeForty ? OrbiNodeForty
  : T extends OrbiNodeThirtyNine ? OrbiNodeForty
  : T extends OrbiNodeThirtyEight ? OrbiNodeThirtyNine
  : T extends OrbiNodeThirtySeven ? OrbiNodeThirtyEight
  : T extends OrbiNodeThirtySix ? OrbiNodeThirtySeven
  : T extends OrbiNodeThirtyFive ? OrbiNodeThirtySix
  : T extends OrbiNodeThirtyFour ? OrbiNodeThirtyFive
  : T extends OrbiNodeThirtyThree ? OrbiNodeThirtyFour
  : T extends OrbiNodeThirtyTwo ? OrbiNodeThirtyThree
  : T extends OrbiNodeThirtyOne ? OrbiNodeThirtyTwo
  : T extends OrbiNodeThirty ? OrbiNodeThirtyOne
  : T extends OrbiNodeTwentyNine ? OrbiNodeThirty
  : T extends OrbiNodeTwentyEight ? OrbiNodeTwentyNine
  : T extends OrbiNodeTwentySeven ? OrbiNodeTwentyEight
  : T extends OrbiNodeTwentySix ? OrbiNodeTwentySeven
  : T extends OrbiNodeTwentyFive ? OrbiNodeTwentySix
  : T extends OrbiNodeTwentyFour ? OrbiNodeTwentyFive
  : T extends OrbiNodeTwentyThree ? OrbiNodeTwentyFour
  : T extends OrbiNodeTwentyTwo ? OrbiNodeTwentyThree
  : T extends OrbiNodeTwentyOne ? OrbiNodeTwentyTwo
  : T extends OrbiNodeTwenty ? OrbiNodeTwentyOne
  : T extends OrbiNodeNineteen ? OrbiNodeTwenty
  : T extends OrbiNodeEighteen ? OrbiNodeNineteen
  : T extends OrbiNodeSeventeen ? OrbiNodeEighteen
  : T extends OrbiNodeSixteen ? OrbiNodeSeventeen
  : T extends OrbiNodeFifteen ? OrbiNodeSixteen
  : T extends OrbiNodeFourteen ? OrbiNodeFifteen
  : T extends OrbiNodeThirteen ? OrbiNodeFourteen
  : T extends OrbiNodeTwelve ? OrbiNodeThirteen
  : T extends OrbiNodeEleven ? OrbiNodeTwelve
  : T extends OrbiNodeTen ? OrbiNodeEleven
  : T extends OrbiNodeNine ? OrbiNodeTen
  : T extends OrbiNodeEight ? OrbiNodeNine
  : T extends OrbiNodeSeven ? OrbiNodeEight
  : T extends OrbiNodeSix ? OrbiNodeSeven
  : T extends OrbiNodeFive ? OrbiNodeSix
  : T extends OrbiNodeFour ? OrbiNodeFive
  : T extends OrbiNodeThree ? OrbiNodeFour
  : T extends OrbiNodeTwo ? OrbiNodeThree
  : OrbiNodeTwo;

export type NodeDepthMap<T extends OrbiNodeBase, N extends number = 40> = N extends 0
  ? T
  : T extends OrbiNodeForty
    ? T
    : NodeDepthMap<NextStage<T>, Decrement<N>>;

export type OrbiChainDepth = {
  readonly node: NodeDepth;
  readonly next: NodeDepth | null;
};

export type NodeResolver<T extends OrbiNodeBase> =
  T extends OrbiNodeForty
    ? 'max'
    : T extends OrbiNodeThirty | OrbiNodeThirtyOne | OrbiNodeThirtyTwo | OrbiNodeThirtyThree | OrbiNodeThirtyFour | OrbiNodeThirtyFive
      ? 'high'
      : T extends OrbiNodeTwenty | OrbiNodeTwentyOne | OrbiNodeTwentyTwo
        ? 'mid'
        : 'low';

export type StageTuple = NodeDepthMap<OrbiNodeOne, 40>;
export type StageKey<T extends NodeDepthMap<OrbiNodeOne, 40>> = T['key'];
export type StageLineage<T extends OrbiNodeBase> = readonly [OrbiNodeBase, T];

export type StageRange<T extends OrbiNodeBase> = T extends { stage: infer N extends number }
  ? `${N}-${N extends 0 ? 'zero' : N extends 40 ? 'max' : 'mid'}`
  : never;

export type OrbiKernelConfig = {
  readonly marker: 'kernel';
  readonly mode: 'strict' | 'adaptive';
};

export class OrbiKernel<TDepth extends OrbiNodeBase = OrbiNodeForty> {
  readonly root: TDepth;
  readonly depth: TDepth['stage'];
  readonly marker = 'root' as const;
  readonly mode: OrbiKernelConfig['mode'];

  constructor(root: TDepth, mode: OrbiKernelConfig['mode'] = 'adaptive') {
    this.root = root;
    this.depth = root.stage;
    this.mode = mode;
  }

  readonly lineage = (): readonly TDepth[] => [this.root];
  get profile(): { readonly scale: 'apex' | 'high' | 'low'; readonly depth: 'max' | 'mid' | 'shallow' } {
    return (
      this.depth >= 40 ? { scale: 'apex', depth: 'max' } : { scale: 'low', depth: 'shallow' }
    );
  }
}

export class OrbiChainNode<
  T extends OrbiNodeBase = OrbiNodeForty,
  TParent extends OrbiKernel<OrbiNodeBase> = OrbiKernel<OrbiNodeBase>,
> extends OrbiKernel<T> {
  readonly chain: readonly OrbiNodeBase[];
  readonly parent: TParent | null;

  constructor(root: T, parent: TParent | null = null) {
    super(root, 'adaptive');
    this.chain = parent ? [...parent.lineage(), root] : [root];
    this.parent = parent;
  }

  append<TNext extends OrbiNodeBase>(next: TNext): OrbiChainNode<TNext, OrbiChainNode<T, TParent>> {
    const nextNode = new OrbiChainNode<TNext, OrbiChainNode<T, TParent>>(next, this);
    return nextNode;
  }
}

export class OrbiChainOne<T extends OrbiNodeOne = OrbiNodeOne> extends OrbiChainNode<T> {
  readonly keyOne: T['key'];
  constructor(root: T) {
    super(root, null);
    this.keyOne = root.key;
  }
}

export class OrbiChainTwo<T extends OrbiNodeTwo = OrbiNodeTwo> extends OrbiChainOne<OrbiNodeTwo> {
  readonly keyTwo: T['key'];
  readonly parent: OrbiChainOne<OrbiNodeOne>;
  constructor(root: T, parent: OrbiChainOne<OrbiNodeOne>) {
    super(parent.root);
    this.keyTwo = root.key;
    this.parent = parent;
  }
}

export class OrbiChainThree<T extends OrbiNodeThree = OrbiNodeThree> extends OrbiChainTwo<OrbiNodeTwo> {
  readonly keyThree: T['key'];
  readonly ancestor: OrbiChainTwo<OrbiNodeTwo>;
  constructor(root: T, parent: OrbiChainTwo<OrbiNodeTwo>) {
    super(parent.root, parent);
    this.keyThree = root.key;
    this.ancestor = parent;
  }
}

export class OrbiChainFour<T extends OrbiNodeFour = OrbiNodeFour> extends OrbiChainThree<OrbiNodeThree> {
  readonly keyFour: T['key'];
  readonly ancestor: OrbiChainThree<OrbiNodeThree>;
  constructor(root: T, parent: OrbiChainThree<OrbiNodeThree>) {
    super(parent.root, parent);
    this.keyFour = root.key;
    this.ancestor = parent;
  }
}

export class OrbiChainFive<T extends OrbiNodeFive = OrbiNodeFive> extends OrbiChainFour<OrbiNodeFour> {
  readonly keyFive: T['key'];
  readonly ancestors: readonly [string, string, string];
  constructor(root: T, parent: OrbiChainFour<OrbiNodeFour>) {
    super(parent.root, parent);
    this.keyFive = root.key;
    this.ancestors = [parent.root.key, root.key, parent.root.key];
  }
}

export class OrbiChainSix<T extends OrbiNodeSix = OrbiNodeSix> extends OrbiChainFive<OrbiNodeFive> {
  readonly keySix: T['key'];
  constructor(root: T, parent: OrbiChainFive<OrbiNodeFive>) {
    super(parent.root, parent);
    this.keySix = root.key;
  }
}

export class OrbiChainSeven<T extends OrbiNodeSeven = OrbiNodeSeven> extends OrbiChainSix<OrbiNodeSix> {
  readonly keySeven: T['key'];
  constructor(root: T, parent: OrbiChainSix<OrbiNodeSix>) {
    super(parent.root, parent);
    this.keySeven = root.key;
  }
}

export class OrbiChainEight<T extends OrbiNodeEight = OrbiNodeEight> extends OrbiChainSeven<OrbiNodeSeven> {
  readonly keyEight: T['key'];
  constructor(root: T, parent: OrbiChainSeven<OrbiNodeSeven>) {
    super(parent.root, parent);
    this.keyEight = root.key;
  }
}

export type DeepSubtypeChain =
  | OrbiChainNode<OrbiNodeForty>
  | OrbiChainNode<OrbiNodeThirtyNine>
  | OrbiChainNode<OrbiNodeThirtyEight>
  | OrbiChainNode<OrbiNodeThirtySeven>
  | OrbiChainNode<OrbiNodeThirtySix>
  | OrbiChainNode<OrbiNodeThirtyFive>
  | OrbiChainNode<OrbiNodeThirtyFour>
  | OrbiChainNode<OrbiNodeThirtyThree>
  | OrbiChainNode<OrbiNodeThirtyTwo>
  | OrbiChainNode<OrbiNodeThirtyOne>
  | OrbiChainNode<OrbiNodeThirty>
  | OrbiChainNode<OrbiNodeTwentyNine>
  | OrbiChainNode<OrbiNodeTwentyEight>
  | OrbiChainNode<OrbiNodeTwentySeven>
  | OrbiChainNode<OrbiNodeTwentySix>
  | OrbiChainNode<OrbiNodeTwentyFive>
  | OrbiChainNode<OrbiNodeTwentyFour>
  | OrbiChainNode<OrbiNodeTwentyThree>
  | OrbiChainNode<OrbiNodeTwentyTwo>
  | OrbiChainNode<OrbiNodeTwentyOne>
  | OrbiChainNode<OrbiNodeTwenty>
  | OrbiChainNode<OrbiNodeNineteen>
  | OrbiChainNode<OrbiNodeEighteen>
  | OrbiChainNode<OrbiNodeSeventeen>
  | OrbiChainNode<OrbiNodeSixteen>
  | OrbiChainNode<OrbiNodeFifteen>
  | OrbiChainNode<OrbiNodeFourteen>
  | OrbiChainNode<OrbiNodeThirteen>
  | OrbiChainNode<OrbiNodeTwelve>
  | OrbiChainNode<OrbiNodeEleven>
  | OrbiChainNode<OrbiNodeTen>
  | OrbiChainNode<OrbiNodeNine>
  | OrbiChainNode<OrbiNodeEight>
  | OrbiChainNode<OrbiNodeSeven>
  | OrbiChainNode<OrbiNodeSix>
  | OrbiChainNode<OrbiNodeFive>
  | OrbiChainNode<OrbiNodeFour>
  | OrbiChainNode<OrbiNodeThree>
  | OrbiChainNode<OrbiNodeTwo>
  | OrbiChainNode<OrbiNodeOne>;

export type NodeResolverChain = 'max' | 'high' | 'mid' | 'low';

export type RecursiveDepthClassifier<T extends OrbiNodeBase, N extends number = 40> =
  N extends 0 ? T : RecursiveDepthClassifier<NodeDepthMap<T, N>, Decrement<N>>;

export type NodeSpanSignature<T extends OrbiNodeBase> = `${T['key']}-${T['stage']}`;
export const isHighLayer = (node: OrbiNodeBase): boolean => node.stage >= 30;
export const isMidLayer = (node: OrbiNodeBase): boolean => node.stage >= 15 && node.stage < 30;
export const isLowLayer = (node: OrbiNodeBase): boolean => node.stage < 15;

export const classifyLayer = (node: OrbiNodeBase): NodeResolverChain =>
  isHighLayer(node) ? 'high' : isMidLayer(node) ? 'mid' : 'low';

export const stageToTuple = (node: OrbiNodeBase): readonly [string, number] => [node.key, node.stage];

export const buildHierarchy = (): DeepSubtypeChain => {
  const root: OrbiNodeForty = { depth: 40, marker: 'root', stage: 40, key: 'forty' };
  const two: OrbiNodeTwo = { depth: 2, marker: 'root', stage: 2, key: 'two' };
  const level2 = new OrbiChainOne(two);
  const level3 = new OrbiChainTwo(
    { depth: 3, marker: 'root', stage: 3, key: 'three' },
    level2,
  );
  const level4 = new OrbiChainThree(
    { depth: 4, marker: 'root', stage: 4, key: 'four' },
    level3,
  );
  const level5 = new OrbiChainFour(
    { depth: 5, marker: 'root', stage: 5, key: 'five' },
    level4,
  );
  const level6 = new OrbiChainFive(
    { depth: 6, marker: 'root', stage: 6, key: 'six' },
    level5,
  );
  const level7 = new OrbiChainSix(
    { depth: 7, marker: 'root', stage: 7, key: 'seven' },
    level6,
  );
  const level8 = new OrbiChainSeven(
    { depth: 8, marker: 'root', stage: 8, key: 'eight' },
    level7,
  );
  const node = new OrbiChainEight(
    { depth: 8, marker: 'root', stage: 8, key: 'eight' },
    level8,
  );
  return node as DeepSubtypeChain;
};
