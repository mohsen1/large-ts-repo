export interface ChainPayloadBase {
  readonly version: 1;
}

export type DeepChainNode0 = {
  readonly marker: string;
  readonly depth: 0;
  readonly parent?: never;
};

export type DeepChainNode1 = DeepChainNode0 & {
  readonly marker: `node-${1}`;
  readonly depth: 1;
  readonly parent: DeepChainNode0;
};
export type DeepChainNode2 = DeepChainNode1 & {
  readonly marker: `node-${2}`;
  readonly depth: 2;
  readonly parent: DeepChainNode1;
};
export type DeepChainNode3 = DeepChainNode2 & {
  readonly marker: `node-${3}`;
  readonly depth: 3;
  readonly parent: DeepChainNode2;
};
export type DeepChainNode4 = DeepChainNode3 & {
  readonly marker: `node-${4}`;
  readonly depth: 4;
  readonly parent: DeepChainNode3;
};
export type DeepChainNode5 = DeepChainNode4 & {
  readonly marker: `node-${5}`;
  readonly depth: 5;
  readonly parent: DeepChainNode4;
};
export type DeepChainNode6 = DeepChainNode5 & {
  readonly marker: `node-${6}`;
  readonly depth: 6;
  readonly parent: DeepChainNode5;
};
export type DeepChainNode7 = DeepChainNode6 & {
  readonly marker: `node-${7}`;
  readonly depth: 7;
  readonly parent: DeepChainNode6;
};
export type DeepChainNode8 = DeepChainNode7 & {
  readonly marker: `node-${8}`;
  readonly depth: 8;
  readonly parent: DeepChainNode7;
};
export type DeepChainNode9 = DeepChainNode8 & {
  readonly marker: `node-${9}`;
  readonly depth: 9;
  readonly parent: DeepChainNode8;
};
export type DeepChainNode10 = DeepChainNode9 & {
  readonly marker: `node-${10}`;
  readonly depth: 10;
  readonly parent: DeepChainNode9;
};
export type DeepChainNode11 = DeepChainNode10 & {
  readonly marker: `node-${11}`;
  readonly depth: 11;
  readonly parent: DeepChainNode10;
};
export type DeepChainNode12 = DeepChainNode11 & {
  readonly marker: `node-${12}`;
  readonly depth: 12;
  readonly parent: DeepChainNode11;
};
export type DeepChainNode13 = DeepChainNode12 & {
  readonly marker: `node-${13}`;
  readonly depth: 13;
  readonly parent: DeepChainNode12;
};
export type DeepChainNode14 = DeepChainNode13 & {
  readonly marker: `node-${14}`;
  readonly depth: 14;
  readonly parent: DeepChainNode13;
};
export type DeepChainNode15 = DeepChainNode14 & {
  readonly marker: `node-${15}`;
  readonly depth: 15;
  readonly parent: DeepChainNode14;
};
export type DeepChainNode16 = DeepChainNode15 & {
  readonly marker: `node-${16}`;
  readonly depth: 16;
  readonly parent: DeepChainNode15;
};
export type DeepChainNode17 = DeepChainNode16 & {
  readonly marker: `node-${17}`;
  readonly depth: 17;
  readonly parent: DeepChainNode16;
};
export type DeepChainNode18 = DeepChainNode17 & {
  readonly marker: `node-${18}`;
  readonly depth: 18;
  readonly parent: DeepChainNode17;
};
export type DeepChainNode19 = DeepChainNode18 & {
  readonly marker: `node-${19}`;
  readonly depth: 19;
  readonly parent: DeepChainNode18;
};
export type DeepChainNode20 = DeepChainNode19 & {
  readonly marker: `node-${20}`;
  readonly depth: 20;
  readonly parent: DeepChainNode19;
};
export type DeepChainNode21 = DeepChainNode20 & {
  readonly marker: `node-${21}`;
  readonly depth: 21;
  readonly parent: DeepChainNode20;
};
export type DeepChainNode22 = DeepChainNode21 & {
  readonly marker: `node-${22}`;
  readonly depth: 22;
  readonly parent: DeepChainNode21;
};
export type DeepChainNode23 = DeepChainNode22 & {
  readonly marker: `node-${23}`;
  readonly depth: 23;
  readonly parent: DeepChainNode22;
};
export type DeepChainNode24 = DeepChainNode23 & {
  readonly marker: `node-${24}`;
  readonly depth: 24;
  readonly parent: DeepChainNode23;
};
export type DeepChainNode25 = DeepChainNode24 & {
  readonly marker: `node-${25}`;
  readonly depth: 25;
  readonly parent: DeepChainNode24;
};
export type DeepChainNode26 = DeepChainNode25 & {
  readonly marker: `node-${26}`;
  readonly depth: 26;
  readonly parent: DeepChainNode25;
};
export type DeepChainNode27 = DeepChainNode26 & {
  readonly marker: `node-${27}`;
  readonly depth: 27;
  readonly parent: DeepChainNode26;
};
export type DeepChainNode28 = DeepChainNode27 & {
  readonly marker: `node-${28}`;
  readonly depth: 28;
  readonly parent: DeepChainNode27;
};
export type DeepChainNode29 = DeepChainNode28 & {
  readonly marker: `node-${29}`;
  readonly depth: 29;
  readonly parent: DeepChainNode28;
};
export type DeepChainNode30 = DeepChainNode29 & {
  readonly marker: `node-${30}`;
  readonly depth: 30;
  readonly parent: DeepChainNode29;
};
export type DeepChainNode31 = DeepChainNode30 & {
  readonly marker: `node-${31}`;
  readonly depth: 31;
  readonly parent: DeepChainNode30;
};
export type DeepChainNode32 = DeepChainNode31 & {
  readonly marker: `node-${32}`;
  readonly depth: 32;
  readonly parent: DeepChainNode31;
};
export type DeepChainNode33 = DeepChainNode32 & {
  readonly marker: `node-${33}`;
  readonly depth: 33;
  readonly parent: DeepChainNode32;
};
export type DeepChainNode34 = DeepChainNode33 & {
  readonly marker: `node-${34}`;
  readonly depth: 34;
  readonly parent: DeepChainNode33;
};
export type DeepChainNode35 = DeepChainNode34 & {
  readonly marker: `node-${35}`;
  readonly depth: 35;
  readonly parent: DeepChainNode34;
};

