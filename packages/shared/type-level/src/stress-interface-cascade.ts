export interface InterfaceLevel0 {
  readonly nodeId: `node-${string}`;
  readonly level: number;
}

export interface InterfaceLevel1 extends InterfaceLevel0 {
  readonly level: number;
  readonly marker1: 'cascade-1';
}

export interface InterfaceLevel2 extends InterfaceLevel1 {
  readonly level: number;
  readonly marker2: 'cascade-2';
}

export interface InterfaceLevel3 extends InterfaceLevel2 {
  readonly level: number;
  readonly marker3: 'cascade-3';
}

export interface InterfaceLevel4 extends InterfaceLevel3 {
  readonly level: number;
  readonly marker4: 'cascade-4';
}

export interface InterfaceLevel5 extends InterfaceLevel4 {
  readonly level: number;
  readonly marker5: 'cascade-5';
}

export interface InterfaceLevel6 extends InterfaceLevel5 {
  readonly level: number;
  readonly marker6: 'cascade-6';
}

export interface InterfaceLevel7 extends InterfaceLevel6 {
  readonly level: number;
  readonly marker7: 'cascade-7';
}

export interface InterfaceLevel8 extends InterfaceLevel7 {
  readonly level: number;
  readonly marker8: 'cascade-8';
}

export interface InterfaceLevel9 extends InterfaceLevel8 {
  readonly level: number;
  readonly marker9: 'cascade-9';
}

export interface InterfaceLevel10 extends InterfaceLevel9 {
  readonly level: number;
  readonly marker10: 'cascade-10';
}

export interface InterfaceLevel11 extends InterfaceLevel10 {
  readonly level: number;
  readonly marker11: 'cascade-11';
}

export interface InterfaceLevel12 extends InterfaceLevel11 {
  readonly level: number;
  readonly marker12: 'cascade-12';
}

export interface InterfaceLevel13 extends InterfaceLevel12 {
  readonly level: number;
  readonly marker13: 'cascade-13';
}

export interface InterfaceLevel14 extends InterfaceLevel13 {
  readonly level: number;
  readonly marker14: 'cascade-14';
}

export interface InterfaceLevel15 extends InterfaceLevel14 {
  readonly level: number;
  readonly marker15: 'cascade-15';
}

export interface InterfaceLevel16 extends InterfaceLevel15 {
  readonly level: number;
  readonly marker16: 'cascade-16';
}

export interface InterfaceLevel17 extends InterfaceLevel16 {
  readonly level: number;
  readonly marker17: 'cascade-17';
}

export interface InterfaceLevel18 extends InterfaceLevel17 {
  readonly level: number;
  readonly marker18: 'cascade-18';
}

export interface InterfaceLevel19 extends InterfaceLevel18 {
  readonly level: number;
  readonly marker19: 'cascade-19';
}

export interface InterfaceLevel20 extends InterfaceLevel19 {
  readonly level: number;
  readonly marker20: 'cascade-20';
}

export interface InterfaceLevel21 extends InterfaceLevel20 {
  readonly level: number;
  readonly marker21: 'cascade-21';
}

export interface InterfaceLevel22 extends InterfaceLevel21 {
  readonly level: number;
  readonly marker22: 'cascade-22';
}

export interface InterfaceLevel23 extends InterfaceLevel22 {
  readonly level: number;
  readonly marker23: 'cascade-23';
}

export interface InterfaceLevel24 extends InterfaceLevel23 {
  readonly level: number;
  readonly marker24: 'cascade-24';
}

export interface InterfaceLevel25 extends InterfaceLevel24 {
  readonly level: number;
  readonly marker25: 'cascade-25';
}

export interface InterfaceLevel26 extends InterfaceLevel25 {
  readonly level: number;
  readonly marker26: 'cascade-26';
}

export interface InterfaceLevel27 extends InterfaceLevel26 {
  readonly level: number;
  readonly marker27: 'cascade-27';
}

