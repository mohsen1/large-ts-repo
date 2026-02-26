export type StressLayer0<Tag extends string = 'base'> = {
  readonly id: Tag;
  readonly layer: number;
  readonly fingerprint: `L0:${Tag}`;
};

export type StressLayer1<Tag extends string = 'L1'> = StressLayer0<`${Tag}:1`> & {
  readonly layer: number;
  readonly scale: 1;
  readonly branch: `branch-${Tag}`;
};

export type StressLayer2<Tag extends string = 'L2', Scale extends number = 2> = StressLayer1<`${Tag}:2`> & {
  readonly layer: number;
  readonly scale: Scale;
  readonly marker: `m2-${Scale}`;
};

export type StressLayer3<Tag extends string = 'L3', Scale extends number = 3, Flag extends boolean = false> = StressLayer2<`${Tag}:3`, Scale> & {
  readonly layer: number;
  readonly scale: Scale;
  readonly flag: Flag;
  readonly marker: `m3-${Flag}`;
};

export type StressLayer4<
  Tag extends string = 'L4',
  Scale extends number = 4,
  Flag extends boolean = true,
> = StressLayer3<`${Tag}:4`, Scale, Flag> & {
  readonly layer: number;
  readonly scale: Scale;
  readonly flag: Flag;
};

export type StressLayer5<Tag extends string = 'L5', Scale extends number = 5, TagB extends string = 'k'> =
  StressLayer4<`${Tag}:${TagB}`, Scale, true> & {
    readonly layer: number;
    readonly alias: TagB;
    readonly score: Scale;
  };

export type StressLayer6<Tag extends string = 'L6', Scale extends number = 6, Flag extends boolean = false> = StressLayer5<`${Tag}:6`, Scale> & {
  readonly layer: number;
  readonly flag: Flag;
};

export type StressLayer7<Tag extends string = 'L7', Scale extends number = 7, Flag extends boolean = true> = StressLayer6<`${Tag}:7`, Scale> & {
  readonly layer: number;
  readonly flag: Flag;
  readonly affinity: `a-${Scale}`;
};

export type StressLayer8<Tag extends string = 'L8', Scale extends number = 8, Kind extends number = 80> = StressLayer7<`${Tag}:8`, Scale> & {
  readonly layer: number;
  readonly kind: Kind;
};

export type StressLayer9<Tag extends string = 'L9', Scale extends number = 9, Kind extends number = 90> = StressLayer8<`${Tag}:9`, Scale, Kind> & {
  readonly layer: number;
  readonly kind: Kind;
};

export type StressLayer10<Tag extends string = 'L10', Scale extends number = 10, Kind extends string = 'k10'> =
  StressLayer9<`${Tag}:10`, Scale, 100> & {
    readonly layer: number;
    readonly kind: Kind;
  };

export type StressLayer11<Tag extends string = 'L11', Scale extends number = 11, Kind extends string = 'k11'> =
  StressLayer10<`${Tag}:11`, Scale, Kind> & {
    readonly layer: number;
    readonly checksum: `${Kind}-${Scale}`;
  };

export type StressLayer12<Tag extends string = 'L12', Scale extends number = 12, Kind extends string = 'k12'> =
  StressLayer11<`${Tag}:12`, Scale, Kind> & {
    readonly layer: number;
    readonly checksum: `${Kind}-${Scale}`;
  };

export type StressLayer13<Tag extends string = 'L13', Scale extends number = 13, Kind extends string = 'k13'> =
  StressLayer12<`${Tag}:13`, Scale, Kind> & {
    readonly layer: number;
    readonly budget: Scale;
  };

export type StressLayer14<Tag extends string = 'L14', Scale extends number = 14, Token extends string = 'tok14'> =
  StressLayer13<`${Tag}:14`, Scale, 'k14'> & {
    readonly layer: number;
    readonly token: Token;
  };

export type StressLayer15<Tag extends string = 'L15', Scale extends number = 15, Token extends string = 'tok15', Policy extends boolean = true> =
  StressLayer14<`${Tag}:15`, Scale, Token> & {
    readonly layer: number;
    readonly token: Token;
    readonly policy: Policy;
  };