export type DeepChainUnion =
  | DeepChainNode0
  | DeepChainNode1
  | DeepChainNode2
  | DeepChainNode3
  | DeepChainNode4
  | DeepChainNode5
  | DeepChainNode6
  | DeepChainNode7
  | DeepChainNode8
  | DeepChainNode9
  | DeepChainNode10
  | DeepChainNode11
  | DeepChainNode12
  | DeepChainNode13
  | DeepChainNode14
  | DeepChainNode15
  | DeepChainNode16
  | DeepChainNode17
  | DeepChainNode18
  | DeepChainNode19
  | DeepChainNode20
  | DeepChainNode21
  | DeepChainNode22
  | DeepChainNode23
  | DeepChainNode24
  | DeepChainNode25
  | DeepChainNode26
  | DeepChainNode27
  | DeepChainNode28
  | DeepChainNode29
  | DeepChainNode30
  | DeepChainNode31
  | DeepChainNode32
  | DeepChainNode33
  | DeepChainNode34
  | DeepChainNode35;

export interface JunctionA {
  readonly nodeId: `node-a`;
  readonly nodeType: 'source';
  readonly resource: number;
}
export interface JunctionB {
  readonly nodeId: `node-b`;
  readonly nodeType: 'validator';
  readonly resource: number;
}
export interface JunctionC {
  readonly nodeId: `node-c`;
  readonly nodeType: 'planner';
  readonly resource: number;
}
export interface JunctionD {
  readonly nodeId: `node-d`;
  readonly nodeType: 'planner';
  readonly resource: number;
  readonly shared: { readonly key: 'D'; readonly active: true };
}
export interface JunctionE {
  readonly nodeId: `node-e`;
  readonly nodeType: 'executor';
  readonly shared: { readonly key: 'E'; readonly active: false };
}
export interface JunctionF {
  readonly nodeId: `node-f`;
  readonly nodeType: 'observer';
  readonly shared: { readonly key: 'E'; readonly active: false };
}
export interface JunctionG {
  readonly nodeId: `node-g`;
  readonly nodeType: 'executor';
  readonly resource: number;
}
export interface JunctionH {
  readonly nodeId: `node-h`;
  readonly nodeType: 'signal';
  readonly shared: { readonly key: 'H'; readonly active: true };
}
export interface JunctionI {
  readonly nodeId: `node-i`;
  readonly nodeType: 'signal';
  readonly shared: { readonly key: 'I'; readonly active: true };
}
export interface JunctionJ {
  readonly nodeId: `node-j`;
  readonly nodeType: 'coordinator';
  readonly throttle: number;
}
export interface JunctionK {
  readonly nodeId: `node-k`;
  readonly nodeType: 'coordinator';
  readonly throttle: number;
}
export interface JunctionL {
  readonly nodeId: `node-l`;
  readonly nodeType: 'introspector';
  readonly throttle: number;
}
export interface JunctionM {
  readonly nodeId: `node-m`;
  readonly nodeType: 'introspector';
  readonly auditId: `A-${string}`;
}
export interface JunctionN {
  readonly nodeId: `node-n`;
  readonly nodeType: 'policy';
  readonly auditId: `A-${string}`;
}
export interface JunctionO {
  readonly nodeId: `node-o`;
  readonly nodeType: 'policy';
  readonly auditId: `A-${string}`;
}
export interface JunctionP {
  readonly nodeId: `node-p`;
  readonly nodeType: 'bridge';
}
export interface JunctionQ {
  readonly nodeId: `node-q`;
  readonly nodeType: 'bridge';
  readonly lane: `lane-${number}`;
}
export interface JunctionR {
  readonly nodeId: `node-r`;
  readonly nodeType: 'bridge';
  readonly lane: `lane-${number}`;
}
export interface JunctionS {
  readonly nodeId: `node-s`;
  readonly nodeType: 'inspector';
  readonly lane: `lane-${number}`;
}
export interface JunctionT {
  readonly nodeId: `node-t`;
  readonly nodeType: 'inspector';
  readonly confidence: number;
}
export interface JunctionU {
  readonly nodeId: `node-u`;
  readonly nodeType: 'inspector';
  readonly confidence: number;
}
export interface JunctionV {
  readonly nodeId: `node-v`;
  readonly nodeType: 'ledger';
}
export interface JunctionW {
  readonly nodeId: `node-w`;
  readonly nodeType: 'ledger';
  readonly ledgerTag: `L-${number}`;
}
export interface JunctionX {
  readonly nodeId: `node-x`;
  readonly nodeType: 'ledger';
  readonly ledgerTag: `L-${number}`;
}
export interface JunctionY {
  readonly nodeId: `node-y`;
  readonly nodeType: 'scheduler';
  readonly sequence: readonly number[];
}
export interface JunctionZ {
  readonly nodeId: `node-z`;
  readonly nodeType: 'scheduler';
  readonly sequence: readonly number[];
}
export interface JunctionAA {
  readonly nodeId: `node-aa`;
  readonly nodeType: 'scheduler';
  readonly sequence: readonly number[];
}
export interface JunctionAB {
  readonly nodeId: `node-ab`;
  readonly nodeType: 'telemetry';
  readonly sequence: readonly number[];
}
export interface JunctionAC {
  readonly nodeId: `node-ac`;
  readonly nodeType: 'telemetry';
}
export interface JunctionAD {
  readonly nodeId: `node-ad`;
  readonly nodeType: 'telemetry';
}
export interface JunctionAE {
  readonly nodeId: `node-ae`;
  readonly nodeType: 'command';
}
export interface JunctionAF {
  readonly nodeId: `node-af`;
  readonly nodeType: 'command';
  readonly commandId: `cmd-${string}`;
}
export interface JunctionAG {
  readonly nodeId: `node-ag`;
  readonly nodeType: 'command';
  readonly commandId: `cmd-${string}`;
}
export interface JunctionAH {
  readonly nodeId: `node-ah`;
  readonly nodeType: 'auditor';
  readonly commandId: `cmd-${string}`;
}

