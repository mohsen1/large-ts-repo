export interface ChainNode0 {
  readonly node: 'N0';
  readonly weight: 0;
  readonly stamp: `${0}`;
}

export interface ChainNode1 {
  readonly node: 'N1';
  readonly weight: 1;
  readonly stamp: `${1}`;
}

export interface ChainNode2 {
  readonly node: 'N2';
  readonly weight: 2;
  readonly stamp: `${2}`;
}

export interface ChainNode3 {
  readonly node: 'N3';
  readonly weight: 3;
  readonly stamp: `${3}`;
}

export interface ChainNode4 {
  readonly node: 'N4';
  readonly weight: 4;
  readonly stamp: `${4}`;
}

export interface ChainNode5 {
  readonly node: 'N5';
  readonly weight: 5;
  readonly stamp: `${5}`;
}

export interface ChainNode6 {
  readonly node: 'N6';
  readonly weight: 6;
  readonly stamp: `${6}`;
}

export interface ChainNode7 {
  readonly node: 'N7';
  readonly weight: 7;
  readonly stamp: `${7}`;
}

export interface ChainNode8 {
  readonly node: 'N8';
  readonly weight: 8;
  readonly stamp: `${8}`;
}

export interface ChainNode9 {
  readonly node: 'N9';
  readonly weight: 9;
  readonly stamp: `${9}`;
}

export interface ChainNode10 {
  readonly node: 'N10';
  readonly weight: 10;
  readonly stamp: `${10}`;
}

export interface ChainNode11 {
  readonly node: 'N11';
  readonly weight: 11;
  readonly stamp: `${11}`;
}

export interface ChainNode12 {
  readonly node: 'N12';
  readonly weight: 12;
  readonly stamp: `${12}`;
}

export interface ChainNode13 {
  readonly node: 'N13';
  readonly weight: 13;
  readonly stamp: `${13}`;
}

export interface ChainNode14 {
  readonly node: 'N14';
  readonly weight: 14;
  readonly stamp: `${14}`;
}

export interface ChainNode15 {
  readonly node: 'N15';
  readonly weight: 15;
  readonly stamp: `${15}`;
}

export interface ChainNode16 {
  readonly node: 'N16';
  readonly weight: 16;
  readonly stamp: `${16}`;
}

export interface ChainNode17 {
  readonly node: 'N17';
  readonly weight: 17;
  readonly stamp: `${17}`;
}

export interface ChainNode18 {
  readonly node: 'N18';
  readonly weight: 18;
  readonly stamp: `${18}`;
}

export interface ChainNode19 {
  readonly node: 'N19';
  readonly weight: 19;
  readonly stamp: `${19}`;
}

export interface ChainNode20 {
  readonly node: 'N20';
  readonly weight: 20;
  readonly stamp: `${20}`;
}

export interface ChainNode21 {
  readonly node: 'N21';
  readonly weight: 21;
  readonly stamp: `${21}`;
}

export interface ChainNode22 {
  readonly node: 'N22';
  readonly weight: 22;
  readonly stamp: `${22}`;
}

export interface ChainNode23 {
  readonly node: 'N23';
  readonly weight: 23;
  readonly stamp: `${23}`;
}

export interface ChainNode24 {
  readonly node: 'N24';
  readonly weight: 24;
  readonly stamp: `${24}`;
}

export interface ChainNode25 {
  readonly node: 'N25';
  readonly weight: 25;
  readonly stamp: `${25}`;
}

export interface ChainNode26 {
  readonly node: 'N26';
  readonly weight: 26;
  readonly stamp: `${26}`;
}

export interface ChainNode27 {
  readonly node: 'N27';
  readonly weight: 27;
  readonly stamp: `${27}`;
}

export interface ChainNode28 {
  readonly node: 'N28';
  readonly weight: 28;
  readonly stamp: `${28}`;
}

export interface ChainNode29 {
  readonly node: 'N29';
  readonly weight: 29;
  readonly stamp: `${29}`;
}

export interface ChainNode30 {
  readonly node: 'N30';
  readonly weight: 30;
  readonly stamp: `${30}`;
}

export interface ChainNode31 {
  readonly node: 'N31';
  readonly weight: 31;
  readonly stamp: `${31}`;
}

export interface ChainNode32 {
  readonly node: 'N32';
  readonly weight: 32;
  readonly stamp: `${32}`;
}

export interface ChainNode33 {
  readonly node: 'N33';
  readonly weight: 33;
  readonly stamp: `${33}`;
}

export interface ChainNode34 {
  readonly node: 'N34';
  readonly weight: 34;
  readonly stamp: `${34}`;
}

