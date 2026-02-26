export type SagaStage =
  | 'init'
  | 'bootstrap'
  | 'ingest'
  | 'validate'
  | 'distribute'
  | 'aggregate'
  | 'synthesize'
  | 'forecast'
  | 'orchestrate'
  | 'resolve'
  | 'audit'
  | 'rollback'
  | 'archive'
  | 'evict'
  | 'complete';

export type SagaTag =
  | 'ops'
  | 'mesh'
  | 'signal'
  | 'policy'
  | 'workload'
  | 'continuity'
  | 'forecast'
  | 'recovery'
  | 'studio'
  | 'cockpit';

export type SagaEvent =
  | { readonly stage: 'init'; readonly tag: SagaTag; readonly value: number }
  | { readonly stage: 'bootstrap'; readonly tag: SagaTag; readonly node: string }
  | { readonly stage: 'ingest'; readonly tag: SagaTag; readonly payload: string[] }
  | { readonly stage: 'validate'; readonly tag: SagaTag; readonly ok: boolean }
  | { readonly stage: 'distribute'; readonly tag: SagaTag; readonly shards: number }
  | { readonly stage: 'aggregate'; readonly tag: SagaTag; readonly weight: number }
  | { readonly stage: 'synthesize'; readonly tag: SagaTag; readonly output: string }
  | { readonly stage: 'forecast'; readonly tag: SagaTag; readonly horizon: number }
  | { readonly stage: 'orchestrate'; readonly tag: SagaTag; readonly budget: number }
  | { readonly stage: 'resolve'; readonly tag: SagaTag; readonly resolved: boolean }
  | { readonly stage: 'audit'; readonly tag: SagaTag; readonly owner: string }
  | { readonly stage: 'rollback'; readonly tag: SagaTag; readonly step: string }
  | { readonly stage: 'archive'; readonly tag: SagaTag; readonly path: string }
  | { readonly stage: 'evict'; readonly tag: SagaTag; readonly retained: number }
  | { readonly stage: 'complete'; readonly tag: SagaTag; readonly success: boolean };

export type SagaCursor =
  | 'bootstrap'
  | 'ingest'
  | 'validate'
  | 'distribute'
  | 'aggregate'
  | 'synthesize'
  | 'forecast'
  | 'orchestrate'
  | 'resolve'
  | 'audit'
  | 'rollback'
  | 'archive'
  | 'evict'
  | 'complete'
  | 'complete-finish';

export type SagaResult<T extends SagaEvent> = T extends { readonly stage: 'init' }
  ? { readonly ok: true; readonly cursor: 'bootstrap'; readonly tag: T['tag'] }
  : T extends { readonly stage: 'bootstrap' }
    ? { readonly ok: true; readonly cursor: 'ingest'; readonly tag: T['tag'] }
    : T extends { readonly stage: 'ingest' }
      ? { readonly ok: true; readonly cursor: 'validate'; readonly tag: T['tag'] }
      : T extends { readonly stage: 'validate'; readonly ok: infer Ok }
        ? Ok extends true
          ? { readonly ok: true; readonly cursor: 'distribute'; readonly tag: T['tag'] }
          : { readonly ok: false; readonly cursor: 'archive'; readonly tag: T['tag'] }
        : T extends { readonly stage: 'distribute' }
          ? { readonly ok: true; readonly cursor: 'aggregate'; readonly tag: T['tag'] }
          : T extends { readonly stage: 'aggregate' }
            ? { readonly ok: true; readonly cursor: 'synthesize'; readonly tag: T['tag'] }
            : T extends { readonly stage: 'synthesize' }
              ? { readonly ok: true; readonly cursor: 'forecast'; readonly tag: T['tag'] }
              : T extends { readonly stage: 'forecast' }
                ? { readonly ok: true; readonly cursor: 'orchestrate'; readonly tag: T['tag'] }
                : T extends { readonly stage: 'orchestrate' }
                  ? { readonly ok: true; readonly cursor: 'resolve'; readonly tag: T['tag'] }
                  : T extends { readonly stage: 'resolve' }
                    ? { readonly ok: true; readonly cursor: 'audit'; readonly tag: T['tag'] }
                    : T extends { readonly stage: 'audit' }
                      ? { readonly ok: true; readonly cursor: 'rollback'; readonly tag: T['tag'] }
                      : T extends { readonly stage: 'rollback' }
                        ? { readonly ok: true; readonly cursor: 'archive'; readonly tag: T['tag'] }
                        : T extends { readonly stage: 'archive' }
                          ? { readonly ok: true; readonly cursor: 'evict'; readonly tag: T['tag'] }
                          : T extends { readonly stage: 'evict' }
                            ? { readonly ok: true; readonly cursor: 'complete'; readonly tag: T['tag'] }
                            : T extends { readonly stage: 'complete'; readonly success: true }
                              ? { readonly ok: true; readonly cursor: 'complete-finish'; readonly tag: T['tag'] }
                              : { readonly ok: false; readonly cursor: 'complete-finish'; readonly tag: T['tag'] };

