export type BranchTag =
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
  | 'branch-45';

export type BranchEvent = {
  readonly tag: BranchTag;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly payload: number;
};

export type BranchTrace = {
  readonly trace: ReadonlyArray<string>;
  readonly lastSeen: number;
};

type BranchDecisionByTag<T extends BranchTag> =
  T extends 'branch-01' | 'branch-02' | 'branch-03' | 'branch-04' | 'branch-05'
    ? 'quiesce'
    : T extends 'branch-06' | 'branch-07' | 'branch-08' | 'branch-09' | 'branch-10'
      ? 'recover'
      : T extends 'branch-11' | 'branch-12' | 'branch-13' | 'branch-14' | 'branch-15'
        ? 'protect'
        : T extends 'branch-16' | 'branch-17' | 'branch-18' | 'branch-19' | 'branch-20'
          ? 'degrade'
          : T extends 'branch-21' | 'branch-22' | 'branch-23' | 'branch-24' | 'branch-25'
            ? 'escalate'
            : T extends 'branch-26' | 'branch-27' | 'branch-28' | 'branch-29' | 'branch-30'
              ? 'stabilize'
              : T extends 'branch-31' | 'branch-32' | 'branch-33' | 'branch-34' | 'branch-35'
                ? 'observe'
                : T extends 'branch-36' | 'branch-37' | 'branch-38' | 'branch-39' | 'branch-40'
                  ? 'rollback'
                  : T extends 'branch-41' | 'branch-42' | 'branch-43' | 'branch-44' | 'branch-45'
                    ? 'route'
                    : 'route';

export type BranchDecision<T extends BranchEvent> =
  T extends { tag: infer U }
    ? U extends BranchTag
      ? BranchDecisionByTag<U & BranchTag>
      : 'route'
    : 'route';

export const branchMatrix: ReadonlyArray<BranchEvent> = [
  { tag: 'branch-01', severity: 'low', payload: 1 },
  { tag: 'branch-02', severity: 'low', payload: 2 },
  { tag: 'branch-03', severity: 'medium', payload: 3 },
  { tag: 'branch-04', severity: 'medium', payload: 4 },
  { tag: 'branch-05', severity: 'high', payload: 5 },
  { tag: 'branch-06', severity: 'low', payload: 6 },
  { tag: 'branch-07', severity: 'low', payload: 7 },
  { tag: 'branch-08', severity: 'medium', payload: 8 },
  { tag: 'branch-09', severity: 'high', payload: 9 },
  { tag: 'branch-10', severity: 'critical', payload: 10 },
  { tag: 'branch-11', severity: 'low', payload: 11 },
  { tag: 'branch-12', severity: 'medium', payload: 12 },
  { tag: 'branch-13', severity: 'medium', payload: 13 },
  { tag: 'branch-14', severity: 'high', payload: 14 },
  { tag: 'branch-15', severity: 'critical', payload: 15 },
  { tag: 'branch-16', severity: 'low', payload: 16 },
  { tag: 'branch-17', severity: 'medium', payload: 17 },
  { tag: 'branch-18', severity: 'high', payload: 18 },
  { tag: 'branch-19', severity: 'critical', payload: 19 },
  { tag: 'branch-20', severity: 'low', payload: 20 },
  { tag: 'branch-21', severity: 'medium', payload: 21 },
  { tag: 'branch-22', severity: 'high', payload: 22 },
  { tag: 'branch-23', severity: 'critical', payload: 23 },
  { tag: 'branch-24', severity: 'low', payload: 24 },
  { tag: 'branch-25', severity: 'medium', payload: 25 },
  { tag: 'branch-26', severity: 'high', payload: 26 },
  { tag: 'branch-27', severity: 'critical', payload: 27 },
  { tag: 'branch-28', severity: 'low', payload: 28 },
  { tag: 'branch-29', severity: 'medium', payload: 29 },
  { tag: 'branch-30', severity: 'high', payload: 30 },
  { tag: 'branch-31', severity: 'critical', payload: 31 },
  { tag: 'branch-32', severity: 'low', payload: 32 },
  { tag: 'branch-33', severity: 'medium', payload: 33 },
  { tag: 'branch-34', severity: 'high', payload: 34 },
  { tag: 'branch-35', severity: 'critical', payload: 35 },
  { tag: 'branch-36', severity: 'low', payload: 36 },
  { tag: 'branch-37', severity: 'medium', payload: 37 },
  { tag: 'branch-38', severity: 'high', payload: 38 },
  { tag: 'branch-39', severity: 'critical', payload: 39 },
  { tag: 'branch-40', severity: 'low', payload: 40 },
  { tag: 'branch-41', severity: 'medium', payload: 41 },
  { tag: 'branch-42', severity: 'high', payload: 42 },
  { tag: 'branch-43', severity: 'critical', payload: 43 },
  { tag: 'branch-44', severity: 'low', payload: 44 },
  { tag: 'branch-45', severity: 'medium', payload: 45 },
] as const;