export interface ChainNode35 {
  readonly node: 'N35';
  readonly weight: 35;
  readonly stamp: `${35}`;
}

export type DeepChainEnd = ChainNode35;
export type DeepInterfaceUnion =
  | ChainNode0
  | ChainNode1
  | ChainNode2
  | ChainNode3
  | ChainNode4
  | ChainNode5
  | ChainNode6
  | ChainNode7
  | ChainNode8
  | ChainNode9
  | ChainNode10
  | ChainNode11
  | ChainNode12
  | ChainNode13
  | ChainNode14
  | ChainNode15
  | ChainNode16
  | ChainNode17
  | ChainNode18
  | ChainNode19
  | ChainNode20
  | ChainNode21
  | ChainNode22
  | ChainNode23
  | ChainNode24
  | ChainNode25
  | ChainNode26
  | ChainNode27
  | ChainNode28
  | ChainNode29
  | ChainNode30
  | ChainNode31
  | ChainNode32
  | ChainNode33
  | ChainNode34
  | ChainNode35;

export type ChainSlice = Pick<DeepInterfaceUnion, 'node' | 'weight'>;

export type AssertChainWidth<T extends ChainNode35> = T['weight'];
export type ChainTail = DeepChainEnd['node'];

export type ChainProjection<T extends DeepInterfaceUnion> = T extends ChainNode35
  ? 'terminal'
  : T extends ChainNode34
    ? 'near-terminal'
    : T extends ChainNode20
      ? 'midline'
      : T extends ChainNode0
        ? 'origin'
        : 'transient';

export type ChainByWeight<T extends DeepInterfaceUnion> = T['weight'] extends infer W
  ? Extract<DeepInterfaceUnion, { weight: W & number }>
  : never;

export type ChainIndex = {
  readonly [K in DeepInterfaceUnion['weight']]: K;
};

export abstract class ChainHub<TValue, TStage extends number = 0> {
  abstract readonly value: TValue;
  abstract readonly stage: TStage;
  abstract next(): ChainStep<TValue, TStage>;
}

export class ChainStep<TValue, TStage extends number>
  extends ChainHub<TValue, TStage>
{
  readonly value: TValue;
  readonly stage: TStage;
  constructor(value: TValue, stage: TStage) {
    super();
    this.value = value;
    this.stage = stage;
  }

  next(): ChainStep<TValue, TStage> {
    return this;
  }
}

export type StepFactory<T, TInput extends number> = TInput extends 0
  ? ChainStep<T, 0>
  : ChainStep<T, TInput>;

export class Layer1<T> extends ChainHub<T, 1> {
  readonly value: T;
  readonly stage = 1 as const;
  constructor(value: T) {
    super();
    this.value = value;
  }
  next(): ChainStep<T, 1> {
    return new ChainStep(this.value, 1);
  }
}

export class Layer2<T> extends ChainHub<readonly [T, T], 2> {
  readonly value: readonly [T, T];
  override readonly stage = 2 as const;
  override next(): ChainStep<readonly [T, T], 2> {
    return new ChainStep(this.value, 2 as 2);
  }
  constructor(value: readonly [T, T]) {
    super();
    this.value = value;
  }
}

export class Layer3<T> extends ChainHub<readonly [readonly [T, T], T], 3> {
  readonly value: readonly [readonly [T, T], T];
  override readonly stage = 3 as const;
  override next(): ChainStep<readonly [readonly [T, T], T], 3> {
    return new ChainStep(this.value, 3 as 3);
  }
  constructor(value: readonly [readonly [T, T], T]) {
    super();
    this.value = value;
  }
}

export class Layer4<T> extends ChainHub<readonly [T, T, T, T], 4> {
  readonly value: readonly [T, T, T, T];
  override readonly stage = 4 as const;
  override next(): ChainStep<readonly [T, T, T, T], 4> {
    return new ChainStep(this.value, 4 as 4);
  }
  constructor(value: readonly [T, T, T, T]) {
    super();
    this.value = value;
  }
}

export class Layer5<T> extends ChainHub<T, 5> {
  readonly value: T;
  readonly stage = 5 as const;
  constructor(value: T) {
    super();
    this.value = value;
  }
  next(): ChainStep<T, 5> {
    return new ChainStep(this.value, 5);
  }
}

export class Layer6<T> extends ChainHub<T[], 6> {
  readonly value: T[];
  override readonly stage = 6 as const;
  override next(): ChainStep<T[], 6> {
    return new ChainStep(this.value, 6 as 6);
  }
  constructor(value: T[]) {
    super();
    this.value = value;
  }
}

