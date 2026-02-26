import type { Brand } from './patterns';

export type SagaVerb =
  | 'ack'
  | 'admit'
  | 'align'
  | 'analyze'
  | 'announce'
  | 'apply'
  | 'arrive'
  | 'audit'
  | 'authorize'
  | 'avoid'
  | 'balance'
  | 'benchmark'
  | 'bootstrap'
  | 'check'
  | 'clear'
  | 'close'
  | 'compose'
  | 'connect'
  | 'continue'
  | 'coordinate'
  | 'derive'
  | 'dispatch'
  | 'drain'
  | 'elapse'
  | 'emit'
  | 'enroll'
  | 'evaluate'
  | 'evict'
  | 'execute'
  | 'expand'
  | 'fallback'
  | 'fabricate'
  | 'feature'
  | 'forward'
  | 'forge'
  | 'forecast'
  | 'fork'
  | 'gather'
  | 'govern'
  | 'guard'
  | 'hydrate'
  | 'index'
  | 'inject'
  | 'inspect'
  | 'integrate'
  | 'isolate'
  | 'join'
  | 'launch'
  | 'lift'
  | 'load'
  | 'mutate'
  | 'optimize'
  | 'observe'
  | 'operate'
  | 'patch'
  | 'pause'
  | 'probe'
  | 'publish'
  | 'query'
  | 'rate'
  | 'recover'
  | 'release'
  | 'remediate'
  | 'render'
  | 'replicate'
  | 'resolve'
  | 'review'
  | 'route'
  | 'safeguard'
  | 'scale'
  | 'scatter'
  | 'synchronize'
  | 'terminate'
  | 'throttle'
  | 'validate'
  | 'verify';

export interface SagaEventBase {
  readonly eventId: Brand<string, 'saga-event-id'>;
  readonly runId: Brand<string, 'run-id'>;
  readonly value: number;
}

export type SagaEvent = SagaEventBase & {
  readonly verb: SagaVerb;
  readonly payload: string;
  readonly metadata: {
    readonly trace: readonly Brand<string, 'trace-id'>[];
    readonly flags: readonly string[];
  };
};

export type SagaDecision =
  | { readonly kind: 'skip'; readonly code: 0 }
  | { readonly kind: 'continue'; readonly code: 1 }
  | { readonly kind: 'hard-stop'; readonly code: 2 }
  | { readonly kind: 'retry'; readonly code: 3 }
  | { readonly kind: 'warn'; readonly code: 4 };

const routeByVerb = (verb: SagaVerb): SagaDecision => {
  switch (verb) {
    case 'ack':
    case 'enroll':
    case 'hydrate':
    case 'index':
    case 'join':
    case 'launch':
    case 'load':
      return { kind: 'continue', code: 1 };
    case 'admit':
    case 'align':
    case 'authorize':
    case 'audit':
      return { kind: 'continue', code: 1 };
    case 'analyze':
    case 'benchmark':
    case 'evaluate':
    case 'observe':
      return { kind: 'continue', code: 1 };
    case 'announce':
    case 'apply':
    case 'arrive':
    case 'bootstrap':
      return { kind: 'continue', code: 1 };
    case 'check':
    case 'clear':
    case 'close':
      return { kind: 'skip', code: 0 };
    case 'compose':
    case 'connect':
    case 'coordinate':
    case 'derive':
      return { kind: 'continue', code: 1 };
    case 'continue':
    case 'dispatch':
    case 'emit':
      return { kind: 'continue', code: 1 };
    case 'drain':
    case 'elapse':
    case 'evict':
      return { kind: 'warn', code: 4 };
    case 'enroll':
    case 'feature':
    case 'forward':
    case 'forge':
    case 'forecast':
      return { kind: 'continue', code: 1 };
    case 'fork':
    case 'gather':
    case 'govern':
    case 'guard':
      return { kind: 'continue', code: 1 };
    case 'inject':
    case 'inspect':
    case 'integrate':
    case 'isolate':
      return { kind: 'warn', code: 4 };
    case 'rate':
    case 'recover':
    case 'release':
    case 'remediate':
    case 'render':
      return { kind: 'continue', code: 1 };
    case 'replicate':
    case 'resolve':
    case 'review':
    case 'route':
      return { kind: 'continue', code: 1 };
    case 'safeguard':
    case 'scale':
    case 'scatter':
    case 'synchronize':
    case 'validate':
    case 'verify':
    case 'publish':
    case 'query':
    case 'optimize':
    case 'operate':
    case 'pause':
      return { kind: 'continue', code: 1 };
    case 'patch':
    case 'mutate':
      return { kind: 'retry', code: 3 };
    case 'throttle':
      return { kind: 'warn', code: 4 };
    case 'avoid':
      return { kind: 'skip', code: 0 };
    default:
      return { kind: 'hard-stop', code: 2 };
  }
};

