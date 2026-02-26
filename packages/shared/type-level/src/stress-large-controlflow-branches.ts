export type BranchState =
  | 'init'
  | 'validate'
  | 'authorize'
  | 'collect'
  | 'simulate'
  | 'notify'
  | 'safeguard'
  | 'mitigate'
  | 'recover'
  | 'drain'
  | 'verify'
  | 'archive'
  | 'terminal'
  | 'halted';

export type BranchFlowState = 'pre' | 'mid' | 'post' | 'halted' | 'terminal';
export type BranchAction = `action-${BranchState}`;
export type BranchOutcome =
  | 'allow'
  | 'deny'
  | 'defer'
  | 'retry'
  | 'abort'
  | 'fallback'
  | 'escalate';

export type BranchSeed = {
  readonly id: `branch-${string}`;
  readonly tenant: string;
  readonly state: BranchState;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
};

export type BranchNode<TState extends BranchState = BranchState> = {
  readonly state: TState;
  readonly action: BranchAction;
  readonly route: `${TState}-${BranchOutcome}`;
  readonly stage: BranchFlowState;
  readonly next?: BranchState;
};

export type BranchBranch<T extends BranchState> = T extends 'init'
  ? BranchNode<'validate'>
  : T extends 'validate'
    ? BranchNode<'authorize'>
    : T extends 'authorize'
      ? BranchNode<'collect'>
      : T extends 'collect'
        ? BranchNode<'simulate'>
        : T extends 'simulate'
          ? BranchNode<'notify'>
          : T extends 'notify'
            ? BranchNode<'safeguard'>
            : T extends 'safeguard'
              ? BranchNode<'mitigate'>
              : T extends 'mitigate'
                ? BranchNode<'recover'>
                : T extends 'recover'
                  ? BranchNode<'drain'>
                  : T extends 'drain'
                    ? BranchNode<'verify'>
                    : T extends 'verify'
                      ? BranchNode<'archive'>
                      : T extends 'archive'
                        ? BranchNode<'terminal'>
                        : BranchNode<'halted'>;

export type BranchTree<T extends BranchState> = {
  [K in T]: BranchBranch<K>;
};

export type BranchCode<T extends BranchState> = T extends BranchState
  ? `${Uppercase<T & string>}_${number}`
  : never;

export type ControlOperand = string | number | boolean;
export type BranchEvent<T extends string = string> = T extends `evt.${infer Namespace}`
  ? { readonly namespace: Namespace; readonly payload: Record<string, ControlOperand> }
  : { readonly namespace: 'generic'; readonly payload: Record<string, ControlOperand> };

export type BranchDecision<T extends string> = T extends 'allow'
  ? true
  : T extends 'deny'
    ? false
    : T extends 'retry'
      ? 'retry'
      : T extends 'defer'
        ? 'defer'
        : T extends 'fallback'
          ? 'fallback'
          : T extends 'escalate'
            ? 'escalate'
            : T extends 'abort'
              ? 'abort'
              : never;

export type BranchLedger<T extends BranchState, I extends number = 12> = I extends 0
  ? {
      readonly head: BranchBranch<T>;
      readonly depth: 0;
      readonly branches: readonly BranchState[];
    }
  : {
      readonly head: BranchBranch<T>;
      readonly depth: I;
      readonly branches: readonly [BranchState, ...BranchState[]];
    };

export type BranchSolver<T extends BranchState> = T extends keyof BranchTree<T>
  ? BranchTree<T>[T]
  : never;

export type BranchPlan<T extends readonly BranchState[]> = {
  readonly steps: T;
  readonly cursor: T extends readonly [infer Head, ...infer _]
    ? Head & BranchState
    : BranchState;
  readonly completed: T['length'];
  readonly checksum: `${T['length']}-${Exclude<T[number], never>}`;
};

export const branchStates = [
  'init',
  'validate',
  'authorize',
  'collect',
  'simulate',
  'notify',
  'safeguard',
  'mitigate',
  'recover',
  'drain',
  'verify',
  'archive',
  'init',
  'validate',
  'authorize',
  'collect',
  'notify',
  'safeguard',
  'drain',
  'verify',
  'archive',
  'recover',
  'mitigate',
  'simulate',
  'authorize',
  'validate',
  'collect',
  'recover',
  'drain',
  'notify',
  'archive',
] as const;

export type BranchSequence = typeof branchStates;
export type BranchSequenceState = BranchSequence[number] & BranchState;