export class Layer7<T> extends ChainHub<readonly T[], 7> {
  readonly value: readonly T[];
  override readonly stage = 7 as const;
  override next(): ChainStep<readonly T[], 7> {
    return new ChainStep(this.value, 7 as 7);
  }
  constructor(value: readonly T[]) {
    super();
    this.value = value;
  }
}

export class Layer8<T> extends ChainHub<{ readonly payload: readonly T[] }, 8> {
  readonly value: { readonly payload: readonly T[] };
  override readonly stage = 8 as const;
  override next(): ChainStep<{ readonly payload: readonly T[] }, 8> {
    return new ChainStep(this.value, 8 as 8);
  }
  constructor(value: { readonly payload: readonly T[] }) {
    super();
    this.value = value;
  }
}

export class Layer9<T> extends ChainHub<{ readonly payload: readonly T[]; readonly index: number }, 9> {
  readonly value: { readonly payload: readonly T[]; readonly index: number };
  override readonly stage = 9 as const;
  override next(): ChainStep<{ readonly payload: readonly T[]; readonly index: number }, 9> {
    return new ChainStep(this.value, 9 as 9);
  }
  constructor(value: { readonly payload: readonly T[]; readonly index: number }) {
    super();
    this.value = value;
  }
}

export class Layer10<T> extends ChainHub<{ readonly payload: readonly T[]; readonly index: number; readonly done: boolean }, 10> {
  readonly value: { readonly payload: readonly T[]; readonly index: number; readonly done: boolean };
  override readonly stage = 10 as const;
  override next(): ChainStep<{ readonly payload: readonly T[]; readonly index: number; readonly done: boolean }, 10> {
    return new ChainStep(this.value, 10 as 10);
  }
  constructor(value: { readonly payload: readonly T[]; readonly index: number; readonly done: boolean }) {
    super();
    this.value = value;
  }
}

export type LayeredClassInput<T> =
  | Layer1<T>
  | Layer2<T>
  | Layer3<T>
  | Layer4<T>
  | Layer5<T>
  | Layer6<T>
  | Layer7<T>
  | Layer8<T>
  | Layer9<T>
  | Layer10<T>;

export type StructuralCompatibilityChain =
  | ChainNode10
  | Layer1<unknown>
  | Layer10<unknown>
  | Layer9<unknown>
  | Layer8<unknown>
  | Layer7<unknown>
  | Layer6<unknown>
  | Layer5<unknown>
  | Layer4<unknown>
  | Layer3<unknown>
  | Layer2<unknown>;

export interface ChainProbe {
  readonly probe0: ChainNode0;
  readonly probe1: ChainNode1;
  readonly probe2: ChainNode2;
  readonly probe3: ChainNode3;
  readonly probe4: ChainNode4;
  readonly probe5: ChainNode5;
  readonly probe6: ChainNode6;
  readonly probe7: ChainNode7;
  readonly probe8: ChainNode8;
  readonly probe9: ChainNode9;
  readonly probe10: ChainNode10;
  readonly probe11: ChainNode11;
  readonly probe12: ChainNode12;
  readonly probe13: ChainNode13;
  readonly probe14: ChainNode14;
  readonly probe15: ChainNode15;
}

export const makeChainProbe = (value: DeepInterfaceUnion): ChainProbe => ({
  probe0: value as ChainNode0,
  probe1: value as ChainNode1,
  probe2: value as ChainNode2,
  probe3: value as ChainNode3,
  probe4: value as ChainNode4,
  probe5: value as ChainNode5,
  probe6: value as ChainNode6,
  probe7: value as ChainNode7,
  probe8: value as ChainNode8,
  probe9: value as ChainNode9,
  probe10: value as ChainNode10,
  probe11: value as ChainNode11,
  probe12: value as ChainNode12,
  probe13: value as ChainNode13,
  probe14: value as ChainNode14,
  probe15: value as ChainNode15,
});

export const chainAnchor: ChainNode35 = {
  node: 'N35',
  weight: 35,
  stamp: '35',
};

export const layerValue: LayeredClassInput<string> = new Layer10({
  payload: ['a', 'b', 'c'],
  index: 10,
  done: true,
});

export const chainCompatibility = {
  anchors: [
    chainAnchor,
    new Layer1('seed'),
    new Layer2(['seed', 'seed']),
    new Layer3([['seed', 'seed'], 'seed']),
    new Layer4(['seed', 'seed', 'seed', 'seed']),
    new Layer5('seed'),
    new Layer6(['seed']),
    new Layer7(['seed']),
    new Layer8({ payload: ['seed'] }),
    new Layer9({ payload: ['seed'], index: 9 }),
    new Layer10({ payload: ['seed'], index: 10, done: true }),
  ] as readonly StructuralCompatibilityChain[],
};
