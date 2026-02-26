export type BinaryToken =
  | 'start'
  | 'stop'
  | 'pause'
  | 'resume'
  | 'drain'
  | 'flush'
  | 'commit'
  | 'rollback'
  | 'merge'
  | 'split'
  | 'publish'
  | 'suppress'
  | 'escalate'
  | 'recover'
  | 'archive';

export type TriState = 'open' | 'hold' | 'closed' | 'unknown';

export type BinaryState =
  | { readonly ready: true; readonly open: true; readonly scope: 'active' }
  | { readonly ready: false; readonly open: false; readonly scope: 'inactive' }
  | { readonly ready: true; readonly open: false; readonly scope: 'draining' }
  | { readonly ready: false; readonly open: true; readonly scope: 'recovering' };

export type BranchByToken<T extends BinaryToken> =
  T extends 'start'
    ? BinaryState & { readonly token: 'start'; readonly phase: 'initialize' }
    : T extends 'stop'
      ? BinaryState & { readonly token: 'stop'; readonly phase: 'shutdown' }
      : T extends 'pause'
        ? BinaryState & { readonly token: 'pause'; readonly phase: 'waiting' }
        : T extends 'resume'
          ? BinaryState & { readonly token: 'resume'; readonly phase: 'active' }
          : T extends 'drain'
            ? BinaryState & { readonly token: 'drain'; readonly phase: 'cleanup' }
            : T extends 'flush'
              ? BinaryState & { readonly token: 'flush'; readonly phase: 'cleanup' }
              : T extends 'commit'
                ? BinaryState & { readonly token: 'commit'; readonly phase: 'finalize' }
                : T extends 'rollback'
                  ? BinaryState & { readonly token: 'rollback'; readonly phase: 'restore' }
                  : T extends 'merge'
                    ? BinaryState & { readonly token: 'merge'; readonly phase: 'compose' }
                    : T extends 'split'
                      ? BinaryState & { readonly token: 'split'; readonly phase: 'partition' }
                      : T extends 'publish'
                        ? BinaryState & { readonly token: 'publish'; readonly phase: 'broadcast' }
                        : T extends 'suppress'
                          ? BinaryState & { readonly token: 'suppress'; readonly phase: 'throttle' }
                          : T extends 'escalate'
                            ? BinaryState & { readonly token: 'escalate'; readonly phase: 'alert' }
                            : T extends 'recover'
                              ? BinaryState & { readonly token: 'recover'; readonly phase: 'repair' }
                              : BinaryState & { readonly token: 'archive'; readonly phase: 'persist' };

export type BinarySignal<T> =
  T extends BinaryToken
    ? BranchByToken<T> extends infer B
      ? B extends { readonly token: infer K; readonly phase: infer P }
        ? { readonly key: K; readonly phase: P }
        : never
      : never
    : never;

export type NumericSequence<N extends number, T extends unknown[] = []> =
  T['length'] extends N ? T : NumericSequence<N, [...T, T['length']]>;

export type Inc<N extends number> =
  N extends 0
    ? 1
    : N extends 1
      ? 2
      : N extends 2
        ? 3
        : N extends 3
          ? 4
          : N extends 4
            ? 5
            : N extends 5
              ? 6
              : N extends 6
                ? 7
                : N extends 7
                  ? 8
                  : N extends 8
                    ? 9
                    : N extends 9
                      ? 10
                      : 10;

export type ArithmeticExpr<N extends number> =
  N extends 0
    ? 0
    : N extends 1
      ? 1
      : N extends 2
        ? 3
        : N extends 3
          ? 6
          : N extends 4
            ? 10
            : N extends 5
              ? 15
              : N extends 6
                ? 21
                : N extends 7
                  ? 28
                  : N extends 8
                    ? 36
                    : N extends 9
                      ? 45
                      : N extends 10
                        ? 55
                        : never;

export type BoolChain<T, N extends number = 0> =
  N extends 14
    ? T
    : BoolChain<T extends boolean ? (N extends 0 ? true : false) : never, Inc<N>>;

export type BranchDecision<T extends BinaryToken> =
  T extends 'start'
    ? true
    : T extends 'stop'
      ? false
      : T extends 'pause'
        ? false
        : T extends 'resume'
          ? true
          : T extends 'drain'
            ? true
            : T extends 'flush'
              ? false
              : T extends 'commit'
                ? true
                : T extends 'rollback'
                  ? false
                  : T extends 'merge'
                    ? true
                    : T extends 'split'
                      ? true
                      : T extends 'publish'
                        ? true
                        : T extends 'suppress'
                          ? false
                          : T extends 'escalate'
                            ? true
                            : T extends 'recover'
                              ? true
                              : false;

export type BranchPayload<T extends BinaryToken> =
  BranchDecision<T> extends true
    ? { readonly active: true; readonly token: T }
    : { readonly active: false; readonly token: T };

