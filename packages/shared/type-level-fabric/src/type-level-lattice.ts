export type IdentityTag<T extends string> = `${T}:${string}`;

export interface LatticeBase<TLabel extends string = 'base'> {
  readonly label: TLabel;
  readonly stamp: IdentityTag<TLabel>;
  readonly depth: number;
}

export interface LatticeA extends LatticeBase<'A'> {
  readonly a: `layer-a-${number}`;
  readonly depth: number;
}
export interface LatticeB extends LatticeA { readonly b: `layer-b-${number}`; readonly depth: number; }
export interface LatticeC extends LatticeB { readonly c: `layer-c-${number}`; readonly depth: number; }
export interface LatticeD extends LatticeC { readonly d: `layer-d-${number}`; readonly depth: number; }
export interface LatticeE extends LatticeD { readonly e: `layer-e-${number}`; readonly depth: number; }
export interface LatticeF extends LatticeE { readonly f: `layer-f-${number}`; readonly depth: number; }
export interface LatticeG extends LatticeF { readonly g: `layer-g-${number}`; readonly depth: number; }
export interface LatticeH extends LatticeG { readonly h: `layer-h-${number}`; readonly depth: number; }
export interface LatticeI extends LatticeH { readonly i: `layer-i-${number}`; readonly depth: number; }
export interface LatticeJ extends LatticeI { readonly j: `layer-j-${number}`; readonly depth: number; }
export interface LatticeK extends LatticeJ { readonly k: `layer-k-${number}`; readonly depth: number; }
export interface LatticeL extends LatticeK { readonly l: `layer-l-${number}`; readonly depth: number; }
export interface LatticeM extends LatticeL { readonly m: `layer-m-${number}`; readonly depth: number; }
export interface LatticeN extends LatticeM { readonly n: `layer-n-${number}`; readonly depth: number; }
export interface LatticeO extends LatticeN { readonly o: `layer-o-${number}`; readonly depth: number; }
export interface LatticeP extends LatticeO { readonly p: `layer-p-${number}`; readonly depth: number; }
export interface LatticeQ extends LatticeP { readonly q: `layer-q-${number}`; readonly depth: number; }
export interface LatticeR extends LatticeQ { readonly r: `layer-r-${number}`; readonly depth: number; }
export interface LatticeS extends LatticeR { readonly s: `layer-s-${number}`; readonly depth: number; }
export interface LatticeT extends LatticeS { readonly t: `layer-t-${number}`; readonly depth: number; }
export interface LatticeU extends LatticeT { readonly u: `layer-u-${number}`; readonly depth: number; }
export interface LatticeV extends LatticeU { readonly v: `layer-v-${number}`; readonly depth: number; }
export interface LatticeW extends LatticeV { readonly w: `layer-w-${number}`; readonly depth: number; }
export interface LatticeX extends LatticeW { readonly x: `layer-x-${number}`; readonly depth: number; }
export interface LatticeY extends LatticeX { readonly y: `layer-y-${number}`; readonly depth: number; }
export interface LatticeZ extends LatticeY { readonly z: `layer-z-${number}`; readonly depth: number; }
export interface LatticeAA extends LatticeZ { readonly aa: `layer-aa-${number}`; readonly depth: number; }
export interface LatticeAB extends LatticeAA { readonly ab: `layer-ab-${number}`; readonly depth: number; }
export interface LatticeAC extends LatticeAB { readonly ac: `layer-ac-${number}`; readonly depth: number; }
export interface LatticeAD extends LatticeAC { readonly ad: `layer-ad-${number}`; readonly depth: number; }
export interface LatticeAE extends LatticeAD { readonly ae: `layer-ae-${number}`; readonly depth: number; }
export interface LatticeAF extends LatticeAE { readonly af: `layer-af-${number}`; readonly depth: number; }

export type LatticeChain = LatticeAF;

export type DeepChainDepth<T extends LatticeBase, C extends number = 0> = T extends { readonly depth: infer D }
  ? D extends number
    ? D
    : C
  : C;

export type DeepWalk<TChain extends LatticeBase> = {
  readonly depth: TChain['depth'];
  readonly marker: TChain['stamp'];
};