const normalizeSeverity = (severity: BranchEvent['severity']) =>
  severity === 'critical' ? 4 : severity === 'high' ? 3 : severity === 'medium' ? 2 : 1;

export const evaluateBranch = (event: BranchEvent, trace: BranchTrace): string => {
  const score = normalizeSeverity(event.severity) + event.payload;
  const path = `${event.tag}/${event.severity}/${score}`;

  switch (event.tag) {
    case 'branch-01':
    case 'branch-02':
    case 'branch-03':
    case 'branch-04':
    case 'branch-05':
      return `quarantine:${path}:${trace.trace.length}`;

    case 'branch-06':
    case 'branch-07':
    case 'branch-08':
    case 'branch-09':
    case 'branch-10':
      return `recover:${path}:${score > 12 ? 'wide' : 'narrow'}`;

    case 'branch-11':
    case 'branch-12':
    case 'branch-13':
    case 'branch-14':
    case 'branch-15':
      return `protect:${path}:${score > 10 ? 'hard' : 'soft'}`;

    case 'branch-16':
    case 'branch-17':
    case 'branch-18':
    case 'branch-19':
    case 'branch-20':
      return `degrade:${path}:${trace.lastSeen > 100 ? 'delayed' : 'immediate'}`;

    case 'branch-21':
    case 'branch-22':
    case 'branch-23':
    case 'branch-24':
    case 'branch-25':
      return `escalate:${path}:${event.payload % 2 === 0 ? 'paired' : 'single'}`;

    case 'branch-26':
    case 'branch-27':
    case 'branch-28':
    case 'branch-29':
    case 'branch-30':
      return `stabilize:${path}:${score > 20 ? 'global' : 'local'}`;

    case 'branch-31':
    case 'branch-32':
    case 'branch-33':
    case 'branch-34':
    case 'branch-35':
      return `observe:${path}:${event.payload % 3}`;

    case 'branch-36':
    case 'branch-37':
    case 'branch-38':
    case 'branch-39':
    case 'branch-40':
      return `rollback:${path}:${trace.lastSeen ? 'recorded' : 'cold'}`;

    case 'branch-41':
    case 'branch-42':
    case 'branch-43':
    case 'branch-44':
    case 'branch-45':
      return `route:${path}:${event.payload > 30 ? 'bypass' : 'reflow'}`;

    default:
      return `ignore:${path}`;
  }
};

export const executeControlFlow = (events: readonly BranchEvent[]): BranchTrace => {
  const trace: string[] = [];
  let lastSeen = 0;

  try {
    for (let i = 0; i < events.length; i += 1) {
      const event = events[i];
      let steps = event.payload;
      while (steps > 0) {
        if (event.payload > 40 && event.severity === 'critical') {
          trace.push(`critical-loop-${steps}`);
        } else if (event.severity === 'high' && i % 3 === 0) {
          trace.push(`high-branch-${event.tag}`);
        } else if (event.severity === 'medium' && i % 4 === 0) {
          trace.push(`mid-branch-${event.tag}`);
        }
        steps -= 1;
      }
      const selected = evaluateBranch(event, { trace, lastSeen });
      trace.push(selected);
      if (event.tag.startsWith('branch-4')) {
        lastSeen += event.payload;
      }
      if (event.severity === 'critical') {
        for (let j = 0; j < 3; j += 1) {
          trace.push(`post-${event.tag}-${j}`);
        }
      }
    }
  } catch (error) {
    trace.push(`failed:${String(error)}`);
  } finally {
    return { trace, lastSeen };
  }
};

export const compileFlowResult = () => {
  const trace = executeControlFlow(branchMatrix);
  const mapped = new Map(trace.trace.map((entry, index) => [String(index), entry]));
  return {
    total: trace.trace.length,
    lastSeen: trace.lastSeen,
    first: trace.trace[0],
    last: trace.trace[trace.trace.length - 1],
    map: mapped,
  } satisfies {
    total: number;
    lastSeen: number;
    first: string;
    last: string;
    map: ReadonlyMap<string, string>;
  };
};