export type StressLayer16<Tag extends string = 'L16', Scale extends number = 16, Token extends string = 'tok16', Policy extends boolean = false> =
  StressLayer15<`${Tag}:16`, Scale, Token, Policy> & {
    readonly layer: number;
    readonly policy: Policy;
  };

export type StressLayer17<Tag extends string = 'L17', Scale extends number = 17, Seed extends string = 'seed17'> =
  StressLayer16<`${Tag}:17`, Scale, 'tok17', true> & {
    readonly layer: number;
    readonly seed: Seed;
  };

export type StressLayer18<Tag extends string = 'L18', Scale extends number = 18, Seed extends string = 'seed18', Drift extends number = 18> =
  StressLayer17<`${Tag}:18`, Scale, Seed> & {
    readonly layer: number;
    readonly seed: Seed;
    readonly drift: Drift;
  };

export type StressLayer19<Tag extends string = 'L19', Scale extends number = 19, Seed extends string = 'seed19'> =
  StressLayer18<`${Tag}:19`, Scale, Seed, 19> & {
    readonly layer: number;
    readonly seed: Seed;
  };

export type StressLayer20<Tag extends string = 'L20', Scale extends number = 20, Seed extends string = 'seed20'> =
  StressLayer19<`${Tag}:20`, Scale, Seed> & {
    readonly layer: number;
    readonly checksum: `${Seed}:${Scale}`;
  };

export type StressLayer21<Tag extends string = 'L21', Scale extends number = 21, Marker extends string = 'm21'> =
  StressLayer20<`${Tag}:21`, Scale, 'seed21'> & {
    readonly layer: number;
    readonly marker: Marker;
  };

export type StressLayer22<
  Tag extends string = 'L22',
  Scale extends number = 22,
  Marker extends string = 'm22',
  Window extends number = 2,
> = StressLayer21<`${Tag}:22`, Scale, Marker> & {
  readonly layer: number;
  readonly marker: Marker;
  readonly window: Window;
};

export type StressLayer23<
  Tag extends string = 'L23',
  Scale extends number = 23,
  Window extends number = 3,
  State extends 'open' | 'closed' = 'open',
> = StressLayer22<`${Tag}:23`, Scale, `m-${Scale}`, Window> & {
  readonly layer: number;
  readonly state: State;
};

export type StressLayer24<
  Tag extends string = 'L24',
  Scale extends number = 24,
  Window extends number = 4,
  State extends 'open' | 'closed' = 'open',
> = StressLayer23<`${Tag}:24`, Scale, Window, State> & {
  readonly layer: number;
  readonly window: Window;
};

export type StressLayer25<Tag extends string = 'L25', Scale extends number = 25, Window extends number = 5> =
  StressLayer24<`${Tag}:25`, Scale, Window, 'open'> & {
    readonly layer: number;
  };

export type StressLayer26<Tag extends string = 'L26', Scale extends number = 26, Slot extends number = 26> =
  StressLayer25<`${Tag}:26`, Scale, Slot> & {
    readonly layer: number;
    readonly slot: Slot;
  };

export type StressLayer27<Tag extends string = 'L27', Scale extends number = 27, Slot extends number = 27> =
  StressLayer26<`${Tag}:27`, Scale, Slot> & {
    readonly layer: number;
    readonly slot: Slot;
  };

export type StressLayer28<Tag extends string = 'L28', Scale extends number = 28, Slot extends number = 28> =
  StressLayer27<`${Tag}:28`, Scale, Slot> & {
    readonly layer: number;
    readonly slot: Slot;
  };

export type StressLayer29<Tag extends string = 'L29', Scale extends number = 29, TagC extends string = 'tag29'> =
  StressLayer28<`${Tag}:29`, Scale, 29> & {
    readonly layer: number;
    readonly tag: TagC;
  };

export type StressLayer30<Tag extends string = 'L30', Scale extends number = 30, TagC extends string = 'tag30'> =
  StressLayer29<`${Tag}:30`, Scale, TagC> & {
    readonly layer: number;
    readonly tag: TagC;
  };

