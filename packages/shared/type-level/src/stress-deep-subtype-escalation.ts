export type SubtypeTag = `tier-${number}-${string}`;

export interface DepthCarrier {
  readonly tier: SubtypeTag;
  readonly weight: number;
  readonly depth: number;
}

export interface DepthCarrier01 extends DepthCarrier {
  readonly layer01: '01';
}
export interface DepthCarrier02 extends DepthCarrier01 {
  readonly layer02: '02';
}
export interface DepthCarrier03 extends DepthCarrier02 {
  readonly layer03: '03';
}
export interface DepthCarrier04 extends DepthCarrier03 {
  readonly layer04: '04';
}
export interface DepthCarrier05 extends DepthCarrier04 {
  readonly layer05: '05';
}
export interface DepthCarrier06 extends DepthCarrier05 {
  readonly layer06: '06';
}
export interface DepthCarrier07 extends DepthCarrier06 {
  readonly layer07: '07';
}
export interface DepthCarrier08 extends DepthCarrier07 {
  readonly layer08: '08';
}
export interface DepthCarrier09 extends DepthCarrier08 {
  readonly layer09: '09';
}
export interface DepthCarrier10 extends DepthCarrier09 {
  readonly layer10: '10';
}
export interface DepthCarrier11 extends DepthCarrier10 {
  readonly layer11: '11';
}
export interface DepthCarrier12 extends DepthCarrier11 {
  readonly layer12: '12';
}
export interface DepthCarrier13 extends DepthCarrier12 {
  readonly layer13: '13';
}
export interface DepthCarrier14 extends DepthCarrier13 {
  readonly layer14: '14';
}
export interface DepthCarrier15 extends DepthCarrier14 {
  readonly layer15: '15';
}
export interface DepthCarrier16 extends DepthCarrier15 {
  readonly layer16: '16';
}
export interface DepthCarrier17 extends DepthCarrier16 {
  readonly layer17: '17';
}
export interface DepthCarrier18 extends DepthCarrier17 {
  readonly layer18: '18';
}
export interface DepthCarrier19 extends DepthCarrier18 {
  readonly layer19: '19';
}
export interface DepthCarrier20 extends DepthCarrier19 {
  readonly layer20: '20';
}
export interface DepthCarrier21 extends DepthCarrier20 {
  readonly layer21: '21';
}
export interface DepthCarrier22 extends DepthCarrier21 {
  readonly layer22: '22';
}
export interface DepthCarrier23 extends DepthCarrier22 {
  readonly layer23: '23';
}
export interface DepthCarrier24 extends DepthCarrier23 {
  readonly layer24: '24';
}
export interface DepthCarrier25 extends DepthCarrier24 {
  readonly layer25: '25';
}
export interface DepthCarrier26 extends DepthCarrier25 {
  readonly layer26: '26';
}
export interface DepthCarrier27 extends DepthCarrier26 {
  readonly layer27: '27';
}
export interface DepthCarrier28 extends DepthCarrier27 {
  readonly layer28: '28';
}
export interface DepthCarrier29 extends DepthCarrier28 {
  readonly layer29: '29';
}
export interface DepthCarrier30 extends DepthCarrier29 {
  readonly layer30: '30';
}
export interface DepthCarrier31 extends DepthCarrier30 {
  readonly layer31: '31';
}
export interface DepthCarrier32 extends DepthCarrier31 {
  readonly layer32: '32';
}
export interface DepthCarrier33 extends DepthCarrier32 {
  readonly layer33: '33';
}
export interface DepthCarrier34 extends DepthCarrier33 {
  readonly layer34: '34';
}
export interface DepthCarrier35 extends DepthCarrier34 {
  readonly layer35: '35';
}
export interface DepthCarrier36 extends DepthCarrier35 {
  readonly layer36: '36';
}
export interface DepthCarrier37 extends DepthCarrier36 {
  readonly layer37: '37';
}
export interface DepthCarrier38 extends DepthCarrier37 {
  readonly layer38: '38';
}
export interface DepthCarrier39 extends DepthCarrier38 {
  readonly layer39: '39';
}
export interface DepthCarrier40 extends DepthCarrier39 {
  readonly layer40: '40';
}

export type DeepSubtypeMatrix = {
  [K in keyof DepthCarrier40 as `depth:${K & string}`]: DepthCarrier40[K];
};

export type DeepCarrierDepth = DepthCarrier40['depth'];

export abstract class AbstractCarrier<T extends DepthCarrier = DepthCarrier> {
  abstract readonly node: string;
  abstract readonly depth: number;
  abstract readonly payload: T;
  abstract emit(): string;
}