export const branchEvents = [
  'evt.init',
  'evt.validate',
  'evt.authorize',
  'evt.collect',
  'evt.simulate',
  'evt.notify',
  'evt.safeguard',
  'evt.mitigate',
  'evt.recover',
  'evt.drain',
  'evt.verify',
  'evt.archive',
  'evt.notify',
  'evt.retry',
  'evt.escalate',
  'evt.fallback',
  'evt.abort',
  'evt.defer',
  'evt.allow',
  'evt.deny',
  'evt.defer',
  'evt.legacy',
] as const;

export type BranchEventCatalog = typeof branchEvents;
export type BranchEventTuple<T extends BranchEventCatalog> = {
  [K in keyof T]: T[K] extends string ? BranchEvent<T[K]> : never;
};

type BranchDecisionMap = Readonly<Record<BranchAction, BranchOutcome>>;
const decisionMap: BranchDecisionMap = {
  'action-init': 'allow',
  'action-validate': 'allow',
  'action-authorize': 'defer',
  'action-collect': 'fallback',
  'action-simulate': 'retry',
  'action-notify': 'escalate',
  'action-safeguard': 'allow',
  'action-mitigate': 'allow',
  'action-recover': 'allow',
  'action-drain': 'allow',
  'action-verify': 'allow',
  'action-archive': 'allow',
  'action-terminal': 'allow',
  'action-halted': 'deny',
} as const;

export const resolveBranchAction = <T extends BranchState>(state: T): BranchAction => `action-${state}` as BranchAction;

export const routeBranches = <T extends BranchSequence>(input: T): BranchPlan<T> => {
  const steps = [...input] as BranchState[];
  const cursor = steps[0] as BranchState;
  return {
    steps: input,
    cursor,
    completed: steps.length,
    checksum: `${steps.length}-${String(cursor)}` as `${number}-${string}`,
  } as BranchPlan<T>;
};

export const runBranchFlow = (seed: BranchSeed, branches: BranchSequence): {
  readonly seed: BranchSeed;
  readonly traces: readonly BranchAction[];
  readonly report: {
    readonly state: BranchState;
    readonly active: boolean;
    readonly decision: BranchOutcome;
    readonly count: number;
  };
} => {
  const traces: BranchAction[] = [];

  for (let i = 0; i < branches.length; i += 1) {
    const branch = branches[i] as BranchState;
    const decision = resolveBranch(branch, seed, i);
    const action = resolveBranchAction(branch);
    traces.push(action);
    if (decision === 'abort' || decision === 'deny' || i > 50) {
      return {
        seed,
        traces: traces as readonly BranchAction[],
        report: {
          state: branch,
          active: false,
          decision,
          count: traces.length,
        },
      };
    }
  }

  const terminal = branches[branches.length - 1] as BranchState;
  return {
    seed,
    traces,
    report: {
      state: terminal,
      active: seed.severity !== 'critical',
      decision: 'allow',
      count: traces.length,
    },
  };
};

const resolveBranch = (branch: BranchState, seed: BranchSeed, index: number): BranchOutcome => {
  if (seed.severity === 'critical' && index < 2) {
    return 'escalate';
  }
  if (seed.state === 'init' && index === 0) {
    return 'allow';
  }
  if (index > 20 && branch === 'archive') {
    return 'fallback';
  }
  if (branch === 'validate' && seed.tenant.length > 8) {
    return 'retry';
  }
  if (branch === 'notify' && seed.severity === 'low') {
    return 'defer';
  }
  if (branch === 'drain' && seed.severity === 'high') {
    return 'allow';
  }
  if (branch === 'mitigate' && index % 3 === 0) {
    return index % 2 === 0 ? 'allow' : 'retry';
  }
  if (branch === 'simulate' && index > 8) {
    return index % 2 === 0 ? 'deny' : 'fallback';
  }
  if (branch === 'authorize' && index === 1) {
    return 'defer';
  }
  if (branch === 'collect' && index > 5) {
    return 'escalate';
  }
  if (branch === 'verify' && index > 10) {
    return index % 3 === 0 ? 'allow' : 'fallback';
  }

  if (index >= 40) {
    return 'fallback';
  }

  return decisionMap[`action-${branch}` as BranchAction] ?? 'allow';
};

export const branchTimeline = (count: number, step: BranchState): ReadonlyMap<number, BranchOutcome> => {
  const map = new Map<number, BranchOutcome>();
  const seed = {
    id: `branch-${step}`,
    tenant: `tenant-${step}`,
    state: step,
    severity: step === 'authorize' ? 'critical' : 'medium',
  } satisfies BranchSeed;

  for (let i = 0; i < count; i += 1) {
    map.set(i, resolveBranch(step, seed, i));
  }

  return map;
};
