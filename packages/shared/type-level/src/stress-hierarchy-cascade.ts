export interface CascadeNode0 {
  readonly depth: number;
  readonly label: string;
  readonly token: string;
  readonly parent?: unknown;
  readonly marker: string;
  readonly active: boolean;
  readonly chain: readonly unknown[];
}

export interface CascadeNode1 extends CascadeNode0 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode2 extends CascadeNode1 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode3 extends CascadeNode2 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode4 extends CascadeNode3 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode5 extends CascadeNode4 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode6 extends CascadeNode5 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode7 extends CascadeNode6 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode8 extends CascadeNode7 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode9 extends CascadeNode8 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode10 extends CascadeNode9 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode11 extends CascadeNode10 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode12 extends CascadeNode11 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode13 extends CascadeNode12 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode14 extends CascadeNode13 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode15 extends CascadeNode14 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode16 extends CascadeNode15 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode17 extends CascadeNode16 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode18 extends CascadeNode17 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode19 extends CascadeNode18 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode20 extends CascadeNode19 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode21 extends CascadeNode20 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode22 extends CascadeNode21 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode23 extends CascadeNode22 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode24 extends CascadeNode23 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode25 extends CascadeNode24 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode26 extends CascadeNode25 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode27 extends CascadeNode26 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode28 extends CascadeNode27 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode29 extends CascadeNode28 {
  readonly parent?: unknown;
  readonly marker: string;
}

export interface CascadeNode30 extends CascadeNode29 {
  readonly parent?: unknown;
  readonly marker: string;
}

export type DeepCascade = CascadeNode30 & {
  readonly final: true;
  readonly signature: `depth-${number}`;
  readonly mode?: 'leaf';
};

export interface GenericCascadeBase<TPayload, TDepth extends number = number> {
  readonly depth: TDepth;
  readonly payload: TPayload;
  chain: readonly unknown[];
  readonly active: boolean;
}

export class CascadeClass0<TPayload = string> implements GenericCascadeBase<TPayload, number> {
  public readonly depth: number = 0;
  public chain: readonly unknown[] = [];
  public readonly active = true;
  public constructor(public readonly payload: TPayload) {}
}

export class CascadeClass1<
  TPayload = string,
  TNext extends GenericCascadeBase<TPayload, number> = GenericCascadeBase<TPayload, 0>,
> extends CascadeClass0<TPayload> {
  public readonly depth: number = 1;
  public constructor(payload: TPayload, public readonly next: TNext) {
    super(payload);
    this.chain = [...next.chain, payload];
  }
}

export class CascadeClass2<
  TPayload = string,
  TPolicy extends string = string,
  TNext extends GenericCascadeBase<TPayload, number> = GenericCascadeBase<TPayload, 1>,
> extends CascadeClass1<TPayload, TNext> {
  public readonly depth: number = 2;
  public readonly policy: TPolicy;
  public constructor(payload: TPayload, policy: TPolicy, next: TNext) {
    super(payload, next);
    this.policy = policy;
    this.chain = [...next.chain, policy];
  }
}

export class CascadeClass3<
  TPayload = string,
  TPolicy extends string = string,
  TNext extends GenericCascadeBase<TPayload, number> = GenericCascadeBase<TPayload, 2>,
> extends CascadeClass2<TPayload, TPolicy, TNext> {
  public readonly depth: number = 3;
  public constructor(payload: TPayload, policy: TPolicy, next: TNext, public readonly context?: unknown) {
    super(payload, policy, next);
    this.chain = [...next.chain, context];
  }
}

export class CascadeClass4<
  TPayload = string,
  TPolicy extends string = string,
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TNext extends GenericCascadeBase<TPayload, number> = GenericCascadeBase<TPayload, 3>,
> extends CascadeClass3<TPayload, TPolicy, TNext> {
  public readonly depth: number = 4;
  public readonly context: TContext;
  public constructor(payload: TPayload, policy: TPolicy, context: TContext, next: TNext) {
    super(payload, policy, next, context);
    this.context = context;
    this.chain = [...next.chain, context];
  }
}

