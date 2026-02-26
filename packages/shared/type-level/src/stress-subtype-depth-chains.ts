export interface ProtoLayer1 {
  readonly tier: string;
  readonly depth1: 1;
  readonly marker: number;
  readonly layerHash: string;
}

export interface ProtoLayer2 extends ProtoLayer1 {
  readonly depth2: 2;
}

export interface ProtoLayer3 extends ProtoLayer2 {
  readonly depth3: 3;
}

export interface ProtoLayer4 extends ProtoLayer3 {
  readonly depth4: 4;
}

export interface ProtoLayer5 extends ProtoLayer4 {
  readonly depth5: 5;
}

export interface ProtoLayer6 extends ProtoLayer5 {
  readonly depth6: 6;
}

export interface ProtoLayer7 extends ProtoLayer6 {
  readonly depth7: 7;
}

export interface ProtoLayer8 extends ProtoLayer7 {
  readonly depth8: 8;
}

export interface ProtoLayer9 extends ProtoLayer8 {
  readonly depth9: 9;
}

export interface ProtoLayer10 extends ProtoLayer9 {
  readonly depth10: 10;
}

export interface ProtoLayer11 extends ProtoLayer10 {
  readonly depth11: 11;
}

export interface ProtoLayer12 extends ProtoLayer11 {
  readonly depth12: 12;
}

export interface ProtoLayer13 extends ProtoLayer12 {
  readonly depth13: 13;
}

export interface ProtoLayer14 extends ProtoLayer13 {
  readonly depth14: 14;
}

export interface ProtoLayer15 extends ProtoLayer14 {
  readonly depth15: 15;
}

export interface ProtoLayer16 extends ProtoLayer15 {
  readonly depth16: 16;
}

export interface ProtoLayer17 extends ProtoLayer16 {
  readonly depth17: 17;
}

export interface ProtoLayer18 extends ProtoLayer17 {
  readonly depth18: 18;
}

export interface ProtoLayer19 extends ProtoLayer18 {
  readonly depth19: 19;
}

export interface ProtoLayer20 extends ProtoLayer19 {
  readonly depth20: 20;
}

export interface ProtoLayer21 extends ProtoLayer20 {
  readonly depth21: 21;
}

export interface ProtoLayer22 extends ProtoLayer21 {
  readonly depth22: 22;
}

export interface ProtoLayer23 extends ProtoLayer22 {
  readonly depth23: 23;
}

export interface ProtoLayer24 extends ProtoLayer23 {
  readonly depth24: 24;
}

export interface ProtoLayer25 extends ProtoLayer24 {
  readonly depth25: 25;
}

export interface ProtoLayer26 extends ProtoLayer25 {
  readonly depth26: 26;
}

export interface ProtoLayer27 extends ProtoLayer26 {
  readonly depth27: 27;
}

export interface ProtoLayer28 extends ProtoLayer27 {
  readonly depth28: 28;
}

export interface ProtoLayer29 extends ProtoLayer28 {
  readonly depth29: 29;
}

export interface ProtoLayer30 extends ProtoLayer29 {
  readonly depth30: 30;
}

export interface ProtoLayer31 extends ProtoLayer30 {
  readonly depth31: 31;
}

export interface ProtoLayer32 extends ProtoLayer31 {
  readonly depth32: 32;
}

export interface ProtoLayer33 extends ProtoLayer32 {
  readonly depth33: 33;
}

export interface ProtoLayer34 extends ProtoLayer33 {
  readonly depth34: 34;
}

export interface ProtoLayer35 extends ProtoLayer34 {
  readonly depth35: 35;
}

export interface ProtoLayer36 extends ProtoLayer35 {
  readonly depth36: 36;
}

export interface ProtoLayer37 extends ProtoLayer36 {
  readonly depth37: 37;
}

export interface ProtoLayer38 extends ProtoLayer37 {
  readonly depth38: 38;
}

export interface ProtoLayer39 extends ProtoLayer38 {
  readonly depth39: 39;
}

export interface ProtoLayer40 extends ProtoLayer39 {
  readonly depth40: 40;
}

export type ProtoTerminal = ProtoLayer40;

export type ProtoDepthSignature<T extends ProtoLayer1> =
  T extends ProtoLayer40
    ? 'L40-deep'
    : T extends ProtoLayer30
      ? 'L30-deep'
      : T extends ProtoLayer20
        ? 'L20-deep'
        : T extends ProtoLayer10
          ? 'L10-deep'
          : 'L1-deep';

export type LayeredHierarchy<T extends ProtoLayer1> = {
  readonly marker: T['marker'];
  readonly signature: ProtoDepthSignature<T>;
};

export type LayeredState<T extends ProtoLayer1> = {
  readonly marker: T['depth1'];
  readonly signature: ProtoDepthSignature<T>;
  readonly path: readonly number[];
};