export type LatticeIntersection =
  & JunctionA
  & JunctionB
  & JunctionC
  & JunctionD
  & JunctionE
  & JunctionF
  & JunctionG
  & JunctionH
  & JunctionI
  & JunctionJ
  & JunctionK
  & JunctionL
  & JunctionM
  & JunctionN
  & JunctionO
  & JunctionP
  & JunctionQ
  & JunctionR
  & JunctionS
  & JunctionT
  & JunctionU
  & JunctionV
  & JunctionW
  & JunctionX
  & JunctionY
  & JunctionZ
  & JunctionAA
  & JunctionAB
  & JunctionAC
  & JunctionAD
  & JunctionAE
  & JunctionAF
  & JunctionAG
  & JunctionAH;

export type ExtractIntersection<Target extends Record<string, unknown>> = {
  [K in keyof Target as K extends `node-${string}` ? K : never]: Target[K];
};

export type MergeOverlap<TLeft extends object, TRight extends object> = Omit<TLeft, keyof TRight> & TRight;

export type DeepIntersection<Targets extends readonly object[]> =
  Targets extends readonly [infer Head, ...infer Tail]
    ? Head extends object
      ? Tail extends readonly object[]
        ? MergeOverlap<Head, DeepIntersection<Tail>>
        : Head
      : never
    : {};