export class CascadeClass5<
  TPayload = string,
  TPolicy extends string = string,
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TNext extends GenericCascadeBase<TPayload, number> = GenericCascadeBase<TPayload, 4>,
> extends CascadeClass4<TPayload, TPolicy, TContext, TNext> {
  public readonly depth: number = 5;
  public readonly stamp = new Date();
  public constructor(payload: TPayload, policy: TPolicy, context: TContext, next: TNext, stamp = new Date()) {
    super(payload, policy, context, next);
    this.stamp = stamp;
    this.chain = [...next.chain, stamp];
  }
}

export class CascadeClass6<
  TPayload = string,
  TPolicy extends string = string,
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TStamp extends Date = Date,
  TNext extends GenericCascadeBase<TPayload, number> = GenericCascadeBase<TPayload, 5>,
> extends CascadeClass5<TPayload, TPolicy, TContext, TNext> {
  public readonly depth: number = 6;
  public readonly stamp: TStamp;
  public constructor(payload: TPayload, policy: TPolicy, context: TContext, stamp: TStamp, next: TNext) {
    super(payload, policy, context, next, stamp as unknown as Date);
    this.stamp = stamp;
    this.chain = [...next.chain, stamp];
  }
}

export class CascadeClass7<
  TPayload = string,
  TPolicy extends string = string,
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TStamp extends Date = Date,
  TScope extends string = string,
  TNext extends GenericCascadeBase<TPayload, number> = GenericCascadeBase<TPayload, 6>,
> extends CascadeClass6<TPayload, TPolicy, TContext, TStamp, TNext> {
  public readonly depth: number = 7;
  public readonly scope: TScope;
  public constructor(payload: TPayload, policy: TPolicy, context: TContext, stamp: TStamp, scope: TScope, next: TNext) {
    super(payload, policy, context, stamp, next);
    this.scope = scope;
    this.chain = [...next.chain, scope];
  }
}

export class CascadeClass8<
  TPayload = string,
  TPolicy extends string = string,
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TStamp extends Date = Date,
  TScope extends string = string,
  TNext extends GenericCascadeBase<TPayload, number> = GenericCascadeBase<TPayload, 7>,
  TExtra extends readonly unknown[] = readonly unknown[],
> extends CascadeClass7<TPayload, TPolicy, TContext, TStamp, TScope, TNext> {
  public readonly depth: number = 8;
  public constructor(
    payload: TPayload,
    policy: TPolicy,
    context: TContext,
    stamp: TStamp,
    scope: TScope,
    next: TNext,
    public readonly extra: TExtra = [] as unknown as TExtra,
  ) {
    super(payload, policy, context, stamp, scope, next);
    this.chain = [...next.chain, extra];
  }
}

export class CascadeClass9<
  TPayload = string,
  TPolicy extends string = string,
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TStamp extends Date = Date,
  TScope extends string = string,
  TExtra extends readonly unknown[] = readonly unknown[],
  TNext extends GenericCascadeBase<TPayload, number> = GenericCascadeBase<TPayload, 8>,
> extends CascadeClass8<TPayload, TPolicy, TContext, TStamp, TScope, TNext, TExtra> {
  public readonly depth: number = 9;
  public constructor(
    payload: TPayload,
    policy: TPolicy,
    context: TContext,
    stamp: TStamp,
    scope: TScope,
    extra: TExtra,
    next: TNext,
  ) {
    super(payload, policy, context, stamp, scope, next, extra);
    this.chain = [...next.chain, ...extra];
  }
}

