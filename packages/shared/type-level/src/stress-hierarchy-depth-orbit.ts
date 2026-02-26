export interface OrbitLayer0 {
  readonly layer: string;
  readonly marker: number;
  readonly marker0?: 0;
}

export interface OrbitLayer1 extends OrbitLayer0 {
  readonly layer: string;
  readonly marker1?: 1;
}

export interface OrbitLayer2 extends OrbitLayer1 {
  readonly layer: string;
  readonly marker2?: 2;
}

export interface OrbitLayer3 extends OrbitLayer2 {
  readonly layer: string;
  readonly marker3?: 3;
}

export interface OrbitLayer4 extends OrbitLayer3 {
  readonly layer: string;
  readonly marker4?: 4;
}

export interface OrbitLayer5 extends OrbitLayer4 {
  readonly layer: string;
  readonly marker5?: 5;
}

export interface OrbitLayer6 extends OrbitLayer5 {
  readonly layer: string;
  readonly marker6?: 6;
}

export interface OrbitLayer7 extends OrbitLayer6 {
  readonly layer: string;
  readonly marker7?: 7;
}

export interface OrbitLayer8 extends OrbitLayer7 {
  readonly layer: string;
  readonly marker8?: 8;
}

export interface OrbitLayer9 extends OrbitLayer8 {
  readonly layer: string;
  readonly marker9?: 9;
}

export interface OrbitLayer10 extends OrbitLayer9 {
  readonly layer: string;
  readonly marker10?: 10;
}

export type OrbitChain = OrbitLayer10;
export type OrbitDepth = 10;

export interface OrbitLayerConfig {
  readonly layer: string;
  readonly depth: number;
  readonly next: number;
}

export type BuildLayerProfile<T extends OrbitLayerConfig> = {
  readonly depth: T['depth'];
  readonly next: T['next'];
  readonly trace: `profile-${T['depth'] & number}-${T['next'] & number}`;
};

type LayerRange<N extends number, Acc extends readonly unknown[] = []> = Acc['length'] extends N
  ? []
  : [BuildLayerProfile<{ layer: string; depth: Acc['length']; next: Acc['length'] }>, ...LayerRange<N, [...Acc, unknown]>];

export type LayerChainProfiles = LayerRange<3>;

export class OrbitEngineLayerBase<T extends string = 'layer-0'> {
  constructor(readonly token: T) {}

  profile(): OrbitLayer0 {
    return { layer: 'layer-0', marker: 0 };
  }
}

export type OrbitParent<T extends number> = T extends 0
  ? OrbitEngineLayerBase<'layer-0'>
  : T extends 1
    ? OrbitEngineLayerBase<'layer-1'>
    : T extends 2
      ? OrbitEngineLayerBase<'layer-2'>
      : T extends 3
        ? OrbitEngineLayerBase<'layer-3'>
        : T extends 4
          ? OrbitEngineLayerBase<'layer-4'>
          : T extends 5
            ? OrbitEngineLayerBase<'layer-5'>
            : T extends 6
              ? OrbitEngineLayerBase<'layer-6'>
              : T extends 7
                ? OrbitEngineLayerBase<'layer-7'>
                : T extends 8
                  ? OrbitEngineLayerBase<'layer-8'>
                  : T extends 9
                    ? OrbitEngineLayerBase<'layer-9'>
                    : OrbitEngineLayerBase<'layer-10'>;

export class OrbitEngineLayer0<T extends string = 'layer-0'> extends OrbitEngineLayerBase<T> {
  profile(): OrbitLayer0 {
    return { layer: 'layer-0', marker: 0 };
  }
}

export class OrbitEngineLayer1<T extends string = 'layer-1'> extends OrbitEngineLayerBase<T> {
  constructor(token: T, readonly parent: OrbitParent<0>) {
    super(token);
  }

  profile(): OrbitLayer1 {
    return { layer: 'layer-1', marker: 1 };
  }
}

export class OrbitEngineLayer2<T extends string = 'layer-2'> extends OrbitEngineLayerBase<T> {
  constructor(token: T, readonly parent: OrbitParent<1>) {
    super(token);
  }

  profile(): OrbitLayer2 {
    return { layer: 'layer-2', marker: 2 };
  }
}

export class OrbitEngineLayer3<T extends string = 'layer-3'> extends OrbitEngineLayerBase<T> {
  constructor(token: T, readonly parent: OrbitParent<2>) {
    super(token);
  }

  profile(): OrbitLayer3 {
    return { layer: 'layer-3', marker: 3 };
  }
}

