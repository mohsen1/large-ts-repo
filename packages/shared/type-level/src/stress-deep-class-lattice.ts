import type { Brand } from './patterns';

export type BuildTuple<Length extends number, Acc extends unknown[] = []> =
  Acc['length'] extends Length ? Acc : BuildTuple<Length, [...Acc, unknown]>;

export type Decrement<N extends number> = BuildTuple<N> extends [infer _Head, ...infer Tail]
  ? Tail['length']
  : 0;

interface LatticeNode0 {
  readonly __tag: Brand<string, 'LatticeNode0'>;
  readonly depth: 0;
}

interface LatticeNode1 extends LatticeNode0 {
  readonly nodeA: Brand<string, 'A'>;
}

interface LatticeNode2 extends LatticeNode1 {
  readonly nodeB: number;
}

interface LatticeNode3 extends LatticeNode2 {
  readonly nodeC: string;
}

interface LatticeNode4 extends LatticeNode3 {
  readonly nodeD: boolean;
}

interface LatticeNode5 extends LatticeNode4 {
  readonly nodeE: Date;
}

interface LatticeNode6 extends LatticeNode5 {
  readonly nodeF: ReadonlyMap<string, number>;
}

interface LatticeNode7 extends LatticeNode6 {
  readonly nodeG: ReadonlySet<string>;
}

interface LatticeNode8 extends LatticeNode7 {
  readonly nodeH: bigint;
}

interface LatticeNode9 extends LatticeNode8 {
  readonly nodeI: symbol;
}

interface LatticeNode10 extends LatticeNode9 {
  readonly nodeJ: Array<bigint>;
}

interface LatticeNode11 extends LatticeNode10 {
  readonly nodeK: Promise<string>;
}

interface LatticeNode12 extends LatticeNode11 {
  readonly nodeL: { readonly kind: 'leaf'; readonly value: number };
}

interface LatticeNode13 extends LatticeNode12 {
  readonly nodeM: () => string;
}

interface LatticeNode14 extends LatticeNode13 {
  readonly nodeN: Iterable<number>;
}

interface LatticeNode15 extends LatticeNode14 {
  readonly nodeO: ArrayBuffer | ArrayBufferView;
}

interface LatticeNode16 extends LatticeNode15 {
  readonly nodeP: ReadonlyArray<string>;
}

interface LatticeNode17 extends LatticeNode16 {
  readonly nodeQ: Map<string, { readonly score: number }>;
}

interface LatticeNode18 extends LatticeNode17 {
  readonly nodeR: Set<{ readonly id: Brand<string, 'NodeR'> }>;
}

interface LatticeNode19 extends LatticeNode18 {
  readonly nodeS: unknown;
}

interface LatticeNode20 extends LatticeNode19 {
  readonly nodeT: readonly [string, number, boolean];
}

interface LatticeNode21 extends LatticeNode20 {
  readonly nodeU: { readonly nested: { readonly level: number } };
}

interface LatticeNode22 extends LatticeNode21 {
  readonly nodeV: { readonly handler: (value: string) => string };
}

interface LatticeNode23 extends LatticeNode22 {
  readonly nodeW: PromiseLike<number>;
}

interface LatticeNode24 extends LatticeNode23 {
  readonly nodeX: { readonly matrix: number[][] };
}

interface LatticeNode25 extends LatticeNode24 {
  readonly nodeY: { readonly status: 'ok' | 'warn' | 'error' };
}

interface LatticeNode26 extends LatticeNode25 {
  readonly nodeZ: { readonly code: Brand<string, 'NodeZ'> };
}

interface LatticeNode27 extends LatticeNode26 {
  readonly nodeAA: { readonly tags: readonly string[] };
}

interface LatticeNode28 extends LatticeNode27 {
  readonly nodeAB: { readonly profile: { readonly stage: number } };
}

interface LatticeNode29 extends LatticeNode28 {
  readonly nodeAC: { readonly route: `/${string}/${string}/${string}` };
}