export type StressLayer31<
  Tag extends string = 'L31',
  Scale extends number = 31,
  TagC extends string = 'tag31',
  Probe extends boolean = true,
> = StressLayer30<`${Tag}:31`, Scale, TagC> & {
  readonly layer: number;
  readonly probe: Probe;
};

export type StressLayer32<
  Tag extends string = 'L32',
  Scale extends number = 32,
  TagC extends string = 'tag32',
  Probe extends boolean = false,
> = StressLayer31<`${Tag}:32`, Scale, TagC, Probe> & {
  readonly layer: number;
  readonly probe: Probe;
};

export type StressLayer33<Tag extends string = 'L33', Scale extends number = 33, TagC extends string = 'tag33'> =
  StressLayer32<`${Tag}:33`, Scale, TagC, false> & {
    readonly layer: number;
    readonly score: Scale;
  };

export type StressLayer34<Tag extends string = 'L34', Scale extends number = 34, TagC extends string = 'tag34'> =
  StressLayer33<`${Tag}:34`, Scale, TagC> & {
    readonly layer: number;
    readonly token: TagC;
  };

export type StressLayer35<Tag extends string = 'L35', Scale extends number = 35, TagC extends string = 'tag35'> =
  StressLayer34<`${Tag}:35`, Scale, TagC> & {
    readonly layer: number;
    readonly token: TagC;
    readonly terminal: true;
  };

export class StressChainClass0<TTag extends string, TDepth extends number = 0> {
  constructor(public readonly tag: TTag, public readonly depth: TDepth) {}
  isTerminal(): boolean {
    return false;
  }
}

export class StressChainClass1<TTag extends string, TDepth extends number = 1> extends StressChainClass0<TTag, TDepth> {
  constructor(public override tag: TTag, public override depth: TDepth, public readonly payload: `c1-${TTag}`) {
    super(tag, depth);
  }
  nextState(): `${TTag}:${TDepth}` {
    return `${this.tag}:${this.depth}`;
  }
}

export class StressChainClass2<TTag extends string, TDepth extends number = 2, TValue extends number = 2>
  extends StressChainClass1<TTag, TDepth> {
  constructor(public override tag: TTag, public override depth: TDepth, public readonly count: TValue) {
    super(tag, depth, `c1-${tag}`);
  }
  getWeight(): TValue {
    return this.count;
  }
}

export class StressChainClass3<TTag extends string, TDepth extends number = 3, TValue extends number = 3>
  extends StressChainClass2<TTag, TDepth, TValue> {
  constructor(
    public override tag: TTag,
    public override depth: TDepth,
    public readonly count: TValue,
    public readonly flag: boolean,
  ) {
    super(tag, depth, count);
  }
}

export class StressChainClass4<TTag extends string, TDepth extends number = 4, TValue extends string = '4'>
  extends StressChainClass3<TTag, TDepth, 4> {
  constructor(tag: TTag, depth: TDepth, private readonly seed: TValue) {
    super(tag, depth, 4, true);
  }
  toSeed(): TValue {
    return `${this.tag}:${this.seed}` as TValue;
  }
}

export class StressChainClass5<TTag extends string, TDepth extends number = 5, TValue extends string = '5'>
  extends StressChainClass4<TTag, TDepth, TValue> {
  constructor(tag: TTag, depth: TDepth, seed: TValue) {
    super(tag, depth, seed);
  }
  isTerminal(): boolean {
    return this.depth >= 5;
  }
}

export class StressChainClass6<TTag extends string, TDepth extends number = 6, TValue extends string = '6'>
  extends StressChainClass5<TTag, TDepth, TValue> {
  constructor(tag: TTag, depth: TDepth, seed: TValue) {
    super(tag, depth, seed);
  }
  getSeedPrefix(): `c6-${TTag}` {
    return `c6-${this.tag}`;
  }
}

export class StressChainClass7<TTag extends string, TDepth extends number = 7, TValue extends string = '7'>
  extends StressChainClass6<TTag, TDepth, TValue> {
  constructor(tag: TTag, depth: TDepth, seed: TValue) {
    super(tag, depth, seed);
  }
}

