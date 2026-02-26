import type { Brand } from './patterns';

export type LevelMarker<L extends number> = Brand<string, `level:${L}`>;
export interface LayerBase {
  readonly name: string;
  readonly createdAt: number;
  readonly level: number;
}

export interface LayerA extends LayerBase {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerB extends LayerA {
  readonly level: number;
  readonly marker: LevelMarker<number>;
  readonly next: Omit<LayerA, 'createdAt'>;
}
export interface LayerC extends LayerB {
  readonly level: number;
  readonly marker: LevelMarker<number>;
  readonly next: Omit<LayerB, 'createdAt'>;
}
export interface LayerD extends LayerC {
  readonly level: number;
  readonly marker: LevelMarker<number>;
  readonly next: Omit<LayerC, 'createdAt'>;
}
export interface LayerE extends LayerD {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerF extends LayerE {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerG extends LayerF {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerH extends LayerG {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerI extends LayerH {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerJ extends LayerI {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerK extends LayerJ {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerL extends LayerK {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerM extends LayerL {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerN extends LayerM {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerO extends LayerN {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerP extends LayerO {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerQ extends LayerP {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerR extends LayerQ {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerS extends LayerR {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerT extends LayerS {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerU extends LayerT {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerV extends LayerU {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerW extends LayerV {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerX extends LayerW {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerY extends LayerX {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerZ extends LayerY {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerAA extends LayerZ {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerAB extends LayerAA {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerAC extends LayerAB {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerAD extends LayerAC {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerAE extends LayerAD {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerAF extends LayerAE {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerAG extends LayerAF {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerAH extends LayerAG {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerAI extends LayerAH {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerAJ extends LayerAI {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerAK extends LayerAJ {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerAL extends LayerAK {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerAM extends LayerAL {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerAN extends LayerAM {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerAO extends LayerAN {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerAP extends LayerAO {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerAQ extends LayerAP {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerAR extends LayerAQ {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}
export interface LayerAS extends LayerAR {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}

export interface LayerAT extends LayerAS {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}

export interface LayerAU extends LayerAT {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}

export interface LayerAV extends LayerAU {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}

export interface LayerAW extends LayerAV {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}

export interface LayerAX extends LayerAW {
  readonly level: number;
  readonly marker: LevelMarker<number>;
}

export type DeepLayerChain = LayerA &
  LayerB &
  LayerC &
  LayerD &
  LayerE &
  LayerF &
  LayerG &
  LayerH &
  LayerI &
  LayerJ &
  LayerK &
  LayerL &
  LayerM &
  LayerN &
  LayerO &
  LayerP &
  LayerQ &
  LayerR &
  LayerS &
  LayerT &
  LayerU &
  LayerV &
  LayerW &
  LayerX &
  LayerY &
  LayerZ &
  LayerAA &
  LayerAB &
  LayerAC &
  LayerAD &
  LayerAE &
  LayerAF &
  LayerAG &
  LayerAH &
  LayerAI &
  LayerAJ &
  LayerAK &
  LayerAL &
  LayerAM &
  LayerAN &
  LayerAO &
  LayerAP &
  LayerAQ &
  LayerAR &
  LayerAS &
  LayerAT &
  LayerAU &
  LayerAV &
  LayerAW &
  LayerAX;

export interface ChainAdapter {
  readonly id: Brand<string, 'chain-adapter'>;
  readonly name: string;
}

export class ProtoChain0<TDomain extends string = string, TPayload = unknown> {
  constructor(
    readonly domain: TDomain,
    readonly payload: TPayload,
  ) {}
  readonly depth: number = 0;
  resolve(): ChainAdapter {
    return { id: `${this.domain}:0` as Brand<string, 'chain-adapter'>, name: `${this.domain}-0` };
  }
}

export class ProtoChain1<TDomain extends string, TPayload> extends ProtoChain0<TDomain, TPayload> {
  override readonly depth: number = 1;
  override resolve() {
    return { ...super.resolve(), name: `${this.domain}-1` };
  }
}
export class ProtoChain2<TDomain extends string, TPayload, TMeta> extends ProtoChain1<TDomain, TPayload> {
  constructor(
    domain: TDomain,
    payload: TPayload,
    readonly meta: TMeta,
  ) {
    super(domain, payload);
  }
  override readonly depth: number = 2;
  override resolve() {
    return { ...super.resolve(), name: `${this.domain}-2` };
  }
}
export class ProtoChain3<TDomain extends string, TPayload, TMeta, TTag> extends ProtoChain2<TDomain, TPayload, TMeta> {
  constructor(
    domain: TDomain,
    payload: TPayload,
    meta: TMeta,
    readonly tag: TTag,
  ) {
    super(domain, payload, meta);
  }
  override readonly depth: number = 3;
}
export class ProtoChain4<TDomain extends string, TPayload, TMeta, TTag, TPath> extends ProtoChain3<TDomain, TPayload, TMeta, TTag> {
  constructor(
    domain: TDomain,
    payload: TPayload,
    meta: TMeta,
    tag: TTag,
    readonly path: TPath,
  ) {
    super(domain, payload, meta, tag);
  }
  override readonly depth: number = 4;
}

export type ProtoChainDepth<T extends number> = T extends 0
  ? ProtoChain0<string, unknown>
  : T extends 1
    ? ProtoChain1<string, unknown>
    : T extends 2
      ? ProtoChain2<string, unknown, unknown>
      : T extends 3
        ? ProtoChain3<string, unknown, unknown, unknown>
        : ProtoChain4<string, unknown, unknown, unknown, unknown>;

export type ChainNode<TDomain extends string, TPayload, TDepth extends number> = ProtoChainDepth<TDepth> & {
  readonly domain: TDomain;
  readonly payload: TPayload;
};

export type HierarchyCheck<TNode> = TNode extends ChainNode<string, unknown, infer D extends number>
  ? D extends 0 | 1 | 2 | 3 | 4
    ? 'shallow'
    : 'deep'
  : never;

export const buildChainAdapters = (seed: string): readonly ChainAdapter[] => {
  const base: LayerBase[] = [{ name: seed, createdAt: Date.now(), level: 0 }];
  const chains: ChainAdapter[] = [];
  for (let index = 0; index < 20; index += 1) {
    const current = new ProtoChain4(seed, base, { index }, `tag-${index}`, `path-${index}`);
    chains.push(current.resolve());
  }
  return chains;
};

export const stressLayerChain = buildChainAdapters('stress-domain');