export type MappedIntersection<TInput extends Record<string, object>> = {
  [K in keyof TInput]:
    TInput[K] extends infer TV
      ? TV & {
          readonly source: K;
          readonly alias: `${Extract<K, string>}-alias`;
          readonly rank: number;
        }
      : never;
};

export const composeIntersection = <TInput extends readonly Record<string, object>[]>(
  input: TInput,
): DeepIntersection<TInput> => {
  let result = {} as Record<string, unknown>;
  for (const current of input) {
    result = { ...result, ...current };
  }
  return result as DeepIntersection<TInput>;
};

export const resolveIntersectionOverlap = <TInput extends Record<string, object>>(
  left: TInput,
  right: TInput,
): MergeOverlap<TInput, TInput> => ({
  ...left,
  ...right,
});

export interface TypedChainNodeBase<TContext extends ChainPayloadBase = ChainPayloadBase> {
  readonly context: TContext;
  readonly parent?: TypedChainNodeBase<TContext>;
  readonly marker: string;
  readonly depth: number;
}

export class TypedChainNode0<TContext extends ChainPayloadBase = ChainPayloadBase> implements TypedChainNodeBase<TContext> {
  public readonly marker: string = 'typed-0';
  public readonly depth: number = 0;
  constructor(readonly context: TContext, public readonly parent?: TypedChainNodeBase<TContext>) {}
}
export class TypedChainNode1<TContext extends ChainPayloadBase = ChainPayloadBase> extends TypedChainNode0<TContext> {
  public readonly marker: string = 'typed-1';
  public readonly depth: number = 1;
  constructor(context: TContext, parent: TypedChainNodeBase<TContext>) {
    super(context, parent);
  }
}
export class TypedChainNode2<TContext extends ChainPayloadBase = ChainPayloadBase> extends TypedChainNode1<TContext> {
  public readonly marker: string = 'typed-2';
  public readonly depth: number = 2;
  constructor(context: TContext, parent: TypedChainNodeBase<TContext>) {
    super(context, parent);
  }
}
export class TypedChainNode3<TContext extends ChainPayloadBase = ChainPayloadBase> extends TypedChainNode2<TContext> {
  public readonly marker: string = 'typed-3';
  public readonly depth: number = 3;
  constructor(context: TContext, parent: TypedChainNodeBase<TContext>) {
    super(context, parent);
  }
}
export class TypedChainNode4<TContext extends ChainPayloadBase = ChainPayloadBase> extends TypedChainNode3<TContext> {
  public readonly marker: string = 'typed-4';
  public readonly depth: number = 4;
  constructor(context: TContext, parent: TypedChainNodeBase<TContext>) {
    super(context, parent);
  }
}
export class TypedChainNode5<TContext extends ChainPayloadBase = ChainPayloadBase> extends TypedChainNode4<TContext> {
  public readonly marker: string = 'typed-5';
  public readonly depth: number = 5;
  constructor(context: TContext, parent: TypedChainNodeBase<TContext>) {
    super(context, parent);
  }
}
export class TypedChainNode6<TContext extends ChainPayloadBase = ChainPayloadBase> extends TypedChainNode5<TContext> {
  public readonly marker: string = 'typed-6';
  public readonly depth: number = 6;
  constructor(context: TContext, parent: TypedChainNodeBase<TContext>) {
    super(context, parent);
  }
}
export class TypedChainNode7<TContext extends ChainPayloadBase = ChainPayloadBase> extends TypedChainNode6<TContext> {
  public readonly marker: string = 'typed-7';
  public readonly depth: number = 7;
  constructor(context: TContext, parent: TypedChainNodeBase<TContext>) {
    super(context, parent);
  }
}
export class TypedChainNode8<TContext extends ChainPayloadBase = ChainPayloadBase> extends TypedChainNode7<TContext> {
  public readonly marker: string = 'typed-8';
  public readonly depth: number = 8;
  constructor(context: TContext, parent: TypedChainNodeBase<TContext>) {
    super(context, parent);
  }
}
export class TypedChainNode9<TContext extends ChainPayloadBase = ChainPayloadBase> extends TypedChainNode8<TContext> {
  public readonly marker: string = 'typed-9';
  public readonly depth: number = 9;
  constructor(context: TContext, parent: TypedChainNodeBase<TContext>) {
    super(context, parent);
  }
}
export class TypedChainNode10<TContext extends ChainPayloadBase = ChainPayloadBase> extends TypedChainNode9<TContext> {
  public readonly marker: string = 'typed-10';
  public readonly depth: number = 10;
  constructor(context: TContext, parent: TypedChainNodeBase<TContext>) {
    super(context, parent);
  }
}
export class TypedChainNode11<TContext extends ChainPayloadBase = ChainPayloadBase> extends TypedChainNode10<TContext> {
  public readonly marker: string = 'typed-11';
  public readonly depth: number = 11;
  constructor(context: TContext, parent: TypedChainNodeBase<TContext>) {
    super(context, parent);
  }
}
export class TypedChainNode12<TContext extends ChainPayloadBase = ChainPayloadBase> extends TypedChainNode11<TContext> {
  public readonly marker: string = 'typed-12';
  public readonly depth: number = 12;
  constructor(context: TContext, parent: TypedChainNodeBase<TContext>) {
    super(context, parent);
  }
}
export class TypedChainNode13<TContext extends ChainPayloadBase = ChainPayloadBase> extends TypedChainNode12<TContext> {
  public readonly marker: string = 'typed-13';
  public readonly depth: number = 13;
  constructor(context: TContext, parent: TypedChainNodeBase<TContext>) {
    super(context, parent);
  }
}
export class TypedChainNode14<TContext extends ChainPayloadBase = ChainPayloadBase> extends TypedChainNode13<TContext> {
  public readonly marker: string = 'typed-14';
  public readonly depth: number = 14;
  constructor(context: TContext, parent: TypedChainNodeBase<TContext>) {
    super(context, parent);
  }
}
export class TypedChainNode15<TContext extends ChainPayloadBase = ChainPayloadBase> extends TypedChainNode14<TContext> {
  public readonly marker: string = 'typed-15';
  public readonly depth: number = 15;
  constructor(context: TContext, parent: TypedChainNodeBase<TContext>) {
    super(context, parent);
  }
}
export class TypedChainNode16<TContext extends ChainPayloadBase = ChainPayloadBase> extends TypedChainNode15<TContext> {
  public readonly marker: string = 'typed-16';
  public readonly depth: number = 16;
  constructor(context: TContext, parent: TypedChainNodeBase<TContext>) {
    super(context, parent);
  }
}
export class TypedChainNode17<TContext extends ChainPayloadBase = ChainPayloadBase> extends TypedChainNode16<TContext> {
  public readonly marker: string = 'typed-17';
  public readonly depth: number = 17;
  constructor(context: TContext, parent: TypedChainNodeBase<TContext>) {
    super(context, parent);
  }
}
export class TypedChainNode18<TContext extends ChainPayloadBase = ChainPayloadBase> extends TypedChainNode17<TContext> {
  public readonly marker: string = 'typed-18';
  public readonly depth: number = 18;
  constructor(context: TContext, parent: TypedChainNodeBase<TContext>) {
    super(context, parent);
  }
}
export class TypedChainNode19<TContext extends ChainPayloadBase = ChainPayloadBase> extends TypedChainNode18<TContext> {
  public readonly marker: string = 'typed-19';
  public readonly depth: number = 19;
  constructor(context: TContext, parent: TypedChainNodeBase<TContext>) {
    super(context, parent);
  }
}
export class TypedChainNode20<TContext extends ChainPayloadBase = ChainPayloadBase> extends TypedChainNode19<TContext> {
  public readonly marker: string = 'typed-20';
  public readonly depth: number = 20;
  constructor(context: TContext, parent: TypedChainNodeBase<TContext>) {
    super(context, parent);
  }
}

