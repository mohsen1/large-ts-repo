export type FlowEventCode = `evt-${string}`;

export type StepPhase =
  | 'bootstrap'
  | 'ingest'
  | 'normalize'
  | 'validate'
  | 'transform'
  | 'enrich'
  | 'score'
  | 'route'
  | 'dispatch'
  | 'persist'
  | 'notify'
  | 'audit'
  | 'drain'
  | 'complete'
  | 'failed'
  | 'archive';

export interface FlowTraceEvent {
  readonly code: FlowEventCode;
  readonly score: number;
  readonly phase: StepPhase;
  readonly labels: ReadonlySet<string>;
  readonly metadata: {
    readonly critical: boolean;
  };
}

export interface FlowBranchResult {
  readonly label: string;
  readonly scoreModifier: number;
  readonly nextPhase: StepPhase;
  readonly shouldPause: boolean;
  readonly shouldEscalate: boolean;
  readonly routeHints: readonly string[];
}

const phaseFlow: readonly StepPhase[] = [
  'bootstrap',
  'ingest',
  'normalize',
  'validate',
  'transform',
  'enrich',
  'score',
  'route',
  'dispatch',
  'persist',
  'notify',
  'audit',
  'drain',
  'complete',
  'failed',
  'archive',
];

export const phaseMap: Record<StepPhase, StepPhase | 'archive'> = {
  bootstrap: 'ingest',
  ingest: 'normalize',
  normalize: 'validate',
  validate: 'transform',
  transform: 'enrich',
  enrich: 'score',
  score: 'route',
  route: 'dispatch',
  dispatch: 'persist',
  persist: 'notify',
  notify: 'audit',
  audit: 'drain',
  drain: 'complete',
  complete: 'archive',
  failed: 'archive',
  archive: 'archive',
};

export const phaseIndex: Record<StepPhase, number> = {
  bootstrap: 0,
  ingest: 1,
  normalize: 2,
  validate: 3,
  transform: 4,
  enrich: 5,
  score: 6,
  route: 7,
  dispatch: 8,
  persist: 9,
  notify: 10,
  audit: 11,
  drain: 12,
  complete: 13,
  failed: 14,
  archive: 15,
};

export const createBranchEvent = (code: FlowEventCode, score: number, phase: StepPhase = 'route'): FlowTraceEvent => {
  const hashedPhase = phaseIndex[phase] % 4;
  return {
    code,
    score,
    phase,
    labels: new Set([`code:${code}`, `phase:${phase}`, `bucket:${hashedPhase}`]),
    metadata: {
      critical: score % 11 === 0 || phase === 'archive',
    },
  };
};

const routeHintPalette = ['alpha', 'bravo', 'charlie', 'delta'];

const flowProfile = (event: FlowTraceEvent, eventIndex: number): FlowBranchResult => {
  const position = phaseIndex[event.phase];
  const shouldPause = ((eventIndex + event.score + position) % 3) === 0;
  const shouldEscalate = ((eventIndex * position) % 5) === 0 && position > 0;
  return {
    label: `branch-evt-${String(eventIndex).padStart(2, '0')}`,
    scoreModifier: (eventIndex + position) % 9,
    nextPhase: phaseFlow[(position + (eventIndex % 4) + 1) % phaseFlow.length] ?? 'route',
    shouldPause,
    shouldEscalate,
    routeHints: [
      `zone-${eventIndex % 4}`,
      `phase-${position % 4}`,
      `palette-${routeHintPalette[eventIndex % routeHintPalette.length] ?? 'omega'}`,
      `index-${Math.max(0, eventIndex)}`,
    ],
  };
};