export type SagaTrace<T extends SagaEvent> = SagaEvent & {
  readonly route: `${T['tag']}:${T['stage']}`;
  readonly transition: SagaResult<T>;
};

export type SagaChain<T extends readonly SagaEvent[]> = {
  readonly events: T;
  readonly normalized: { [K in keyof T]: T[K] extends SagaEvent ? SagaTrace<T[K]> : never };
  readonly last: T extends readonly [...unknown[], infer Last]
    ? Last extends SagaEvent
      ? SagaResult<Last>
      : never
    : never;
};

const phaseFor = (input: SagaEvent['stage']): SagaCursor => {
  switch (input) {
    case 'init':
      return 'bootstrap';
    case 'bootstrap':
      return 'ingest';
    case 'ingest':
      return 'validate';
    case 'validate':
      return 'distribute';
    case 'distribute':
      return 'aggregate';
    case 'aggregate':
      return 'synthesize';
    case 'synthesize':
      return 'forecast';
    case 'forecast':
      return 'orchestrate';
    case 'orchestrate':
      return 'resolve';
    case 'resolve':
      return 'audit';
    case 'audit':
      return 'rollback';
    case 'rollback':
      return 'archive';
    case 'archive':
      return 'evict';
    case 'evict':
      return 'complete';
    case 'complete':
    default:
      return 'complete-finish';
  }
};

const nextByTag = (tag: SagaTag): SagaEvent['stage'][] => {
  if (tag === 'policy') {
    return ['init', 'bootstrap', 'validate', 'rollback', 'archive', 'complete'];
  }
  if (tag === 'signal') {
    return ['ingest', 'validate', 'distribute', 'aggregate', 'complete'];
  }
  if (tag === 'workload') {
    return ['ingest', 'validate', 'aggregate', 'synthesize', 'complete'];
  }
  if (tag === 'continuity') {
    return ['init', 'bootstrap', 'forecast', 'synthesize', 'evict', 'complete'];
  }
  if (tag === 'forecast') {
    return ['validate', 'forecast', 'aggregate', 'resolve', 'archive', 'complete'];
  }
  if (tag === 'recovery') {
    return ['bootstrap', 'distribute', 'synthesize', 'orchestrate', 'audit', 'complete'];
  }
  if (tag === 'studio') {
    return ['init', 'ingest', 'resolve', 'rollback', 'complete'];
  }
  if (tag === 'cockpit') {
    return ['init', 'bootstrap', 'forecast', 'audit', 'complete'];
  }
  return ['init', 'bootstrap', 'ingest', 'validate', 'resolve', 'archive', 'complete'];
};

