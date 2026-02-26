export interface RecoveryLevelBase {
  readonly level: number;
  readonly marker: `L${number}`;
}

export interface RecoveryLevel0 extends RecoveryLevelBase {
  readonly level: number;
  readonly marker: `L${number}`;
}

export interface RecoveryLevel1 extends RecoveryLevel0 {}

export interface RecoveryLevel2 extends RecoveryLevel1 {}

export interface RecoveryLevel3 extends RecoveryLevel2 {}

export interface RecoveryLevel4 extends RecoveryLevel3 {}

export interface RecoveryLevel5 extends RecoveryLevel4 {}

export interface RecoveryLevel6 extends RecoveryLevel5 {}

export interface RecoveryLevel7 extends RecoveryLevel6 {}

export interface RecoveryLevel8 extends RecoveryLevel7 {}

export interface RecoveryLevel9 extends RecoveryLevel8 {}

export interface RecoveryLevel10 extends RecoveryLevel9 {}

export interface RecoveryLevel11 extends RecoveryLevel10 {}

export interface RecoveryLevel12 extends RecoveryLevel11 {}

export interface RecoveryLevel13 extends RecoveryLevel12 {}

export interface RecoveryLevel14 extends RecoveryLevel13 {}

export interface RecoveryLevel15 extends RecoveryLevel14 {}

export interface RecoveryLevel16 extends RecoveryLevel15 {}

export interface RecoveryLevel17 extends RecoveryLevel16 {}

export interface RecoveryLevel18 extends RecoveryLevel17 {}

export interface RecoveryLevel19 extends RecoveryLevel18 {}

export interface RecoveryLevel20 extends RecoveryLevel19 {}

export interface RecoveryLevel21 extends RecoveryLevel20 {}

export interface RecoveryLevel22 extends RecoveryLevel21 {}

export interface RecoveryLevel23 extends RecoveryLevel22 {}

export interface RecoveryLevel24 extends RecoveryLevel23 {}

export interface RecoveryLevel25 extends RecoveryLevel24 {}

export interface RecoveryLevel26 extends RecoveryLevel25 {}

export interface RecoveryLevel27 extends RecoveryLevel26 {}

export interface RecoveryLevel28 extends RecoveryLevel27 {}

export interface RecoveryLevel29 extends RecoveryLevel28 {}

export interface RecoveryLevel30 extends RecoveryLevel29 {}

export interface RecoveryLevel31 extends RecoveryLevel30 {}

export interface RecoveryLevel32 extends RecoveryLevel31 {}

export interface RecoveryLevel33 extends RecoveryLevel32 {}

export interface RecoveryLevel34 extends RecoveryLevel33 {}

export interface RecoveryLevel35 extends RecoveryLevel34 {}

export interface RecoveryLevel36 extends RecoveryLevel35 {}

export interface RecoveryLevel37 extends RecoveryLevel36 {}

export interface RecoveryLevel38 extends RecoveryLevel37 {}

export interface RecoveryLevel39 extends RecoveryLevel38 {}

export interface RecoveryLevel40 extends RecoveryLevel39 {}

export type DeepRecoveryType = RecoveryLevel40;

export interface RecoveryNodeSeed {
  seed: string;
}

export class RecoveryNode0<Seed extends string = string> {
  readonly stage = 0;
  constructor(readonly seed: Seed = '' as Seed, public readonly children: RecoveryNodeBase[] = []) {}
}

export interface RecoveryNodeBase extends RecoveryNodeSeed {
  readonly stage: number;
  readonly children: readonly RecoveryNodeSeed[];
}