export interface InterfaceLevel28 extends InterfaceLevel27 {
  readonly level: number;
  readonly marker28: 'cascade-28';
}

export interface InterfaceLevel29 extends InterfaceLevel28 {
  readonly level: number;
  readonly marker29: 'cascade-29';
}

export interface InterfaceLevel30 extends InterfaceLevel29 {
  readonly level: number;
  readonly marker30: 'cascade-30';
}

export interface InterfaceLevel31 extends InterfaceLevel30 {
  readonly level: number;
  readonly marker31: 'cascade-31';
}

export interface InterfaceLevel32 extends InterfaceLevel31 {
  readonly level: number;
  readonly marker32: 'cascade-32';
}

export interface InterfaceLevel33 extends InterfaceLevel32 {
  readonly level: number;
  readonly marker33: 'cascade-33';
}

export interface InterfaceLevel34 extends InterfaceLevel33 {
  readonly level: number;
  readonly marker34: 'cascade-34';
}

export interface InterfaceLevel35 extends InterfaceLevel34 {
  readonly level: number;
  readonly marker35: 'cascade-35';
}

export type AnyInterfaceLevel =
  | InterfaceLevel0
  | InterfaceLevel1
  | InterfaceLevel2
  | InterfaceLevel3
  | InterfaceLevel4
  | InterfaceLevel5
  | InterfaceLevel6
  | InterfaceLevel7
  | InterfaceLevel8
  | InterfaceLevel9
  | InterfaceLevel10
  | InterfaceLevel11
  | InterfaceLevel12
  | InterfaceLevel13
  | InterfaceLevel14
  | InterfaceLevel15
  | InterfaceLevel16
  | InterfaceLevel17
  | InterfaceLevel18
  | InterfaceLevel19
  | InterfaceLevel20
  | InterfaceLevel21
  | InterfaceLevel22
  | InterfaceLevel23
  | InterfaceLevel24
  | InterfaceLevel25
  | InterfaceLevel26
  | InterfaceLevel27
  | InterfaceLevel28
  | InterfaceLevel29
  | InterfaceLevel30
  | InterfaceLevel31
  | InterfaceLevel32
  | InterfaceLevel33
  | InterfaceLevel34
  | InterfaceLevel35;

export class CascadeNodeBase<T extends InterfaceLevel0> {
  constructor(readonly depth: number, readonly payload: Readonly<T>) {}

  get isLeaf(): boolean {
    return this.depth >= 35;
  }

  label(): string {
    return `${this.payload.nodeId}-${this.depth}`;
  }
}

export class CascadeNode1<T extends InterfaceLevel1> extends CascadeNodeBase<T> {
  next(): string {
    return 'n1';
  }
}

export class CascadeNode2<T extends InterfaceLevel2> extends CascadeNode1<T> {
  next(): string {
    return 'n2';
  }
}

export class CascadeNode3<T extends InterfaceLevel3> extends CascadeNode2<T> {
  next(): string {
    return 'n3';
  }
}

export class CascadeNode4<T extends InterfaceLevel4> extends CascadeNode3<T> {
  next(): string {
    return 'n4';
  }
}

export class CascadeNode5<T extends InterfaceLevel5> extends CascadeNode4<T> {
  next(): string {
    return 'n5';
  }
}

export class CascadeNode6<T extends InterfaceLevel6> extends CascadeNode5<T> {
  next(): string {
    return 'n6';
  }
}

export class CascadeNode7<T extends InterfaceLevel7> extends CascadeNode6<T> {
  next(): string {
    return 'n7';
  }
}

export class CascadeNode8<T extends InterfaceLevel8> extends CascadeNode7<T> {
  next(): string {
    return 'n8';
  }
}

export class CascadeNode9<T extends InterfaceLevel9> extends CascadeNode8<T> {
  next(): string {
    return 'n9';
  }
}

export class CascadeNode10<T extends InterfaceLevel10> extends CascadeNode9<T> {
  next(): string {
    return 'n10';
  }
}