export class OrbitEngineLayer4<T extends string = 'layer-4'> extends OrbitEngineLayerBase<T> {
  constructor(token: T, readonly parent: OrbitParent<3>) {
    super(token);
  }

  profile(): OrbitLayer4 {
    return { layer: 'layer-4', marker: 4 };
  }
}

export class OrbitEngineLayer5<T extends string = 'layer-5'> extends OrbitEngineLayerBase<T> {
  constructor(token: T, readonly parent: OrbitParent<4>) {
    super(token);
  }

  profile(): OrbitLayer5 {
    return { layer: 'layer-5', marker: 5 };
  }
}

export class OrbitEngineLayer6<T extends string = 'layer-6'> extends OrbitEngineLayerBase<T> {
  constructor(token: T, readonly parent: OrbitParent<5>) {
    super(token);
  }

  profile(): OrbitLayer6 {
    return { layer: 'layer-6', marker: 6 };
  }
}

export class OrbitEngineLayer7<T extends string = 'layer-7'> extends OrbitEngineLayerBase<T> {
  constructor(token: T, readonly parent: OrbitParent<6>) {
    super(token);
  }

  profile(): OrbitLayer7 {
    return { layer: 'layer-7', marker: 7 };
  }
}

export class OrbitEngineLayer8<T extends string = 'layer-8'> extends OrbitEngineLayerBase<T> {
  constructor(token: T, readonly parent: OrbitParent<7>) {
    super(token);
  }

  profile(): OrbitLayer8 {
    return { layer: 'layer-8', marker: 8 };
  }
}

export class OrbitEngineLayer9<T extends string = 'layer-9'> extends OrbitEngineLayerBase<T> {
  constructor(token: T, readonly parent: OrbitParent<8>) {
    super(token);
  }

  profile(): OrbitLayer9 {
    return { layer: 'layer-9', marker: 9 };
  }
}

export class OrbitEngineLayer10<T extends string = 'layer-10'> extends OrbitEngineLayerBase<T> {
  constructor(token: T, readonly parent: OrbitParent<9>) {
    super(token);
  }

  profile(): OrbitLayer10 {
    return { layer: 'layer-10', marker: 10 };
  }
}

export type OrbitEngineProfile =
  | OrbitLayer0
  | OrbitLayer1
  | OrbitLayer2
  | OrbitLayer3
  | OrbitLayer4
  | OrbitLayer5
  | OrbitLayer6
  | OrbitLayer7
  | OrbitLayer8
  | OrbitLayer9
  | OrbitLayer10;

export type OrbitProfileTuple = readonly [
  OrbitLayer0,
  OrbitLayer1,
  OrbitLayer2,
  OrbitLayer3,
  OrbitLayer4,
  OrbitLayer5,
  OrbitLayer6,
  OrbitLayer7,
  OrbitLayer8,
  OrbitLayer9,
  OrbitLayer10,
];

export const buildOrbitChain = () => {
  const seed = new OrbitEngineLayer0('layer-0');
  const one = new OrbitEngineLayer1('layer-1', seed);
  const two = new OrbitEngineLayer2('layer-2', one);
  const three = new OrbitEngineLayer3('layer-3', two);
  const four = new OrbitEngineLayer4('layer-4', three);
  const five = new OrbitEngineLayer5('layer-5', four);
  const six = new OrbitEngineLayer6('layer-6', five);
  const seven = new OrbitEngineLayer7('layer-7', six);
  const eight = new OrbitEngineLayer8('layer-8', seven);
  const nine = new OrbitEngineLayer9('layer-9', eight);
  const ten = new OrbitEngineLayer10('layer-10', nine);

  return {
    chain: [seed, one, two, three, four, five, six, seven, eight, nine, ten] as const,
    profile: [
      seed.profile(),
      one.profile(),
      two.profile(),
      three.profile(),
      four.profile(),
      five.profile(),
      six.profile(),
      seven.profile(),
      eight.profile(),
      nine.profile(),
      ten.profile(),
    ] as OrbitProfileTuple,
  };
};

export const orbitRoot: OrbitLayer10 = buildOrbitChain().profile[10];

export interface OrbitProfileGrid {
  readonly profile: OrbitEngineProfile;
  readonly tag: string;
}

export const orbitGrid = buildOrbitChain().profile.map((entry, index) => ({
  profile: entry,
  tag: `orbit-${index}`,
})) as readonly OrbitProfileGrid[];

export type OrbitTemplate = `/${string}/${string}/${string}`;
export type OrbitRouteCatalog = readonly OrbitTemplate[];
export const orbitCatalog = ['/orbital/launch/atlas', '/orbital/query/recover', '/orbital/sync/route'] as const;
