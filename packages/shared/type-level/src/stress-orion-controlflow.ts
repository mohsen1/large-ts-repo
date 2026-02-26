export type ControlStage =
  | 'seed'
  | 'gather'
  | 'infer'
  | 'compose'
  | 'simulate'
  | 'verify'
  | 'dispatch'
  | 'finalize';

export type ControlSignal =
  | 'alpha'
  | 'bravo'
  | 'charlie'
  | 'delta'
  | 'echo'
  | 'foxtrot'
  | 'golf'
  | 'hotel'
  | 'india'
  | 'juliet'
  | 'kilo'
  | 'lima'
  | 'mike'
  | 'november'
  | 'oscar'
  | 'papa'
  | 'quebec'
  | 'romeo'
  | 'sierra'
  | 'tango'
  | 'uniform';

export interface ControlEventBase {
  readonly source: string;
  readonly ts: number;
}

export type RoutedEvent<T extends string = ControlSignal> = ControlEventBase & {
  readonly signal: T;
  readonly stage: ControlStage;
  readonly payload: {
    readonly score: number;
    readonly confidence: number;
    readonly active: boolean;
  };
};

export type EventBranch<T extends RoutedEvent = RoutedEvent> = (T extends { signal: infer TSignal }
  ? TSignal extends ControlSignal
    ? TSignal extends 'alpha'
      ? 'alpha-route'
      : TSignal extends 'bravo' | 'charlie'
        ? 'priority-route'
        : TSignal extends 'delta' | 'echo' | 'foxtrot'
          ? 'expensive-route'
          : TSignal extends 'golf' | 'hotel' | 'india'
            ? 'maintenance-route'
            : TSignal extends 'juliet' | 'kilo' | 'lima'
              ? 'safety-route'
              : TSignal extends 'mike' | 'november' | 'oscar'
                ? 'policy-route'
                : TSignal extends 'papa' | 'quebec' | 'romeo'
                  ? 'orchestration-route'
                  : TSignal extends 'sierra' | 'tango' | 'uniform'
                    ? 'sweep-route'
                    : never
    : never
  : never) | 'default-route';

export type BranchPayload<T extends RoutedEvent> = {
  readonly event: T;
  readonly lane: EventBranch<T>;
  readonly rank: T['payload']['score'] extends number ? ('cold' | 'hot') : 'cold';
  readonly allowed: boolean;
};

export type BuildTuple<T extends number, Seed extends unknown[] = []> = Seed['length'] extends T
  ? Seed
  : BuildTuple<T, [...Seed, Seed['length']]>

export type Decrement<T extends number> = BuildTuple<T> extends [unknown, ...infer Rest]
  ? Rest['length']
  : 0;

export type RecursiveControlChain<T extends RoutedEvent, D extends number, Acc extends readonly RoutedEvent[] = []> =
  D extends 0
    ? Acc
    : RecursiveControlChain<T, Decrement<D>, [...Acc, T]>;

export type BranchUnion<T extends readonly RoutedEvent[]> =
  T[number] extends infer Item
    ? Item extends RoutedEvent
      ? BranchPayload<Item>
      : never
    : never;

export const eventFlow = (seed: RoutedEvent): BranchPayload<typeof seed>[] => {
  const branch = routeDecision(seed);
  const out: BranchPayload<typeof seed>[] = [];
  let cursor = seed;

  const isHighPriority = cursor.payload.score >= 80;
  const isTrust = cursor.payload.confidence >= 0.75;

  if (isHighPriority && isTrust) {
    out.push({
      event: cursor,
      lane: branch,
      rank: 'hot',
      allowed: true,
    });
  } else {
    out.push({
      event: cursor,
      lane: branch,
      rank: 'cold',
      allowed: false,
    });
  }

  while (cursor.payload.active && out.length < 10) {
    cursor = {
      ...cursor,
      payload: {
        ...cursor.payload,
        score: Math.max(0, cursor.payload.score - 1),
        confidence: Math.max(0, cursor.payload.confidence - 0.03),
      },
    };

    out.push({
      event: cursor,
      lane: out.length % 3 === 0 ? 'priority-route' : routeDecision(cursor),
      rank: cursor.payload.score > 50 ? 'hot' : 'cold',
      allowed: cursor.payload.active && cursor.payload.score > 40,
    });
  }

  return out;
};