export type ChainRecord<T extends readonly BinaryToken[]> = {
  readonly [K in keyof T]: {
    readonly token: T[K];
    readonly state: BranchByToken<T[K] & BinaryToken>;
    readonly resolved: BinarySignal<T[K] & BinaryToken>;
    readonly payload: BranchPayload<T[K] & BinaryToken>;
  };
};

export type ConvergedFlow<T extends readonly BinaryToken[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends BinaryToken
      ? Tail extends readonly BinaryToken[]
        ? BranchDecision<Head> extends true
          ? { readonly active: true; readonly next: ConvergedFlow<Tail> }
          : { readonly active: false; readonly next: ConvergedFlow<Tail> }
        : { readonly active: null }
      : { readonly active: null }
    : { readonly active: null };

export type NumericBranchGraph = {
  readonly checkpoints: NumericSequence<12>;
  readonly formulas: {
    readonly [N in 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10]: ArithmeticExpr<N>;
  };
};

export type StringTrail<T extends string> =
  T extends `${infer A}-${infer B}-${infer C}`
    ? { readonly first: A; readonly second: B; readonly third: C }
    : T extends `${infer A}-${infer B}`
      ? { readonly first: A; readonly second: B }
      : T extends `${infer A}`
        ? { readonly first: A }
        : never;

export type TokenUnion = `token-${BinaryToken}`;

export type TokenMap = {
  readonly [K in BinaryToken]: {
    readonly id: `id-${K}`;
    readonly enabled: BranchDecision<K>;
    readonly severity: ArithmeticExpr<1>;
    readonly scope: K;
  };
};

export type NestedDiscriminator<T extends string> =
  T extends `${infer Head}:${infer Rest}`
    ? Head extends 'token'
      ? Rest extends `${infer Token}-${infer Flags}`
        ? { readonly token: Token; readonly flags: Flags }
        : { readonly token: 'unknown'; readonly flags: Rest }
      : { readonly token: 'invalid'; readonly flags: never }
    : never;

export const tokenFlow = (tokens: readonly BinaryToken[]) => {
  const map = new Map<string, boolean>();
  for (const token of tokens) {
    const state = token.length % 2 === 0;
    map.set(token, state);
  }
  return map;
};

export const routeByToken = <T extends BinaryToken>(token: T): `/${T}` => `/${token}`;

export const evaluateToken = <T extends string>(token: T): boolean => token.length % 2 === 0;

export const describeChain = (token: BinaryToken, depth: number): string => {
  if (depth <= 0) {
    return `/${token}/done`;
  }
  const next = depth % 2 === 0 ? 'resume' : 'pause';
  return `${describeChain(next as BinaryToken, depth - 1)}->${token}`;
};

export const boolLattice = {
  start: true,
  stop: false,
  pause: false,
  resume: true,
  drain: true,
  flush: false,
  commit: true,
  rollback: false,
  merge: true,
  split: true,
  publish: true,
  suppress: false,
  escalate: true,
  recover: true,
  archive: false,
} as const satisfies { readonly [K in BinaryToken]: boolean };

const branchDecisionValue: Readonly<{ [K in BinaryToken]: boolean }> = {
  start: true,
  stop: false,
  pause: false,
  resume: true,
  drain: true,
  flush: false,
  commit: true,
  rollback: false,
  merge: true,
  split: true,
  publish: true,
  suppress: false,
  escalate: true,
  recover: true,
  archive: false,
};

export const binaryBranchTable = {
  start: {
    token: 'start',
    scope: 'initialize',
    envelope: { action: 'start' },
    index: 0,
    state: { token: 'start', phase: 'initialize', ready: true, open: true, scope: 'active' },
    signal: { key: 'start', phase: 'initialize' },
  },
  stop: {
    token: 'stop',
    scope: 'shutdown',
    envelope: { action: 'stop' },
    index: 1,
    state: { token: 'stop', phase: 'shutdown', ready: false, open: false, scope: 'inactive' },
    signal: { key: 'stop', phase: 'shutdown' },
  },
  pause: {
    token: 'pause',
    scope: 'waiting',
    envelope: { action: 'pause' },
    index: 2,
    state: { token: 'pause', phase: 'waiting', ready: false, open: true, scope: 'recovering' },
    signal: { key: 'pause', phase: 'waiting' },
  },
  resume: {
    token: 'resume',
    scope: 'active',
    envelope: { action: 'resume' },
    index: 3,
    state: { token: 'resume', phase: 'active', ready: true, open: true, scope: 'active' },
    signal: { key: 'resume', phase: 'active' },
  },
  drain: {
    token: 'drain',
    scope: 'active',
    envelope: { action: 'drain' },
    index: 4,
    state: { token: 'drain', phase: 'cleanup', ready: true, open: false, scope: 'draining' },
    signal: { key: 'drain', phase: 'cleanup' },
  },
  flush: {
    token: 'flush',
    scope: 'cleanup',
    envelope: { action: 'flush' },
    index: 5,
    state: { token: 'flush', phase: 'cleanup', ready: false, open: false, scope: 'inactive' },
    signal: { key: 'flush', phase: 'cleanup' },
  },
  commit: {
    token: 'commit',
    scope: 'finalize',
    envelope: { action: 'commit' },
    index: 6,
    state: { token: 'commit', phase: 'finalize', ready: true, open: true, scope: 'active' },
    signal: { key: 'commit', phase: 'finalize' },
  },
  rollback: {
    token: 'rollback',
    scope: 'recover',
    envelope: { action: 'rollback' },
    index: 7,
    state: { token: 'rollback', phase: 'restore', ready: false, open: true, scope: 'recovering' },
    signal: { key: 'rollback', phase: 'restore' },
  },
  merge: {
    token: 'merge',
    scope: 'compose',
    envelope: { action: 'merge' },
    index: 8,
    state: { token: 'merge', phase: 'compose', ready: true, open: true, scope: 'active' },
    signal: { key: 'merge', phase: 'compose' },
  },
  split: {
    token: 'split',
    scope: 'partition',
    envelope: { action: 'split' },
    index: 9,
    state: { token: 'split', phase: 'partition', ready: true, open: true, scope: 'active' },
    signal: { key: 'split', phase: 'partition' },
  },
  publish: {
    token: 'publish',
    scope: 'broadcast',
    envelope: { action: 'publish' },
    index: 10,
    state: { token: 'publish', phase: 'broadcast', ready: true, open: true, scope: 'active' },
    signal: { key: 'publish', phase: 'broadcast' },
  },
  suppress: {
    token: 'suppress',
    scope: 'throttle',
    envelope: { action: 'suppress' },
    index: 11,
    state: { token: 'suppress', phase: 'throttle', ready: false, open: true, scope: 'inactive' },
    signal: { key: 'suppress', phase: 'throttle' },
  },
  escalate: {
    token: 'escalate',
    scope: 'alert',
    envelope: { action: 'escalate' },
    index: 12,
    state: { token: 'escalate', phase: 'alert', ready: false, open: true, scope: 'recovering' },
    signal: { key: 'escalate', phase: 'alert' },
  },
  recover: {
    token: 'recover',
    scope: 'repair',
    envelope: { action: 'recover' },
    index: 13,
    state: { token: 'recover', phase: 'repair', ready: true, open: true, scope: 'draining' },
    signal: { key: 'recover', phase: 'repair' },
  },
  archive: {
    token: 'archive',
    scope: 'persist',
    envelope: { action: 'archive' },
    index: 14,
    state: { token: 'archive', phase: 'persist', ready: false, open: false, scope: 'inactive' },
    signal: { key: 'archive', phase: 'persist' },
  },
};

export type RouteTemplate = `/control/${BinaryToken}/${string}`;

export type TokenizedRoute<T extends string> =
  T extends `/control/${infer Token}/${infer Name}`
    ? Token extends BinaryToken
      ? { readonly token: Token; readonly name: Name }
      : never
    : never;

export const tokenizedRoutes: readonly RouteTemplate[] = [
  '/control/start/boot',
  '/control/stop/shutdown',
  '/control/pause/wait',
  '/control/resume/proceed',
  '/control/commit/finish',
  '/control/archive/final',
];

export const routeTokens = (input: readonly RouteTemplate[]) => {
  const parsed: Array<TokenizedRoute<RouteTemplate>> = [];
  for (const route of input) {
    const parts = route.split('/') as [string, 'control', BinaryToken, string];
    parsed.push({ token: parts[2], name: parts[3] } as TokenizedRoute<RouteTemplate>);
  }
  return parsed;
};

export const evaluateChain = (
  tokens: readonly BinaryToken[],
): { readonly active: boolean; readonly depth: number; readonly history: string[] } => {
  let value = true;
  const history: string[] = [];
  let depth = 0;

  for (const token of tokens) {
    const decision = branchDecisionValue[token];
    value = value && !!decision;
    history.push(`${token}:${decision ? 'on' : 'off'}`);
    depth = Math.min(24, depth + 1);
  }

  return {
    active: value,
    depth,
    history,
  };
};

export const booleanTemplateChain = routeTokens(tokenizedRoutes).map((entry) => `${entry.token}-${entry.name}`);

export const truthyChain = <T extends readonly BinaryToken[]>(tokens: [...T]): ConvergedFlow<T> => {
  const next = tokens.reduceRight((acc, token) => {
    const active = branchDecisionValue[token] === true;
    return { active, next: acc } as ConvergedFlow<T>;
  }, { active: null } as ConvergedFlow<T>);

  return next as ConvergedFlow<T>;
};

export const buildExpressionChain = (token: string, limit: number): string => {
  const bits: string[] = [];
  for (let depth = 0; depth < Math.min(12, limit); depth += 1) {
    const current = (depth % 2 === 0 ? 'start' : 'pause') as BinaryToken;
    bits.push(`${token}-${depth}-${Boolean(branchDecisionValue[current])}`);
  }
  return bits.join('>');
};
