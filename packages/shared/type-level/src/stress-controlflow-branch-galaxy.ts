export type BranchKind =
  | 'branch-01'
  | 'branch-02'
  | 'branch-03'
  | 'branch-04'
  | 'branch-05'
  | 'branch-06'
  | 'branch-07'
  | 'branch-08'
  | 'branch-09'
  | 'branch-10'
  | 'branch-11'
  | 'branch-12'
  | 'branch-13'
  | 'branch-14'
  | 'branch-15'
  | 'branch-16'
  | 'branch-17'
  | 'branch-18'
  | 'branch-19'
  | 'branch-20'
  | 'branch-21'
  | 'branch-22'
  | 'branch-23'
  | 'branch-24'
  | 'branch-25'
  | 'branch-26'
  | 'branch-27'
  | 'branch-28'
  | 'branch-29'
  | 'branch-30'
  | 'branch-31'
  | 'branch-32'
  | 'branch-33'
  | 'branch-34'
  | 'branch-35'
  | 'branch-36'
  | 'branch-37'
  | 'branch-38'
  | 'branch-39'
  | 'branch-40'
  | 'branch-41'
  | 'branch-42'
  | 'branch-43'
  | 'branch-44'
  | 'branch-45'
  | 'branch-46'
  | 'branch-47'
  | 'branch-48'
  | 'branch-49'
  | 'branch-50'
  | 'branch-51'
  | 'branch-52'
  | 'branch-53'
  | 'branch-54'
  | 'branch-55'
  | 'branch-56'
  | 'branch-57'
  | 'branch-58'
  | 'branch-59'
  | 'branch-60';

export interface BranchContext {
  readonly kind: BranchKind;
  readonly score: number;
  readonly payload: { readonly token: string; readonly attempts: number; readonly ok: boolean };
  readonly labels: readonly string[];
  readonly retryPolicy: 'none' | 'linear' | 'exponential';
}

export interface BranchDecisionBase {
  readonly kind: BranchKind;
  readonly score: number;
}

export interface BranchDecisionStep extends BranchDecisionBase {
  readonly action: 'continue';
  readonly next: BranchKind;
}

export interface BranchDecisionStop extends BranchDecisionBase {
  readonly action: 'stop';
  readonly reason: string;
}

export interface BranchDecisionRetry extends BranchDecisionBase {
  readonly action: 'retry';
  readonly waitMs: number;
  readonly remaining: number;
}

export interface BranchDecisionLoop extends BranchDecisionBase {
  readonly action: 'loop';
  readonly count: number;
}

export type BranchDecision = BranchDecisionStep | BranchDecisionStop | BranchDecisionRetry | BranchDecisionLoop;

export type BranchResult<T extends BranchKind> = T extends infer K & BranchKind
  ? K extends 'branch-59' | 'branch-60'
    ? BranchDecisionStop
    : K extends 'branch-31' | 'branch-32' | 'branch-33'
      ? BranchDecisionRetry
      : K extends 'branch-10' | 'branch-20' | 'branch-30' | 'branch-40' | 'branch-50'
        ? BranchDecisionLoop
        : BranchDecisionStep
  : never;

export const isRetry = (decision: BranchDecision): decision is BranchDecisionRetry => decision.action === 'retry';
export const isStop = (decision: BranchDecision): decision is BranchDecisionStop => decision.action === 'stop';
export const isLoop = (decision: BranchDecision): decision is BranchDecisionLoop => decision.action === 'loop';