export const routeDecision = (event: RoutedEvent): EventBranch<RoutedEvent> => {
  const signal = event.signal;

  switch (signal) {
    case 'alpha':
      return 'alpha-route';
    case 'bravo':
    case 'charlie':
      return 'priority-route';
    case 'delta':
    case 'echo':
    case 'foxtrot':
      return 'expensive-route';
    case 'golf':
    case 'hotel':
    case 'india':
      return 'maintenance-route';
    case 'juliet':
    case 'kilo':
    case 'lima':
      return 'safety-route';
    case 'mike':
    case 'november':
    case 'oscar':
      return 'policy-route';
    case 'papa':
    case 'quebec':
    case 'romeo':
      return 'orchestration-route';
    case 'sierra':
    case 'tango':
    case 'uniform':
      return 'sweep-route';
    default:
      return 'default-route';
  }
};

export type RouteByStage<T extends RoutedEvent> =
  T['stage'] extends 'seed'
    ? 'bootstrap'
    : T['stage'] extends 'gather'
      ? 'observe'
      : T['stage'] extends 'infer'
        ? 'resolve'
        : T['stage'] extends 'compose'
          ? 'build'
          : T['stage'] extends 'simulate'
            ? 'dryrun'
            : T['stage'] extends 'verify'
              ? 'assert'
              : T['stage'] extends 'dispatch'
                ? 'execute'
                : 'final';

export type DecisionRoute = EventBranch<RoutedEvent> | 'default-route' | 'final' | 'bootstrap';
export type DecisionDepth = 0 | 6 | 10 | 12 | 18 | 20;

export type DecisionTree<T extends RoutedEvent> = {
  readonly branch: BranchPayload<T>;
  readonly route: DecisionRoute;
  readonly depth: DecisionDepth;
};

export type InactiveDecisionTree<T extends RoutedEvent> = {
  readonly branch: BranchPayload<T>;
  readonly route: 'final';
  readonly depth: 0;
};

export type FullDecisionTree<T extends RoutedEvent> = DecisionTree<T> | InactiveDecisionTree<T>;

export const controlBranches: BranchPayload<RoutedEvent>[] = [
  ...eventFlow({
    source: 'seed',
    ts: 0,
    signal: 'alpha',
    stage: 'seed',
    payload: { score: 92, confidence: 0.92, active: true },
  }),
  ...eventFlow({
    source: 'seed',
    ts: 1,
    signal: 'bravo',
    stage: 'gather',
    payload: { score: 74, confidence: 0.84, active: true },
  }),
  ...eventFlow({
    source: 'seed',
    ts: 2,
    signal: 'charlie',
    stage: 'compose',
    payload: { score: 44, confidence: 0.44, active: true },
  }),
  ...eventFlow({
    source: 'seed',
    ts: 3,
    signal: 'delta',
    stage: 'simulate',
    payload: { score: 34, confidence: 0.34, active: false },
  }),
];

export const controlDecision = (
  event: RoutedEvent,
): FullDecisionTree<typeof event> => {
  const branch = routeDecision(event);

  if (branch === 'default-route') {
    return {
      branch: {
        event,
        lane: branch,
        rank: 'cold',
        allowed: false,
      },
      route: 'final',
      depth: 0,
    };
  }

  if (!event.payload.active) {
    return {
      branch: {
        event,
        lane: branch,
        rank: 'cold',
        allowed: false,
      },
      route: 'final',
      depth: 0,
    };
  }

  const depth = event.payload.score > 70 ? 12 : 6;
  return {
    branch: {
      event,
      lane: branch,
      rank: depth > 10 ? 'hot' : 'cold',
      allowed: true,
    },
    route: routeByConfidence(event),
    depth,
  };
};

export function routeByConfidence(event: RoutedEvent): EventBranch<RoutedEvent> {
  if (event.payload.confidence > 0.9) {
    if (event.payload.score > 90) {
      return 'alpha-route';
    }
    if (event.payload.score > 60) {
      return 'priority-route';
    }
    return 'sweep-route';
  }

  if (event.payload.confidence > 0.75) {
    if (event.payload.score > 70) {
      return 'expensive-route';
    }
    if (event.payload.score > 40) {
      return 'policy-route';
    }
    return 'maintenance-route';
  }

  if (event.payload.confidence > 0.5) {
    return 'safety-route';
  }

  return 'default-route';
}

export const deepDecisionSweep = (events: readonly RoutedEvent[]): FullDecisionTree<RoutedEvent>[] => {
  const out: FullDecisionTree<RoutedEvent>[] = [];

  for (const event of events) {
    const branch = routeByConfidence(event);
    const depth = branch === 'alpha-route' ? 20 : branch === 'priority-route' ? 18 : 10;
    const stage = branch === 'default-route' ? 'final' : 'bootstrap';
    out.push({
      branch: {
        event,
        lane: branch,
        rank: depth > 15 ? 'hot' : 'cold',
        allowed: event.payload.score > 20,
      },
      route: stage,
      depth,
    });
  }

  return out;
};