const buildEvent = <S extends SagaEvent['stage'], T extends SagaTag>(tag: T, stage: S): Extract<SagaEvent, { stage: S; tag: SagaTag }> =>
  ({
    tag,
    stage,
    ...(stage === 'init' ? { value: 1 } : {}),
    ...(stage === 'bootstrap' ? { node: `${tag}-${stage}` } : {}),
    ...(stage === 'ingest' ? { payload: [`${tag}-${stage}`] } : {}),
    ...(stage === 'validate' ? { ok: true } : {}),
    ...(stage === 'distribute' ? { shards: 3 } : {}),
    ...(stage === 'aggregate' ? { weight: 10 } : {}),
    ...(stage === 'synthesize' ? { output: `synth-${tag}` } : {}),
    ...(stage === 'forecast' ? { horizon: tag.length } : {}),
    ...(stage === 'orchestrate' ? { budget: 100 } : {}),
    ...(stage === 'resolve' ? { resolved: true } : {}),
    ...(stage === 'audit' ? { owner: `owner-${tag}` } : {}),
    ...(stage === 'rollback' ? { step: `rollback-${tag}` } : {}),
    ...(stage === 'archive' ? { path: `/var/${tag}` } : {}),
    ...(stage === 'evict' ? { retained: 12 } : {}),
    ...(stage === 'complete' ? { success: true } : {}),
  }) as Extract<SagaEvent, { stage: S; tag: SagaTag }>;

export const executeSaga = <const T extends readonly SagaEvent[]>(events: T): SagaChain<T> => {
  const toTransition = <U extends SagaEvent>(event: U): SagaResult<U> => ({
    ...(event as U),
    ok: (event.stage !== 'complete' || (event as Extract<SagaEvent, { stage: 'complete' }>).success) as true,
    cursor: phaseFor(event.stage),
    tag: event.tag,
  } as unknown as SagaResult<U>);

  const normalized = events.map((event) => {
    const route = `${event.tag}:${event.stage}` as const;
    const trace: SagaTrace<typeof event> = {
      ...(event as SagaEvent),
      route,
      transition: toTransition(event) as SagaResult<typeof event>,
    } as SagaTrace<typeof event>;
    return trace;
  }) as SagaChain<T>['normalized'];

  const last = events[events.length - 1] ? toTransition(events[events.length - 1]) : undefined;

  return {
    events,
    normalized,
    last:
      (last as SagaChain<T>['last']) ??
      ({ ok: false, cursor: 'bootstrap', tag: 'ops' } as SagaChain<T>['last']),
  };
};

export const switchSaga = (startingStage: SagaStage, tag: SagaTag): SagaResult<SagaEvent> => {
  let stage: SagaStage = startingStage;
  let counter = 0;
  while (counter < 120) {
    counter += 1;
    switch (stage) {
      case 'init':
        stage = 'bootstrap';
        break;
      case 'bootstrap':
        stage = 'ingest';
        break;
      case 'ingest':
        stage = 'validate';
        break;
      case 'validate':
        stage = 'distribute';
        break;
      case 'distribute':
        stage = 'aggregate';
        break;
      case 'aggregate':
        stage = 'synthesize';
        break;
      case 'synthesize':
        stage = 'forecast';
        break;
      case 'forecast':
        stage = 'orchestrate';
        break;
      case 'orchestrate':
        stage = 'resolve';
        break;
      case 'resolve':
        stage = 'audit';
        break;
      case 'audit':
        stage = 'rollback';
        break;
      case 'rollback':
        stage = 'archive';
        break;
      case 'archive':
        stage = 'evict';
        break;
      case 'evict':
        stage = 'complete';
        break;
      case 'complete':
      default:
        return {
          ok: false,
          cursor: 'complete-finish',
          tag,
        } as SagaResult<SagaEvent>;
    }
  }

  return {
    ok: false,
    cursor: 'complete-finish',
    tag,
  } as SagaResult<SagaEvent>;
};

export const routeByTag = (tag: SagaTag): readonly SagaEvent[] => {
  const stages = nextByTag(tag);
  return stages.map((stage) => buildEvent(tag, stage));
};

export const evaluateSaga = (tag: SagaTag): SagaChain<ReturnType<typeof routeByTag>> => {
  const events = routeByTag(tag);
  return executeSaga(events);
};

export const sagaToSwitch = (tag: SagaTag) => {
  const sequence = routeByTag(tag);
  return sequence.reduce<{ readonly count: number; readonly transitions: SagaCursor[] }>(
    (acc, event) => {
      const transition = phaseFor(event.stage);
      return {
        count: acc.count + 1,
        transitions: [...acc.transitions, transition],
      };
    },
    { count: 0, transitions: [] },
  );
};