export type CarrierTrace<T extends { depth: number; tier: string }> = readonly `${T['tier']}:${T['depth']}`[];

type LayerPayload<T extends DepthCarrier> = { readonly payload: T };

export class CarrierLayer01<T extends DepthCarrier01 = DepthCarrier01> extends AbstractCarrier<T> {
  readonly node: string = 'layer01';
  readonly depth: number = 1;
  constructor(public readonly payload: T) {
    super();
  }
  emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer02<T extends DepthCarrier02 = DepthCarrier02> extends CarrierLayer01<T> {
  readonly node: string = 'layer02';
  readonly depth: number = 2;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer03<T extends DepthCarrier03 = DepthCarrier03> extends CarrierLayer02<T> {
  readonly node: string = 'layer03';
  readonly depth: number = 3;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer04<T extends DepthCarrier04 = DepthCarrier04> extends CarrierLayer03<T> {
  readonly node: string = 'layer04';
  readonly depth: number = 4;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer05<T extends DepthCarrier05 = DepthCarrier05> extends CarrierLayer04<T> {
  readonly node: string = 'layer05';
  readonly depth: number = 5;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer06<T extends DepthCarrier06 = DepthCarrier06> extends CarrierLayer05<T> {
  readonly node: string = 'layer06';
  readonly depth: number = 6;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer07<T extends DepthCarrier07 = DepthCarrier07> extends CarrierLayer06<T> {
  readonly node: string = 'layer07';
  readonly depth: number = 7;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer08<T extends DepthCarrier08 = DepthCarrier08> extends CarrierLayer07<T> {
  readonly node: string = 'layer08';
  readonly depth: number = 8;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer09<T extends DepthCarrier09 = DepthCarrier09> extends CarrierLayer08<T> {
  readonly node: string = 'layer09';
  readonly depth: number = 9;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer10<T extends DepthCarrier10 = DepthCarrier10> extends CarrierLayer09<T> {
  readonly node: string = 'layer10';
  readonly depth: number = 10;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer11<T extends DepthCarrier11 = DepthCarrier11> extends CarrierLayer10<T> {
  readonly node: string = 'layer11';
  readonly depth: number = 11;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer12<T extends DepthCarrier12 = DepthCarrier12> extends CarrierLayer11<T> {
  readonly node: string = 'layer12';
  readonly depth: number = 12;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer13<T extends DepthCarrier13 = DepthCarrier13> extends CarrierLayer12<T> {
  readonly node: string = 'layer13';
  readonly depth: number = 13;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer14<T extends DepthCarrier14 = DepthCarrier14> extends CarrierLayer13<T> {
  readonly node: string = 'layer14';
  readonly depth: number = 14;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer15<T extends DepthCarrier15 = DepthCarrier15> extends CarrierLayer14<T> {
  readonly node: string = 'layer15';
  readonly depth: number = 15;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer16<T extends DepthCarrier16 = DepthCarrier16> extends CarrierLayer15<T> {
  readonly node: string = 'layer16';
  readonly depth: number = 16;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer17<T extends DepthCarrier17 = DepthCarrier17> extends CarrierLayer16<T> {
  readonly node: string = 'layer17';
  readonly depth: number = 17;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer18<T extends DepthCarrier18 = DepthCarrier18> extends CarrierLayer17<T> {
  readonly node: string = 'layer18';
  readonly depth: number = 18;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer19<T extends DepthCarrier19 = DepthCarrier19> extends CarrierLayer18<T> {
  readonly node: string = 'layer19';
  readonly depth: number = 19;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer20<T extends DepthCarrier20 = DepthCarrier20> extends CarrierLayer19<T> {
  readonly node: string = 'layer20';
  readonly depth: number = 20;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer21<T extends DepthCarrier21 = DepthCarrier21> extends CarrierLayer20<T> {
  readonly node: string = 'layer21';
  readonly depth: number = 21;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer22<T extends DepthCarrier22 = DepthCarrier22> extends CarrierLayer21<T> {
  readonly node: string = 'layer22';
  readonly depth: number = 22;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer23<T extends DepthCarrier23 = DepthCarrier23> extends CarrierLayer22<T> {
  readonly node: string = 'layer23';
  readonly depth: number = 23;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer24<T extends DepthCarrier24 = DepthCarrier24> extends CarrierLayer23<T> {
  readonly node: string = 'layer24';
  readonly depth: number = 24;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer25<T extends DepthCarrier25 = DepthCarrier25> extends CarrierLayer24<T> {
  readonly node: string = 'layer25';
  readonly depth: number = 25;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer26<T extends DepthCarrier26 = DepthCarrier26> extends CarrierLayer25<T> {
  readonly node: string = 'layer26';
  readonly depth: number = 26;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer27<T extends DepthCarrier27 = DepthCarrier27> extends CarrierLayer26<T> {
  readonly node: string = 'layer27';
  readonly depth: number = 27;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer28<T extends DepthCarrier28 = DepthCarrier28> extends CarrierLayer27<T> {
  readonly node: string = 'layer28';
  readonly depth: number = 28;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer29<T extends DepthCarrier29 = DepthCarrier29> extends CarrierLayer28<T> {
  readonly node: string = 'layer29';
  readonly depth: number = 29;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer30<T extends DepthCarrier30 = DepthCarrier30> extends CarrierLayer29<T> {
  readonly node: string = 'layer30';
  readonly depth: number = 30;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer31<T extends DepthCarrier31 = DepthCarrier31> extends CarrierLayer30<T> {
  readonly node: string = 'layer31';
  readonly depth: number = 31;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer32<T extends DepthCarrier32 = DepthCarrier32> extends CarrierLayer31<T> {
  readonly node: string = 'layer32';
  readonly depth: number = 32;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer33<T extends DepthCarrier33 = DepthCarrier33> extends CarrierLayer32<T> {
  readonly node: string = 'layer33';
  readonly depth: number = 33;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer34<T extends DepthCarrier34 = DepthCarrier34> extends CarrierLayer33<T> {
  readonly node: string = 'layer34';
  readonly depth: number = 34;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer35<T extends DepthCarrier35 = DepthCarrier35> extends CarrierLayer34<T> {
  readonly node: string = 'layer35';
  readonly depth: number = 35;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer36<T extends DepthCarrier36 = DepthCarrier36> extends CarrierLayer35<T> {
  readonly node: string = 'layer36';
  readonly depth: number = 36;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer37<T extends DepthCarrier37 = DepthCarrier37> extends CarrierLayer36<T> {
  readonly node: string = 'layer37';
  readonly depth: number = 37;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer38<T extends DepthCarrier38 = DepthCarrier38> extends CarrierLayer37<T> {
  readonly node: string = 'layer38';
  readonly depth: number = 38;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer39<T extends DepthCarrier39 = DepthCarrier39> extends CarrierLayer38<T> {
  readonly node: string = 'layer39';
  readonly depth: number = 39;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export class CarrierLayer40<T extends DepthCarrier40 = DepthCarrier40> extends CarrierLayer39<T> {
  readonly node: string = 'layer40';
  readonly depth: number = 40;
  override emit(): string {
    return `${this.node}:${this.depth}:${this.payload.tier}`;
  }
}

export type CarrierEnvelope<T extends DepthCarrier> = LayerPayload<T> & {
  readonly emitted: string;
  readonly matrix: CarrierTrace<T>;
};

export const instantiateCarrier = <T extends string>(tenantId: string): DepthCarrier40 => {
  return {
    tier: `tier-40-${tenantId}`,
    weight: tenantId.length,
    depth: 40,
    layer01: '01',
    layer02: '02',
    layer03: '03',
    layer04: '04',
    layer05: '05',
    layer06: '06',
    layer07: '07',
    layer08: '08',
    layer09: '09',
    layer10: '10',
    layer11: '11',
    layer12: '12',
    layer13: '13',
    layer14: '14',
    layer15: '15',
    layer16: '16',
    layer17: '17',
    layer18: '18',
    layer19: '19',
    layer20: '20',
    layer21: '21',
    layer22: '22',
    layer23: '23',
    layer24: '24',
    layer25: '25',
    layer26: '26',
    layer27: '27',
    layer28: '28',
    layer29: '29',
    layer30: '30',
    layer31: '31',
    layer32: '32',
    layer33: '33',
    layer34: '34',
    layer35: '35',
    layer36: '36',
    layer37: '37',
    layer38: '38',
    layer39: '39',
    layer40: '40',
  } as DepthCarrier40;
};

export const chainCarrierEmit = <T extends DepthCarrier>(carrier: T): string => {
  const keys: CarrierTrace<T> = [`${carrier.tier}:${carrier.depth}`];
  return `${carrier.tier}:${keys.join('|')}`;
};

export const deriveCarrierMatrix = <T extends DepthCarrier>(carrier: T): CarrierEnvelope<T> => ({
  payload: carrier,
  emitted: chainCarrierEmit(carrier),
  matrix: [`${carrier.tier}:${carrier.depth}`] as CarrierTrace<T>,
});