export const evaluateBranch = (context: BranchContext): BranchResult<typeof context.kind> => {
  switch (context.kind) {
    case 'branch-01':
    case 'branch-02':
    case 'branch-03':
    case 'branch-04':
    case 'branch-05':
    case 'branch-06':
    case 'branch-07':
    case 'branch-08':
    case 'branch-09':
      return {
        kind: context.kind,
        score: context.score,
        action: 'continue',
        next: 'branch-02',
      };
    case 'branch-10':
      return {
        kind: context.kind,
        score: context.score,
        action: 'loop',
        count: context.payload.attempts + 1,
      };
    case 'branch-11':
    case 'branch-12':
    case 'branch-13':
      return {
        kind: context.kind,
        score: context.score,
        action: 'continue',
        next: 'branch-21',
      };
    case 'branch-14':
      return context.payload.ok
        ? {
            kind: context.kind,
            score: context.score,
            action: 'continue',
            next: 'branch-15',
          }
        : {
            kind: context.kind,
            score: context.score,
            action: 'retry',
            waitMs: 500,
            remaining: 3,
          };
    case 'branch-15':
    case 'branch-16':
    case 'branch-17':
      return {
        kind: context.kind,
        score: context.score,
        action: 'continue',
        next: 'branch-18',
      };
    case 'branch-18':
    case 'branch-19':
      return {
        kind: context.kind,
        score: context.score,
        action: 'continue',
        next: 'branch-20',
      };
    case 'branch-20':
      return {
        kind: context.kind,
        score: context.score,
        action: 'loop',
        count: 2,
      };
    case 'branch-21':
    case 'branch-22':
    case 'branch-23':
    case 'branch-24':
    case 'branch-25':
      return {
        kind: context.kind,
        score: context.score,
        action: 'continue',
        next: 'branch-26',
      };
    case 'branch-26':
    case 'branch-27':
    case 'branch-28':
    case 'branch-29':
      return {
        kind: context.kind,
        score: context.score,
        action: 'continue',
        next: 'branch-30',
      };
    case 'branch-30':
      return {
        kind: context.kind,
        score: context.score,
        action: 'loop',
        count: 4,
      };
    case 'branch-31':
    case 'branch-32':
    case 'branch-33':
      return {
        kind: context.kind,
        score: context.score,
        action: 'retry',
        waitMs: 1200,
        remaining: 5,
      };
    case 'branch-34':
    case 'branch-35':
      return {
        kind: context.kind,
        score: context.score,
        action: 'continue',
        next: 'branch-36',
      };
    case 'branch-36':
    case 'branch-37':
    case 'branch-38':
    case 'branch-39':
      return {
        kind: context.kind,
        score: context.score,
        action: 'continue',
        next: 'branch-40',
      };
    case 'branch-40':
      return {
        kind: context.kind,
        score: context.score,
        action: 'loop',
        count: 1,
      };
    case 'branch-41':
    case 'branch-42':
    case 'branch-43':
    case 'branch-44':
    case 'branch-45':
    case 'branch-46':
      return {
        kind: context.kind,
        score: context.score,
        action: 'continue',
        next: 'branch-47',
      };
    case 'branch-47':
    case 'branch-48':
      return {
        kind: context.kind,
        score: context.score,
        action: 'continue',
        next: 'branch-49',
      };
    case 'branch-49':
      return {
        kind: context.kind,
        score: context.score,
        action: 'retry',
        waitMs: 300,
        remaining: 1,
      };
    case 'branch-50':
      return {
        kind: context.kind,
        score: context.score,
        action: 'loop',
        count: 8,
      };
    case 'branch-51':
    case 'branch-52':
    case 'branch-53':
      return {
        kind: context.kind,
        score: context.score,
        action: 'continue',
        next: 'branch-54',
      };
    case 'branch-54':
    case 'branch-55':
    case 'branch-56':
      return {
        kind: context.kind,
        score: context.score,
        action: 'continue',
        next: 'branch-57',
      };
    case 'branch-57':
    case 'branch-58':
      return {
        kind: context.kind,
        score: context.score,
        action: 'continue',
        next: 'branch-59',
      };
    case 'branch-59':
      return {
        kind: context.kind,
        score: context.score,
        action: 'retry',
        waitMs: 600,
        remaining: 2,
      };
    case 'branch-60':
      return {
        kind: context.kind,
        score: context.score,
        action: 'stop',
        reason: 'control graph completed',
      };
    default:
      return {
        kind: context.kind,
        score: context.score,
        action: 'stop',
        reason: 'unmatched branch',
      };
  }
};

export const runBranchGraph = (seed: BranchContext[]): BranchDecision[] => {
  const log: BranchDecision[] = [];
  for (const item of seed) {
    let current = item;
    for (let step = 0; step < 5; step += 1) {
      const decision = evaluateBranch(current);
      log.push(decision);
      if (isStop(decision)) {
        break;
      }
      if (isRetry(decision)) {
        const remaining = decision.remaining - 1;
        current = {
          kind: current.kind,
          score: decision.score + remaining,
          payload: {
            token: current.payload.token,
            attempts: current.payload.attempts + 1,
            ok: remaining > 0,
          },
          labels: [...current.labels, `retry:${remaining}`],
          retryPolicy: current.retryPolicy,
        } satisfies BranchContext;
        if (remaining <= 0) {
          break;
        }
        continue;
      }
      if (isLoop(decision)) {
        const nextKind = current.kind === 'branch-10'
          ? 'branch-11'
          : current.kind === 'branch-20'
            ? 'branch-21'
            : current.kind === 'branch-30'
              ? 'branch-31'
              : 'branch-40';
        current = {
          kind: nextKind,
          score: decision.score + decision.count,
          payload: {
            token: current.payload.token,
            attempts: decision.count,
            ok: decision.count > 0,
          },
          labels: [...current.labels, `loop:${decision.count}`],
          retryPolicy: current.retryPolicy,
        };
        continue;
      }

      const next = (decision as BranchDecisionStep).next;
      current = {
        kind: next,
        score: decision.score + 1,
        payload: {
          token: current.payload.token,
          attempts: current.payload.attempts + 1,
          ok: current.payload.ok,
        },
        labels: [...current.labels, `next:${next}`],
        retryPolicy: current.retryPolicy,
      };
    }
  }
  return log;
};

export const branchScenarioSeed: BranchContext[] = [
  {
    kind: 'branch-01',
    score: 1,
    payload: { token: 'alpha', attempts: 0, ok: true },
    labels: ['seed'],
    retryPolicy: 'linear',
  },
  {
    kind: 'branch-10',
    score: 2,
    payload: { token: 'beta', attempts: 0, ok: false },
    labels: ['seed'],
    retryPolicy: 'exponential',
  },
  {
    kind: 'branch-31',
    score: 3,
    payload: { token: 'gamma', attempts: 0, ok: true },
    labels: ['seed'],
    retryPolicy: 'none',
  },
  {
    kind: 'branch-59',
    score: 10,
    payload: { token: 'omega', attempts: 2, ok: true },
    labels: ['seed'],
    retryPolicy: 'linear',
  },
];

export const branchLog = runBranchGraph(branchScenarioSeed);

export type BranchKindMap = {
  [K in BranchKind]: BranchResult<K>;
};