interface LatticeNode30 extends LatticeNode29 {
  readonly nodeAD: { readonly checksum: Brand<string, 'Checksum'> };
}

interface LatticeNode31 extends LatticeNode30 {
  readonly nodeAE: { readonly depth: 31 };
}

interface LatticeNode32 extends LatticeNode31 {
  readonly nodeAF: { readonly depth: 32; readonly active: true };
}

interface LatticeNode33 extends LatticeNode32 {
  readonly nodeAG: { readonly depth: 33 };
}

interface LatticeNode34 extends LatticeNode33 {
  readonly nodeAH: { readonly depth: 34 };
}

interface LatticeNode35 extends LatticeNode34 {
  readonly nodeAI: { readonly depth: 35 };
}

interface LatticeNode36 extends LatticeNode35 {
  readonly nodeAJ: { readonly depth: 36 };
}

interface LatticeNode37 extends LatticeNode36 {
  readonly nodeAK: { readonly depth: 37 };
}

interface LatticeNode38 extends LatticeNode37 {
  readonly nodeAL: { readonly depth: 38 };
}

interface LatticeNode39 extends LatticeNode38 {
  readonly nodeAM: { readonly depth: 39 };
}

interface LatticeNode40 extends LatticeNode39 {
  readonly nodeAN: { readonly depth: 40 };
}

export type DeepObjectDepth = LatticeNode40;
export type DeepObjectTail = Omit<
  LatticeNode40,
  keyof LatticeNode39
>;

export interface DomainCarrier<TLabel extends string = 'carrier'> {
  readonly label: Brand<TLabel, 'DomainCarrier'>;
}

export interface DomainCarrierA<TLabel extends string, TPayload extends string> extends DomainCarrier<TLabel> {
  readonly payloadA: TPayload;
}

export interface DomainCarrierB<TLabel extends string, TPayload extends string, TIndex extends number>
  extends DomainCarrierA<TLabel, TPayload> {
  readonly payloadB: TIndex;
}

export interface DomainCarrierC<
  TLabel extends string,
  TPayload extends string,
  TIndex extends number,
  TState extends { readonly ok: boolean },
> extends DomainCarrierB<TLabel, TPayload, TIndex> {
  readonly payloadC: TState;
}

export class CarrierLayer0 {
  public constructor(public readonly brand: Brand<string, string>) {}

  public materialize(): string {
    return this.brand;
  }
}

export class CarrierLayer1<T extends string> extends CarrierLayer0 {
  public constructor(brand: Brand<string, string>, public readonly value: T) {
    super(brand);
  }

  public get label(): T {
    return this.value;
  }
}

export class CarrierLayer2<T extends string, U extends number> extends CarrierLayer1<T> {
  public constructor(brand: Brand<string, string>, value: T, public readonly rank: U) {
    super(brand, value);
  }

  public hasScore(score: U): boolean {
    return this.rank >= score;
  }
}

export class CarrierLayer3<T extends string, U extends number, V extends boolean> extends CarrierLayer2<T, U> {
  public constructor(
    brand: Brand<string, string>,
    value: T,
    rank: U,
    public readonly enabled: V,
  ) {
    super(brand, value, rank);
  }

  public isEnabled(): V {
    return this.enabled;
  }
}

export class CarrierLayer4<T extends string, U extends number, V extends boolean, W extends string[]> extends CarrierLayer3<T, U, V> {
  public constructor(
    brand: Brand<string, string>,
    value: T,
    rank: U,
    enabled: V,
    public readonly trail: W,
  ) {
    super(brand, value, rank, enabled);
  }

  public trailLength(): number {
    return this.trail.length;
  }
}

export class CarrierLayer5<T extends string, U extends number, V extends boolean, W extends string[], X extends object>
  extends CarrierLayer4<T, U, V, W> {
  public constructor(
    brand: Brand<string, string>,
    value: T,
    rank: U,
    enabled: V,
    trail: W,
    public readonly context: X,
  ) {
    super(brand, value, rank, enabled, trail);
  }

  public hasContext(): boolean {
    return Object.keys(this.context).length > 0;
  }
}