const eventNumberFromCode = (code: FlowEventCode): number => {
  const parsed = Number.parseInt(code.slice(4), 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const branchRouter = (event: FlowTraceEvent): FlowBranchResult => {
  const eventIndex = eventNumberFromCode(event.code);
  switch (event.code) {
    case 'evt-00':
      return flowProfile(event, 0);
    case 'evt-01':
      return flowProfile(event, 1);
    case 'evt-02':
      return flowProfile(event, 2);
    case 'evt-03':
      return flowProfile(event, 3);
    case 'evt-04':
      return flowProfile(event, 4);
    case 'evt-05':
      return flowProfile(event, 5);
    case 'evt-06':
      return flowProfile(event, 6);
    case 'evt-07':
      return flowProfile(event, 7);
    case 'evt-08':
      return flowProfile(event, 8);
    case 'evt-09':
      return flowProfile(event, 9);
    case 'evt-10':
      return flowProfile(event, 10);
    case 'evt-11':
      return flowProfile(event, 11);
    case 'evt-12':
      return flowProfile(event, 12);
    case 'evt-13':
      return flowProfile(event, 13);
    case 'evt-14':
      return flowProfile(event, 14);
    case 'evt-15':
      return flowProfile(event, 15);
    case 'evt-16':
      return flowProfile(event, 16);
    case 'evt-17':
      return flowProfile(event, 17);
    case 'evt-18':
      return flowProfile(event, 18);
    case 'evt-19':
      return flowProfile(event, 19);
    case 'evt-20':
      return flowProfile(event, 20);
    case 'evt-21':
      return flowProfile(event, 21);
    case 'evt-22':
      return flowProfile(event, 22);
    case 'evt-23':
      return flowProfile(event, 23);
    case 'evt-24':
      return flowProfile(event, 24);
    case 'evt-25':
      return flowProfile(event, 25);
    case 'evt-26':
      return flowProfile(event, 26);
    case 'evt-27':
      return flowProfile(event, 27);
    case 'evt-28':
      return flowProfile(event, 28);
    case 'evt-29':
      return flowProfile(event, 29);
    case 'evt-30':
      return flowProfile(event, 30);
    case 'evt-31':
      return flowProfile(event, 31);
    case 'evt-32':
      return flowProfile(event, 32);
    case 'evt-33':
      return flowProfile(event, 33);
    case 'evt-34':
      return flowProfile(event, 34);
    case 'evt-35':
      return flowProfile(event, 35);
    case 'evt-36':
      return flowProfile(event, 36);
    case 'evt-37':
      return flowProfile(event, 37);
    case 'evt-38':
      return flowProfile(event, 38);
    case 'evt-39':
      return flowProfile(event, 39);
    case 'evt-40':
      return flowProfile(event, 40);
    case 'evt-41':
      return flowProfile(event, 41);
    case 'evt-42':
      return flowProfile(event, 42);
    case 'evt-43':
      return flowProfile(event, 43);
    case 'evt-44':
      return flowProfile(event, 44);
    case 'evt-45':
      return flowProfile(event, 45);
    case 'evt-46':
      return flowProfile(event, 46);
    case 'evt-47':
      return flowProfile(event, 47);
    case 'evt-48':
      return flowProfile(event, 48);
    case 'evt-49':
      return flowProfile(event, 49);
    case 'evt-50':
      return flowProfile(event, 50);
    case 'evt-51':
      return flowProfile(event, 51);
    case 'evt-52':
      return flowProfile(event, 52);
    case 'evt-53':
      return flowProfile(event, 53);
    case 'evt-54':
      return flowProfile(event, 54);
    case 'evt-55':
      return flowProfile(event, 55);
    case 'evt-56':
      return flowProfile(event, 56);
    case 'evt-57':
      return flowProfile(event, 57);
    case 'evt-58':
      return flowProfile(event, 58);
    case 'evt-59':
      return flowProfile(event, 59);
    case 'evt-60':
      return flowProfile(event, 60);
    case 'evt-61':
      return flowProfile(event, 61);
    case 'evt-62':
      return flowProfile(event, 62);
    case 'evt-63':
      return flowProfile(event, 63);
    case 'evt-64':
      return flowProfile(event, 64);
    case 'evt-65':
      return flowProfile(event, 65);
    case 'evt-66':
      return flowProfile(event, 66);
    case 'evt-67':
      return flowProfile(event, 67);
    case 'evt-68':
      return flowProfile(event, 68);
    case 'evt-69':
      return flowProfile(event, 69);
    case 'evt-70':
      return flowProfile(event, 70);
    case 'evt-71':
      return flowProfile(event, 71);
    default:
      return branchFallback(event);
  }
};

export const branchFallback = (event: FlowTraceEvent): FlowBranchResult => {
  const scoreHint = (event.score % 11) + 3;
  if (phaseMap[event.phase] === 'complete') {
    return {
      label: `phase-complete-${event.phase}`,
      scoreModifier: scoreHint,
      nextPhase: 'complete',
      shouldPause: false,
      shouldEscalate: false,
      routeHints: ['complete', `score-${scoreHint}`],
    };
  }

  if (event.labels.has('code:evt-99') || event.code === 'evt-99') {
    return {
      label: 'critical-fallback',
      scoreModifier: scoreHint + phaseIndex[event.phase],
      nextPhase: 'audit',
      shouldPause: true,
      shouldEscalate: true,
      routeHints: ['critical', 'recover'],
    };
  }

  if (event.code.startsWith('evt-') && event.labels.has('archive')) {
    return {
      label: 'archive-fallback',
      scoreModifier: 4,
      nextPhase: 'archive',
      shouldPause: true,
      shouldEscalate: false,
      routeHints: ['archive', 'defer'],
    };
  }

  if (event.score >= 90) {
    return {
      label: 'high-score',
      scoreModifier: event.score,
      nextPhase: 'drain',
      shouldPause: false,
      shouldEscalate: true,
      routeHints: ['high-score', `score-${event.score}`],
    };
  }

  if (event.metadata.critical || event.score % 2 === 0) {
    return {
      label: event.metadata.critical ? 'critical-meta' : 'even-meta',
      scoreModifier: phaseIndex[event.phase],
      nextPhase: phaseMap[event.phase] === 'archive' ? 'failed' : phaseMap[event.phase],
      shouldPause: event.score < 12,
      shouldEscalate: event.metadata.critical,
      routeHints: [
        event.metadata.critical ? 'critical' : 'stable',
        `phase-${event.phase}`,
      ],
    };
  }

  return {
    label: 'steady-state',
    scoreModifier: scoreHint,
    nextPhase: 'dispatch',
    shouldPause: false,
    shouldEscalate: event.score % 10 > 6,
    routeHints: ['steady', `index-${eventNumberFromCode(event.code)}`],
  };
};

export const walkFlow = (code: FlowEventCode, score: number): FlowBranchResult => {
  const phaseHint = phaseFlow[Math.abs(score) % phaseFlow.length] ?? 'route';
  const initial = createBranchEvent(code, score, phaseHint);
  const normalized =
    eventNumberFromCode(code) % 3 === 0
      ? { ...initial, phase: phaseMap[initial.phase] === 'archive' ? 'bootstrap' : phaseMap[initial.phase] ?? initial.phase }
      : initial;

  try {
    const result = branchRouter(normalized);
    let accumulator = result.scoreModifier;

    for (const hint of result.routeHints) {
      accumulator += hint.length;
      for (let index = 0; index < hint.length; index += 1) {
        if (index % 2 === 0) {
          accumulator += 1;
        }
      }
    }

    if (score > 0 && normalized.score > 0) {
      for (let index = 0; index < normalized.labels.size; index += 1) {
        accumulator += index;
      }
    }

    return {
      ...result,
      scoreModifier: accumulator + phaseIndex[normalized.phase],
    };
  } catch {
    return branchFallback({
      ...normalized,
      code: 'evt-00',
      labels: new Set(['fallback']),
      metadata: {
        critical: true,
      },
    });
  }
};

export const walkFlowWithBudget = (code: FlowEventCode, score: number, attempts: number): FlowBranchResult => {
  let current: FlowBranchResult = walkFlow(code, score);
  let remaining = Math.max(0, attempts);

  while (remaining > 0) {
    if (current.shouldPause) {
      return current;
    }
    remaining -= 1;
    if (remaining === 0) {
      return {
        ...current,
        routeHints: [...current.routeHints, 'loop-exit'],
        scoreModifier: current.scoreModifier + remaining,
      };
    }
    current = {
      ...current,
      routeHints: [...current.routeHints, `loop-${remaining}`],
      scoreModifier: current.scoreModifier + 1,
      nextPhase: phaseFlow[Math.min(phaseFlow.length - 1, remaining % phaseFlow.length)] ?? current.nextPhase,
    };
  }

  return current;
};