export const flattenHierarchy = (leaf: DeepChainUnion): readonly DeepChainNode0[] => {
  const chain: DeepChainNode0[] = [leaf as DeepChainNode35];
  return chain;
};

export type TypedChainDepth20<TContext extends ChainPayloadBase> = TypedChainNode20<TContext>;

export const typedChainChain = <TContext extends ChainPayloadBase>(context: TContext): TypedChainDepth20<TContext> => {
  const n0 = new TypedChainNode0(context);
  const n1 = new TypedChainNode1(context, n0);
  const n2 = new TypedChainNode2(context, n1);
  const n3 = new TypedChainNode3(context, n2);
  const n4 = new TypedChainNode4(context, n3);
  const n5 = new TypedChainNode5(context, n4);
  const n6 = new TypedChainNode6(context, n5);
  const n7 = new TypedChainNode7(context, n6);
  const n8 = new TypedChainNode8(context, n7);
  const n9 = new TypedChainNode9(context, n8);
  const n10 = new TypedChainNode10(context, n9);
  const n11 = new TypedChainNode11(context, n10);
  const n12 = new TypedChainNode12(context, n11);
  const n13 = new TypedChainNode13(context, n12);
  const n14 = new TypedChainNode14(context, n13);
  const n15 = new TypedChainNode15(context, n14);
  const n16 = new TypedChainNode16(context, n15);
  const n17 = new TypedChainNode17(context, n16);
  const n18 = new TypedChainNode18(context, n17);
  const n19 = new TypedChainNode19(context, n18);
  const n20 = new TypedChainNode20(context, n19);

  return n20;
};