export class CascadeNode11<T extends InterfaceLevel11> extends CascadeNode10<T> {
  next(): string {
    return 'n11';
  }
}

export class CascadeNode12<T extends InterfaceLevel12> extends CascadeNode11<T> {
  next(): string {
    return 'n12';
  }
}

export class CascadeNode13<T extends InterfaceLevel13> extends CascadeNode12<T> {
  next(): string {
    return 'n13';
  }
}

export class CascadeNode14<T extends InterfaceLevel14> extends CascadeNode13<T> {
  next(): string {
    return 'n14';
  }
}

export class CascadeNode15<T extends InterfaceLevel15> extends CascadeNode14<T> {
  next(): string {
    return 'n15';
  }
}

export class CascadeNode16<T extends InterfaceLevel16> extends CascadeNode15<T> {
  next(): string {
    return 'n16';
  }
}

export class CascadeNode17<T extends InterfaceLevel17> extends CascadeNode16<T> {
  next(): string {
    return 'n17';
  }
}

export class CascadeNode18<T extends InterfaceLevel18> extends CascadeNode17<T> {
  next(): string {
    return 'n18';
  }
}

export class CascadeNode19<T extends InterfaceLevel19> extends CascadeNode18<T> {
  next(): string {
    return 'n19';
  }
}

export class CascadeNode20<T extends InterfaceLevel20> extends CascadeNode19<T> {
  next(): string {
    return 'n20';
  }
}

export class CascadeNode21<T extends InterfaceLevel21> extends CascadeNode20<T> {
  next(): string {
    return 'n21';
  }
}

export class CascadeNode22<T extends InterfaceLevel22> extends CascadeNode21<T> {
  next(): string {
    return 'n22';
  }
}

export class CascadeNode23<T extends InterfaceLevel23> extends CascadeNode22<T> {
  next(): string {
    return 'n23';
  }
}

export class CascadeNode24<T extends InterfaceLevel24> extends CascadeNode23<T> {
  next(): string {
    return 'n24';
  }
}

export class CascadeNode25<T extends InterfaceLevel25> extends CascadeNode24<T> {
  next(): string {
    return 'n25';
  }
}

export class CascadeNode26<T extends InterfaceLevel26> extends CascadeNode25<T> {
  next(): string {
    return 'n26';
  }
}

export class CascadeNode27<T extends InterfaceLevel27> extends CascadeNode26<T> {
  next(): string {
    return 'n27';
  }
}

export class CascadeNode28<T extends InterfaceLevel28> extends CascadeNode27<T> {
  next(): string {
    return 'n28';
  }
}

export class CascadeNode29<T extends InterfaceLevel29> extends CascadeNode28<T> {
  next(): string {
    return 'n29';
  }
}

export class CascadeNode30<T extends InterfaceLevel30> extends CascadeNode29<T> {
  next(): string {
    return 'n30';
  }
}

export class CascadeNode31<T extends InterfaceLevel31> extends CascadeNode30<T> {
  next(): string {
    return 'n31';
  }
}

export class CascadeNode32<T extends InterfaceLevel32> extends CascadeNode31<T> {
  next(): string {
    return 'n32';
  }
}

export class CascadeNode33<T extends InterfaceLevel33> extends CascadeNode32<T> {
  next(): string {
    return 'n33';
  }
}

export class CascadeNode34<T extends InterfaceLevel34> extends CascadeNode33<T> {
  next(): string {
    return 'n34';
  }
}

export class CascadeNode35<T extends InterfaceLevel35> extends CascadeNode34<T> {
  next(): string {
    return 'n35';
  }
}

export function acceptDeepest(value: InterfaceLevel35): value is InterfaceLevel35 & { readonly level: 35 } {
  return value.level === 35;
}

export function mapInterfaceChain(value: AnyInterfaceLevel): string {
  return `level-${value.level}`;
}