export class CarrierLayer6<T extends string, U extends number, V extends boolean, W extends string[], X extends object, Y extends symbol>
  extends CarrierLayer5<T, U, V, W, X> {
  public constructor(
    brand: Brand<string, string>,
    value: T,
    rank: U,
    enabled: V,
    trail: W,
    context: X,
    public readonly marker: Y,
  ) {
    super(brand, value, rank, enabled, trail, context);
  }

  public get markerAsString(): string {
    return String(this.marker);
  }
}

export class CarrierLayer7<T extends string, U extends number, V extends boolean, W extends string[], X extends object, Y extends symbol, Z extends bigint>
  extends CarrierLayer6<T, U, V, W, X, Y> {
  public constructor(
    brand: Brand<string, string>,
    value: T,
    rank: U,
    enabled: V,
    trail: W,
    context: X,
    marker: Y,
    public readonly checksum: Z,
  ) {
    super(brand, value, rank, enabled, trail, context, marker);
  }

  public checksumMatch(target: bigint): boolean {
    return this.checksum === target;
  }
}

export class CarrierLayer8<T extends string, U extends number, V extends boolean, W extends string[], X extends object, Y extends symbol, Z extends bigint, A extends [T, U]>
  extends CarrierLayer7<T, U, V, W, X, Y, Z> {
  public constructor(
    brand: Brand<string, string>,
    value: T,
    rank: U,
    enabled: V,
    trail: W,
    context: X,
    marker: Y,
    checksum: Z,
    public readonly signature: A,
  ) {
    super(brand, value, rank, enabled, trail, context, marker, checksum);
  }

  public signatureEquals([head, depth]: A): boolean {
    return this.signature[0] === head && this.signature[1] === depth;
  }
}

export class CarrierLayer9<T extends string, U extends number, V extends boolean, W extends string[], X extends object, Y extends symbol, Z extends bigint, A extends [T, U]>
  extends CarrierLayer8<T, U, V, W, X, Y, Z, A> {
  public constructor(
    brand: Brand<string, string>,
    value: T,
    rank: U,
    enabled: V,
    trail: W,
    context: X,
    marker: Y,
    checksum: Z,
    signature: A,
    public readonly budget: number,
  ) {
    super(brand, value, rank, enabled, trail, context, marker, checksum, signature);
  }

  public remaining(capacity: number): number {
    return this.budget - capacity;
  }
}

export class CarrierLayer10<T extends string, U extends number, V extends boolean, W extends string[], X extends object, Y extends symbol, Z extends bigint, A extends [T, U]>
  extends CarrierLayer9<T, U, V, W, X, Y, Z, A> {
  public constructor(
    brand: Brand<string, string>,
    value: T,
    rank: U,
    enabled: V,
    trail: W,
    context: X,
    marker: Y,
    checksum: Z,
    signature: A,
    budget: number,
    public readonly gate: string,
  ) {
    super(brand, value, rank, enabled, trail, context, marker, checksum, signature, budget);
    this.gate = gate;
  }
}

export class CarrierLayer11<T extends string, U extends number, V extends boolean, W extends string[], X extends object, Y extends symbol, Z extends bigint, A extends [T, U]>
  extends CarrierLayer10<T, U, V, W, X, Y, Z, A> {
  public readonly epoch: Date;

  public constructor(
    brand: Brand<string, string>,
    value: T,
    rank: U,
    enabled: V,
    trail: W,
    context: X,
    marker: Y,
    checksum: Z,
    signature: A,
    budget: number,
    gate: string,
    epoch = new Date(),
  ) {
    super(brand, value, rank, enabled, trail, context, marker, checksum, signature, budget, gate);
    this.epoch = epoch;
  }

  public isCurrent(now: Date): boolean {
    return this.epoch <= now;
  }
}