export class CascadeClass10<
  TPayload = string,
  TPolicy extends string = string,
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TStamp extends Date = Date,
  TScope extends string = string,
  TExtra extends readonly unknown[] = readonly unknown[],
  TNext extends GenericCascadeBase<TPayload, number> = GenericCascadeBase<TPayload, 9>,
> extends CascadeClass9<TPayload, TPolicy, TContext, TStamp, TScope, TExtra, TNext> {
  public readonly depth: number = 10;
  public constructor(
    payload: TPayload,
    policy: TPolicy,
    context: TContext,
    stamp: TStamp,
    scope: TScope,
    extra: TExtra,
    next: TNext,
  ) {
    super(payload, policy, context, stamp, scope, extra, next);
    this.chain = [...next.chain, { payload, policy, context }];
  }
}

export type DeepClassChain = CascadeClass10<
  unknown,
  string,
  Record<string, unknown>,
  Date,
  string,
  readonly unknown[],
  CascadeClass9<
    unknown,
    string,
    Record<string, unknown>,
    Date,
    string,
    readonly unknown[],
    GenericCascadeBase<unknown, number>
  >
>;

export type StructuralCompatibility =
  | CascadeNode0
  | CascadeNode10
  | CascadeNode20
  | CascadeNode30
  | CascadeClass0
  | CascadeClass5
  | CascadeClass10;

export type CompatibilityCheck<T extends StructuralCompatibility> =
  T extends CascadeNode30
    ? 'leaf'
    : T extends CascadeNode20
      ? 'mid'
      : T extends CascadeNode10
        ? 'low'
        : T extends CascadeClass10
          ? 'high'
          : 'base';

export type CascadeIndex = {
  [K in 'node-0' | 'node-10' | 'node-20' | 'node-30' | 'chain-0' | 'chain-5' | 'chain-10']: boolean;
};

export const cascadeSeed = (): StructuralCompatibility => ({
  depth: 0,
  label: 'cascade-0',
  token: 'N0',
  marker: 'cascade-0',
  active: true,
  chain: [],
} satisfies CascadeNode0);

export const buildCascadeChain = (
  ...nodes: StructuralCompatibility[]
): readonly StructuralCompatibility[] => {
  const ordered = nodes.slice().sort((left, right) => {
    if (left.depth < right.depth) return -1;
    if (left.depth > right.depth) return 1;
    return 0;
  });
  return ordered;
};

export const cascadeChain = buildCascadeChain(
  {
    depth: 10,
    label: 'base-10',
    token: 'N10',
    marker: 'cascade-10',
    active: true,
    parent: {
      depth: 9,
      label: 'base-9',
      token: 'N9',
      marker: 'cascade-9',
      active: true,
      chain: ['base-0'],
      parent: undefined,
    } as CascadeNode9,
    chain: ['seed'],
  } as CascadeNode10,
  { depth: 20, label: 'base-20', token: 'N20', marker: 'cascade-20', active: true, chain: [] } as CascadeNode20,
  { depth: 30, label: 'base-30', token: 'N30', marker: 'cascade-30', active: true, chain: [] } as CascadeNode30,
  {
    depth: 0,
    label: 'class-0',
    token: 'N0',
    marker: 'class-0',
    payload: 'seed',
    active: true,
    chain: [],
  } as unknown as CascadeClass0,
  {
    depth: 5,
    label: 'class-5',
    token: 'N5',
    marker: 'class-5',
    payload: 'seed',
    active: true,
    chain: [],
    policy: 'inspect',
    context: {},
    next: {} as unknown as CascadeClass4,
    stamp: new Date(),
  } as unknown as CascadeClass5,
  {
    depth: 10,
    label: 'class-10',
    token: 'N10',
    marker: 'class-10',
    payload: 'seed',
    active: true,
    chain: [],
    policy: 'inspect',
    context: {},
    next: {} as unknown as CascadeClass9,
    stamp: new Date(),
    scope: 'class-10',
    extra: [] as readonly unknown[],
  } as unknown as CascadeClass10,
);