export type DecrementLevel<T extends number> = T extends 0
  ? 0
  : T extends 1
    ? 0
    : T extends 2
      ? 1
      : T extends 3
        ? 2
        : T extends 4
          ? 3
          : T extends 5
            ? 4
            : T extends 6
              ? 5
              : T extends 7
                ? 6
                : T extends 8
                  ? 7
                  : T extends 9
                    ? 8
                    : T extends 10
                      ? 9
                      : T extends 11
                        ? 10
                        : T extends 12
                          ? 11
                          : T extends 13
                            ? 12
                            : T extends 14
                              ? 13
                              : T extends 15
                                ? 14
                                : T extends 16
                                  ? 15
                                  : T extends 17
                                    ? 16
                                    : T extends 18
                                      ? 17
                                      : T extends 19
                                        ? 18
                                        : T extends 20
                                          ? 19
                                          : T extends 21
                                            ? 20
                                            : T extends 22
                                              ? 21
                                              : T extends 23
                                                ? 22
                                                : T extends 24
                                                  ? 23
                                                  : T extends 25
                                                    ? 24
                                                    : T extends 26
                                                      ? 25
                                                      : T extends 27
                                                        ? 26
                                                        : T extends 28
                                                          ? 27
                                                          : T extends 29
                                                            ? 28
                                                            : T extends 30
                                                              ? 29
                                                              : T extends 31
                                                                ? 30
                                                                : T extends 32
                                                                  ? 31
                                                                  : T extends 33
                                                                    ? 32
                                                                    : T extends 34
                                                                      ? 33
                                                                      : T extends 35
                                                                        ? 34
                                                                        : T extends 36
                                                                          ? 35
                                                                          : T extends 37
                                                                            ? 36
                                                                            : T extends 38
                                                                              ? 37
                                                                              : T extends 39
                                                                                ? 38
                                                                                : T extends 40
                                                                                  ? 39
                                                                                  : 39;

export type LayeredChainStep<T extends ProtoLayer1> = T extends ProtoLayer40
  ? T
  : ProtoLayer1;

class NodeDepth<TScope extends string, TState extends ProtoLayer1 = ProtoLayer1> {
  constructor(
    protected readonly scope: TScope,
    protected readonly sequence: number,
    protected readonly state: TState,
  ) {}

  getScope(): TScope {
    return this.scope;
  }

  protected next(): number {
    return this.sequence + 1;
  }
}

export class HierarchyNode1<TScope extends string, TState extends ProtoLayer1 = ProtoLayer1> extends NodeDepth<TScope, TState> {
  readonly layer = 'node1';
  readonly profile = this.state.depth1;
}

export class HierarchyNode2<TScope extends string, TState extends ProtoLayer2 = ProtoLayer2> extends HierarchyNode1<TScope, TState> {
}

export class HierarchyNode3<TScope extends string, TState extends ProtoLayer3 = ProtoLayer3> extends HierarchyNode2<TScope, TState> {
}

export class HierarchyNode4<TScope extends string, TState extends ProtoLayer4 = ProtoLayer4> extends HierarchyNode3<TScope, TState> {
}

export class HierarchyNode5<TScope extends string, TState extends ProtoLayer5 = ProtoLayer5> extends HierarchyNode4<TScope, TState> {
}

export class HierarchyNode6<TScope extends string, TState extends ProtoLayer6 = ProtoLayer6> extends HierarchyNode5<TScope, TState> {
}

export class HierarchyNode7<TScope extends string, TState extends ProtoLayer7 = ProtoLayer7> extends HierarchyNode6<TScope, TState> {
}

export class HierarchyNode8<TScope extends string, TState extends ProtoLayer8 = ProtoLayer8> extends HierarchyNode7<TScope, TState> {
}

export class HierarchyNode9<TScope extends string, TState extends ProtoLayer9 = ProtoLayer9> extends HierarchyNode8<TScope, TState> {
}

export class HierarchyNode10<TScope extends string, TState extends ProtoLayer10 = ProtoLayer10> extends HierarchyNode9<TScope, TState> {
}

export const walkHierarchyDepth = <TNode extends ProtoLayer1>(node: TNode): LayeredHierarchy<TNode> => {
  const maybeDeep = node as TNode & { readonly depth10?: number; readonly depth20?: number; readonly depth30?: number; readonly depth40?: number };
  const signature = (
    maybeDeep.depth40 === 40
      ? 'L40-deep'
      : maybeDeep.depth30 === 30
        ? 'L30-deep'
        : maybeDeep.depth20 === 20
          ? 'L20-deep'
          : maybeDeep.depth10 === 10
            ? 'L10-deep'
            : 'L1-deep'
  ) as ProtoDepthSignature<TNode>;

  return {
    marker: node.marker,
    signature,
  };
};

export const deepChainNode = new HierarchyNode10('stress-domain', 10, {
  tier: 'L1',
  depth1: 1,
  depth2: 2,
  depth3: 3,
  depth4: 4,
  depth5: 5,
  depth6: 6,
  depth7: 7,
  depth8: 8,
  depth9: 9,
  depth10: 10,
  marker: 10,
  layerHash: 'h10',
} as unknown as ProtoLayer10);

export const deepProto = {
  terminal: undefined as unknown as ProtoTerminal,
  profile: walkHierarchyDepth({
    tier: 'L1',
    depth1: 1,
    depth2: 2,
    depth3: 3,
    depth4: 4,
    depth5: 5,
    depth6: 6,
    depth7: 7,
    depth8: 8,
    depth9: 9,
    depth10: 10,
    marker: 10,
    layerHash: 'h10',
  } as unknown as ProtoLayer10),
};

export type DeepLayerState = ReturnType<typeof walkHierarchyDepth>;