export type BrandedLatticeKey<T extends string> = T & { readonly __brand: 'lattice-key' };

export class FabricNode<TKind extends string = 'node', TLevel extends number = 0> {
  readonly kind: BrandedLatticeKey<TKind>;
  readonly level: TLevel;
  readonly marker: string;

  constructor(kind: TKind, level: TLevel, public readonly payload: string) {
    this.kind = `${kind}:${payload}` as BrandedLatticeKey<TKind>;
    this.level = level;
    this.marker = `${kind}-${payload}`;
  }

  asType() {
    return {
      kind: this.kind,
      level: this.level,
      marker: this.marker,
    } as const;
  }
}

export class FabricCarrier<TSeed extends LatticeA> {
  readonly node: FabricNode<'carrier', TSeed['depth']>;
  constructor(seed: TSeed, public readonly label: string) {
    this.node = new FabricNode('carrier', seed.depth, label);
  }
}

export class FabricCarrierA<TSeed extends LatticeA> extends FabricCarrier<TSeed> {
  readonly a: TSeed['a'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:A`);
    this.a = seed.a;
  }
}
export class FabricCarrierB<TSeed extends LatticeB> extends FabricCarrierA<TSeed> {
  readonly b: TSeed['b'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:B`);
    this.b = seed.b;
  }
}
export class FabricCarrierC<TSeed extends LatticeC> extends FabricCarrierB<TSeed> {
  readonly c: TSeed['c'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:C`);
    this.c = seed.c;
  }
}
export class FabricCarrierD<TSeed extends LatticeD> extends FabricCarrierC<TSeed> {
  readonly d: TSeed['d'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:D`);
    this.d = seed.d;
  }
}
export class FabricCarrierE<TSeed extends LatticeE> extends FabricCarrierD<TSeed> {
  readonly e: TSeed['e'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:E`);
    this.e = seed.e;
  }
}
export class FabricCarrierF<TSeed extends LatticeF> extends FabricCarrierE<TSeed> {
  readonly f: TSeed['f'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:F`);
    this.f = seed.f;
  }
}
export class FabricCarrierG<TSeed extends LatticeG> extends FabricCarrierF<TSeed> {
  readonly g: TSeed['g'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:G`);
    this.g = seed.g;
  }
}
export class FabricCarrierH<TSeed extends LatticeH> extends FabricCarrierG<TSeed> {
  readonly h: TSeed['h'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:H`);
    this.h = seed.h;
  }
}
export class FabricCarrierI<TSeed extends LatticeI> extends FabricCarrierH<TSeed> {
  readonly i: TSeed['i'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:I`);
    this.i = seed.i;
  }
}
export class FabricCarrierJ<TSeed extends LatticeJ> extends FabricCarrierI<TSeed> {
  readonly j: TSeed['j'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:J`);
    this.j = seed.j;
  }
}
export class FabricCarrierK<TSeed extends LatticeK> extends FabricCarrierJ<TSeed> {
  readonly k: TSeed['k'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:K`);
    this.k = seed.k;
  }
}
export class FabricCarrierL<TSeed extends LatticeL> extends FabricCarrierK<TSeed> {
  readonly l: TSeed['l'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:L`);
    this.l = seed.l;
  }
}
export class FabricCarrierM<TSeed extends LatticeM> extends FabricCarrierL<TSeed> {
  readonly m: TSeed['m'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:M`);
    this.m = seed.m;
  }
}
export class FabricCarrierN<TSeed extends LatticeN> extends FabricCarrierM<TSeed> {
  readonly n: TSeed['n'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:N`);
    this.n = seed.n;
  }
}
export class FabricCarrierO<TSeed extends LatticeO> extends FabricCarrierN<TSeed> {
  readonly o: TSeed['o'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:O`);
    this.o = seed.o;
  }
}
export class FabricCarrierP<TSeed extends LatticeP> extends FabricCarrierO<TSeed> {
  readonly p: TSeed['p'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:P`);
    this.p = seed.p;
  }
}
export class FabricCarrierQ<TSeed extends LatticeQ> extends FabricCarrierP<TSeed> {
  readonly q: TSeed['q'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:Q`);
    this.q = seed.q;
  }
}
export class FabricCarrierR<TSeed extends LatticeR> extends FabricCarrierQ<TSeed> {
  readonly r: TSeed['r'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:R`);
    this.r = seed.r;
  }
}
export class FabricCarrierS<TSeed extends LatticeS> extends FabricCarrierR<TSeed> {
  readonly s: TSeed['s'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:S`);
    this.s = seed.s;
  }
}
export class FabricCarrierT<TSeed extends LatticeT> extends FabricCarrierS<TSeed> {
  readonly t: TSeed['t'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:T`);
    this.t = seed.t;
  }
}
export class FabricCarrierU<TSeed extends LatticeU> extends FabricCarrierT<TSeed> {
  readonly u: TSeed['u'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:U`);
    this.u = seed.u;
  }
}
export class FabricCarrierV<TSeed extends LatticeV> extends FabricCarrierU<TSeed> {
  readonly v: TSeed['v'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:V`);
    this.v = seed.v;
  }
}
export class FabricCarrierW<TSeed extends LatticeW> extends FabricCarrierV<TSeed> {
  readonly w: TSeed['w'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:W`);
    this.w = seed.w;
  }
}
export class FabricCarrierX<TSeed extends LatticeX> extends FabricCarrierW<TSeed> {
  readonly x: TSeed['x'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:X`);
    this.x = seed.x;
  }
}
export class FabricCarrierY<TSeed extends LatticeY> extends FabricCarrierX<TSeed> {
  readonly y: TSeed['y'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:Y`);
    this.y = seed.y;
  }
}
export class FabricCarrierZ<TSeed extends LatticeZ> extends FabricCarrierY<TSeed> {
  readonly z: TSeed['z'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:Z`);
    this.z = seed.z;
  }
}
export class FabricCarrierAA<TSeed extends LatticeAA> extends FabricCarrierZ<TSeed> {
  readonly aa: TSeed['aa'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:AA`);
    this.aa = seed.aa;
  }
}
export class FabricCarrierAB<TSeed extends LatticeAB> extends FabricCarrierAA<TSeed> {
  readonly ab: TSeed['ab'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:AB`);
    this.ab = seed.ab;
  }
}
export class FabricCarrierAC<TSeed extends LatticeAC> extends FabricCarrierAB<TSeed> {
  readonly ac: TSeed['ac'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:AC`);
    this.ac = seed.ac;
  }
}
export class FabricCarrierAD<TSeed extends LatticeAD> extends FabricCarrierAC<TSeed> {
  readonly ad: TSeed['ad'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:AD`);
    this.ad = seed.ad;
  }
}
export class FabricCarrierAE<TSeed extends LatticeAE> extends FabricCarrierAD<TSeed> {
  readonly ae: TSeed['ae'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:AE`);
    this.ae = seed.ae;
  }
}
export class FabricCarrierAF<TSeed extends LatticeAF> extends FabricCarrierAE<TSeed> {
  readonly af: TSeed['af'];
  constructor(seed: TSeed, label: string) {
    super(seed, `${label}:AF`);
    this.af = seed.af;
  }
}

export const buildLatticeCarrier = <TSeed extends LatticeAF>(seed: TSeed): FabricCarrierAF<TSeed> => {
  return new FabricCarrierAF(seed, 'carrier');
};

export interface LatticeProfile {
  readonly chainDepth: 32;
  readonly layers: readonly string[];
  readonly nodeTags: readonly string[];
}

export const latticeProfile: LatticeProfile = {
  chainDepth: 32,
  layers: [
    'A',
    'B',
    'C',
    'D',
    'E',
    'F',
    'G',
    'H',
    'I',
    'J',
    'K',
    'L',
    'M',
    'N',
    'O',
    'P',
    'Q',
    'R',
    'S',
    'T',
    'U',
    'V',
    'W',
    'X',
    'Y',
    'Z',
    'AA',
    'AB',
    'AC',
    'AD',
    'AE',
    'AF',
  ],
  nodeTags: [
    'carrier',
    'runtime',
    'planner',
    'diagnostic',
    'operator',
    'mesh',
    'timeline',
    'control',
    'policy',
    'telemetry',
    'signal',
    'catalog',
    'solver',
    'solver:trace',
  ],
};