export type DeepChainCompatibility<Depth extends number> =
  Depth extends 0
    ? CarrierLayer0
    : Depth extends 1
      ? CarrierLayer1<string>
      : Depth extends 2
        ? CarrierLayer2<string, number>
        : Depth extends 3
          ? CarrierLayer3<string, number, boolean>
          : Depth extends 4
            ? CarrierLayer4<string, number, boolean, string[]>
            : Depth extends 5
              ? CarrierLayer5<string, number, boolean, string[], Record<string, unknown>>
              : Depth extends 6
                ? CarrierLayer6<string, number, boolean, string[], Record<string, unknown>, symbol>
                : Depth extends 7
                  ? CarrierLayer7<string, number, boolean, string[], Record<string, unknown>, symbol, bigint>
                  : Depth extends 8
                    ? CarrierLayer8<string, number, boolean, string[], Record<string, unknown>, symbol, bigint, [string, number]>
                    : Depth extends 9
                      ? CarrierLayer9<string, number, boolean, string[], Record<string, unknown>, symbol, bigint, [string, number]>
                      : Depth extends 10
                          ? CarrierLayer10<string, number, boolean, string[], Record<string, unknown>, symbol, bigint, [string, number]>
                        : Depth extends 11
                          ? CarrierLayer11<string, number, boolean, string[], Record<string, unknown>, symbol, bigint, [string, number]>
                          : CarrierLayer11<string, number, boolean, string[], Record<string, unknown>, symbol, bigint, [string, number]>;

// alias intentionally mirrors exported layers so recursive checks walk a deep constructor lattice
export type RecursedCarrier<T extends number> = T extends 0
  ? CarrierLayer0
  : T extends 1
    ? CarrierLayer1<string>
    : T extends 2
      ? CarrierLayer2<string, number>
      : T extends 3
        ? CarrierLayer3<string, number, boolean>
        : T extends 4
          ? CarrierLayer4<string, number, boolean, string[]>
          : T extends 5
            ? CarrierLayer5<string, number, boolean, string[], { readonly context: string }>
            : T extends 6
              ? CarrierLayer6<string, number, boolean, string[], { readonly context: string }, symbol>
              : T extends 7
                ? CarrierLayer7<string, number, boolean, string[], { readonly context: string }, symbol, bigint>
                : T extends 8
                  ? CarrierLayer8<string, number, boolean, string[], { readonly context: string }, symbol, bigint, [string, number]>
                  : T extends 9
                    ? CarrierLayer9<string, number, boolean, string[], { readonly context: string }, symbol, bigint, [string, number]>
                    : T extends 10
                      ? CarrierLayer10<string, number, boolean, string[], { readonly context: string }, symbol, bigint, [string, number]>
                      : T extends 11
                        ? CarrierLayer11<string, number, boolean, string[], { readonly context: string }, symbol, bigint, [string, number]>
                        : CarrierLayer11<string, number, boolean, string[], { readonly context: string }, symbol, bigint, [string, number]>;

export const latticeDepthValues = [
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '18',
  '19',
  '20',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30',
  '31',
  '32',
  '33',
  '34',
  '35',
  '36',
  '37',
  '38',
  '39',
  '40',
] as const satisfies ReadonlyArray<`${number}`>;

export type LatticeDepth = (typeof latticeDepthValues)[number];

export type DepthTuple<Depth extends number> = Depth extends 0
  ? []
  : [...BuildTuple<Depth>, ...DepthTuple<Decrement<Depth>>];

export type BuildCarrierState<Depth extends number> =
  Depth extends 0
    ? {
        readonly state: 'base';
        readonly tuple: [];
      }
    : {
        readonly state: `layer-${Depth}`;
        readonly tuple: DepthTuple<Depth>;
        readonly next: BuildCarrierState<Decrement<Depth>>;
      };

export type CarrierProfile<T extends number> = BuildCarrierState<T>;

export const carrierProfile = {
  profile: 'deep-lattice',
  maxDepth: 40,
  trace: latticeDepthValues,
  active: true,
} as const;

export type CarrierProfileShape = typeof carrierProfile;