export class StressChainClass8<TTag extends string, TDepth extends number = 8, TValue extends string = '8'>
  extends StressChainClass7<TTag, TDepth, TValue> {
  constructor(tag: TTag, depth: TDepth, seed: TValue) {
    super(tag, depth, seed);
  }
  getDepthCode(): `c8-${TDepth}` {
    return `c8-${this.depth}`;
  }
}

export class StressChainClass9<TTag extends string, TDepth extends number = 9, TValue extends string = '9'>
  extends StressChainClass8<TTag, TDepth, TValue> {
  constructor(tag: TTag, depth: TDepth, seed: TValue) {
    super(tag, depth, seed);
  }
}

export class StressChainClass10<TTag extends string, TDepth extends number = 10, TValue extends string = '10'>
  extends StressChainClass9<TTag, TDepth, TValue> {
  constructor(tag: TTag, depth: TDepth, seed: TValue) {
    super(tag, depth, seed);
  }
}

export class StressChainClass11<TTag extends string, TDepth extends number = 11, TValue extends string = '11'>
  extends StressChainClass10<TTag, TDepth, TValue> {
  constructor(tag: TTag, depth: TDepth, seed: TValue) {
    super(tag, depth, seed);
  }
}

export class StressChainClass12<TTag extends string, TDepth extends number = 12, TValue extends string = '12'>
  extends StressChainClass11<TTag, TDepth, TValue> {
  constructor(tag: TTag, depth: TDepth, seed: TValue) {
    super(tag, depth, seed);
  }
}

export class StressChainClass13<TTag extends string, TDepth extends number = 13, TValue extends string = '13'>
  extends StressChainClass12<TTag, TDepth, TValue> {
  constructor(tag: TTag, depth: TDepth, seed: TValue) {
    super(tag, depth, seed);
  }
}

export class StressChainClass14<TTag extends string, TDepth extends number = 14, TValue extends string = '14'>
  extends StressChainClass13<TTag, TDepth, TValue> {
  constructor(tag: TTag, depth: TDepth, seed: TValue) {
    super(tag, depth, seed);
  }
}

export class StressChainClass15<TTag extends string, TDepth extends number = 15, TValue extends string = '15'>
  extends StressChainClass14<TTag, TDepth, TValue> {
  constructor(tag: TTag, depth: TDepth, seed: TValue) {
    super(tag, depth, seed);
  }
  getDepthLabel(): `L15-${TDepth}` {
    return `L15-${this.depth}`;
  }
}

export type StressLayerChain = [
  StressLayer35<string>,
  StressLayer34<string>,
  StressLayer33<string>,
  StressLayer32<string>,
  StressLayer31<string>,
  StressLayer30<string>,
  StressLayer29<string>,
  StressLayer28<string>,
  StressLayer27<string>,
  StressLayer26<string>,
  StressLayer25<string>,
  StressLayer24<string>,
  StressLayer23<string>,
  StressLayer22<string>,
  StressLayer21<string>,
  StressLayer20<string>,
  StressLayer19<string>,
  StressLayer18<string>,
  StressLayer17<string>,
  StressLayer16<string>,
  StressLayer15<string>,
  StressLayer14<string>,
  StressLayer13<string>,
  StressLayer12<string>,
  StressLayer11<string>,
  StressLayer10<string>,
  StressLayer9<string>,
  StressLayer8<string>,
  StressLayer7<string>,
  StressLayer6<string>,
  StressLayer5<string>,
  StressLayer4<string>,
  StressLayer3<string>,
  StressLayer2<string>,
  StressLayer1<string>,
  StressLayer0<string>
];

export type DeepLayerUnion = StressLayerChain[number];
export type DeepLayerTypeDepth<T> = T extends { readonly layer: infer L } ? L : never;

export type StructuralCompatibilityCheck<T> = T extends StressLayer30<any> ? true : T extends StressLayer20<any> ? true : false;

export type LayerChainValue<T extends { readonly layer: number }> = {
  readonly token: `chain-${T['layer']}`;
  readonly payload: T;
};