export class RecoveryNode1<Seed extends string = string> extends RecoveryNode0<Seed> {}
export class RecoveryNode2<Seed extends string = string> extends RecoveryNode1<Seed> {}
export class RecoveryNode3<Seed extends string = string> extends RecoveryNode2<Seed> {}
export class RecoveryNode4<Seed extends string = string> extends RecoveryNode3<Seed> {}
export class RecoveryNode5<Seed extends string = string> extends RecoveryNode4<Seed> {}
export class RecoveryNode6<Seed extends string = string> extends RecoveryNode5<Seed> {}
export class RecoveryNode7<Seed extends string = string> extends RecoveryNode6<Seed> {}
export class RecoveryNode8<Seed extends string = string> extends RecoveryNode7<Seed> {}
export class RecoveryNode9<Seed extends string = string> extends RecoveryNode8<Seed> {}
export class RecoveryNode10<Seed extends string = string> extends RecoveryNode9<Seed> {}
export class RecoveryNode11<Seed extends string = string> extends RecoveryNode10<Seed> {}
export class RecoveryNode12<Seed extends string = string> extends RecoveryNode11<Seed> {}
export class RecoveryNode13<Seed extends string = string> extends RecoveryNode12<Seed> {}
export class RecoveryNode14<Seed extends string = string> extends RecoveryNode13<Seed> {}
export class RecoveryNode15<Seed extends string = string> extends RecoveryNode14<Seed> {}
export class RecoveryNode16<Seed extends string = string> extends RecoveryNode15<Seed> {}
export class RecoveryNode17<Seed extends string = string> extends RecoveryNode16<Seed> {}
export class RecoveryNode18<Seed extends string = string> extends RecoveryNode17<Seed> {}
export class RecoveryNode19<Seed extends string = string> extends RecoveryNode18<Seed> {}
export class RecoveryNode20<Seed extends string = string> extends RecoveryNode19<Seed> {}
export class RecoveryNode21<Seed extends string = string> extends RecoveryNode20<Seed> {}
export class RecoveryNode22<Seed extends string = string> extends RecoveryNode21<Seed> {}
export class RecoveryNode23<Seed extends string = string> extends RecoveryNode22<Seed> {}
export class RecoveryNode24<Seed extends string = string> extends RecoveryNode23<Seed> {}
export class RecoveryNode25<Seed extends string = string> extends RecoveryNode24<Seed> {}
export class RecoveryNode26<Seed extends string = string> extends RecoveryNode25<Seed> {}
export class RecoveryNode27<Seed extends string = string> extends RecoveryNode26<Seed> {}
export class RecoveryNode28<Seed extends string = string> extends RecoveryNode27<Seed> {}
export class RecoveryNode29<Seed extends string = string> extends RecoveryNode28<Seed> {}
export class RecoveryNode30<Seed extends string = string> extends RecoveryNode29<Seed> {}

export type RecoveryNodeChain = RecoveryNode30<string>;

export const buildNodeChain = (seed: string): RecoveryNodeChain => {
  const zero = new RecoveryNode0<`${string}-0`>(`${seed}-0`);
  const one = new RecoveryNode1<`${string}-1`>(`${seed}-1`);
  const two = new RecoveryNode2<`${string}-2`>(`${seed}-2`);
  const three = new RecoveryNode3<`${string}-3`>(`${seed}-3`);
  const four = new RecoveryNode4<`${string}-4`>(`${seed}-4`);
  const five = new RecoveryNode5<`${string}-5`>(`${seed}-5`);
  const six = new RecoveryNode6<`${string}-6`>(`${seed}-6`);
  const seven = new RecoveryNode7<`${string}-7`>(`${seed}-7`);
  const eight = new RecoveryNode8<`${string}-8`>(`${seed}-8`);
  const nine = new RecoveryNode9<`${string}-9`>(`${seed}-9`);
  const ten = new RecoveryNode10<`${string}-10`>(`${seed}-10`);

  zero.children.push(one);
  one.children.push(two);
  two.children.push(three);
  three.children.push(four);
  four.children.push(five);
  five.children.push(six);
  six.children.push(seven);
  seven.children.push(eight);
  eight.children.push(nine);
  nine.children.push(ten);

  return {
    ...ten,
    stage: 0,
    seed,
    children: [one, two, three, four, five, six, seven, eight, nine, ten],
  } as unknown as RecoveryNodeChain;
};

export type ChainWalker<T extends RecoveryNode0<any> = RecoveryNode0<string>> = T extends RecoveryNode1<infer S>
  ? S
  : T extends RecoveryNode0<infer S>
    ? S
    : string;

export type ChainCompatibility<T extends RecoveryNode0<any>> = T['seed'];
export type ClassChainRoot = ChainCompatibility<RecoveryNodeChain>;