const buildEvent = (
  verb: SagaVerb,
  runId: SagaEvent['runId'],
  index: number,
): SagaEvent => {
  const traces: Brand<string, 'trace-id'>[] = [];
  for (let idx = 0; idx <= index; idx += 1) {
    traces.push(`${runId}:${idx}` as Brand<string, 'trace-id'>);
  }

  const flags = [] as string[];
  if (verb.startsWith('a')) flags.push('alpha');
  if (verb.startsWith('r')) flags.push('runtime');
  if (verb.includes('e')) flags.push('elevation');

  return {
    eventId: `${verb}:${index}` as Brand<string, 'saga-event-id'>,
    runId,
    verb,
    payload: `payload-${verb}`,
    value: verb.length + index,
    metadata: {
      trace: traces,
      flags,
    },
  };
};

export type SagaOutcome =
  | { readonly state: 'stable'; readonly score: number }
  | { readonly state: 'warning'; readonly score: number }
  | { readonly state: 'retry'; readonly score: number }
  | { readonly state: 'failed'; readonly score: number };

export const evaluateSaga = (runId: SagaEvent['runId'], verbs: readonly SagaVerb[]): readonly SagaOutcome[] => {
  const outcomes: SagaOutcome[] = [];
  const events: SagaEvent[] = [];
  let score = 0;

  for (let index = 0; index < verbs.length; index += 1) {
    const verb = verbs[index];
    const event = buildEvent(verb, runId, index);
    events.push(event);

    const decision = routeByVerb(verb);
    switch (decision.kind) {
      case 'continue':
        score += event.value + decision.code;
        if (event.value > 5) {
          outcomes.push({ state: 'stable', score });
        }
        break;
      case 'warn':
        score += decision.code;
        outcomes.push({ state: 'warning', score });
        break;
      case 'retry':
        score -= decision.code;
        outcomes.push({ state: 'retry', score });
        break;
      case 'hard-stop':
        score = -1;
        outcomes.push({ state: 'failed', score });
        break;
      default:
        score += 0;
    }

    if (event.metadata.flags.includes('alpha')) {
      score += 3;
    }

    if (event.metadata.flags.includes('runtime')) {
      score += 5;
    }

    if (event.metadata.flags.includes('elevation')) {
      score += 7;
    }
  }

  return outcomes;
};

export const runSagaBranch = (): {
  readonly events: readonly SagaEvent[];
  readonly outcomes: readonly SagaOutcome[];
  readonly summary: {
    readonly runId: SagaEvent['runId'];
    readonly finalScore: number;
  };
} => {
  const runId = 'run:saga-lab' as SagaEvent['runId'];
  const verbs = [
    'ack',
    'admit',
    'align',
    'analyze',
    'announce',
    'apply',
    'arrive',
    'audit',
    'authorize',
    'avoid',
    'balance',
    'benchmark',
    'bootstrap',
    'check',
    'clear',
    'close',
    'compose',
    'connect',
    'continue',
    'coordinate',
    'derive',
    'dispatch',
    'drain',
    'elapse',
    'emit',
    'enroll',
    'evaluate',
    'evict',
    'execute',
    'expand',
    'fallback',
    'fabricate',
    'feature',
    'forward',
    'forge',
    'forecast',
    'fork',
    'gather',
    'govern',
    'guard',
    'hydrate',
    'index',
    'inject',
    'inspect',
    'integrate',
    'isolate',
    'join',
    'launch',
    'lift',
    'load',
    'mutate',
    'optimize',
    'observe',
    'operate',
    'patch',
    'pause',
    'probe',
    'publish',
    'query',
    'rate',
    'recover',
    'release',
    'remediate',
    'render',
    'replicate',
    'resolve',
    'review',
    'route',
    'safeguard',
    'scale',
    'scatter',
    'synchronize',
    'terminate',
    'throttle',
    'validate',
    'verify',
  ] as const satisfies readonly SagaVerb[];

  const outcomes = evaluateSaga(runId, verbs);

  const events = verbs.map((verb, index) => buildEvent(verb, runId, index));
  const finalScore = outcomes.length > 0 ? outcomes.at(-1)!.score : 0;
  return {
    events,
    outcomes,
    summary: { runId, finalScore },
  };
};
