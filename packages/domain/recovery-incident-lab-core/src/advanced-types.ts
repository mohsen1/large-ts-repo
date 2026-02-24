import { type Brand } from '@shared/core';
import {
  createClock,
  type IncidentLabSignal,
  type IncidentLabScenario,
  type IncidentLabPlan,
  type IncidentLabRun,
  type IncidentLabEnvelope,
  type LabTemplateStep,
  type StepId,
  type LifecycleState,
  type SeverityBand,
} from './types';

export const phaseBuckets = ['normalize', 'dispatch', 'execute', 'telemetry', 'close'] as const;
export type PhaseBucket = (typeof phaseBuckets)[number];

export type SignalBucket<TSignal extends string = IncidentLabSignal['kind']> =
  | `${TSignal}:ingress`
  | `${TSignal}:egress`
  | `${TSignal}:history`;

export type BrandedLane<TName extends string> = Brand<TName, 'ScenarioSignalLane'>;
export type ScenarioSignalLane = BrandedLane<string>;

export const laneKinds = ['capacity', 'latency', 'integrity', 'dependency'] as const satisfies readonly IncidentLabSignal['kind'][];

export type RecursiveTuple<T extends readonly unknown[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? readonly [Head, ...RecursiveTuple<Tail>]
    : readonly [];

export type LastTupleItem<T extends readonly unknown[]> =
  T extends readonly [...unknown[], infer Tail] ? Tail : never;

export type QueueSignature<T extends readonly StepId[]> = T[number] extends infer Step
  ? Step extends StepId
    ? `queue:${string & Step}`
    : never
  : never;

export type PlanStepMap<TSteps extends readonly StepId[]> = {
  [Step in TSteps[number] as Step extends StepId ? `step:${string & Step}` : never]: {
    readonly key: Step;
    readonly label: `step:${string & Step}:lane`;
  };
};

export type PhaseAwarePlan<TSteps extends readonly StepId[]> = {
  readonly queue: QueueSignature<TSteps>;
  readonly lanes: PlanStepMap<TSteps>;
  readonly metadata: {
    readonly phase: PhaseBucket;
    readonly severity: SeverityBand;
  };
};

export type ScenarioTemplateSignal<TSignal extends readonly IncidentLabSignal['kind'][]> =
  TSignal extends readonly [infer Head, ...infer Tail extends readonly IncidentLabSignal['kind'][]]
    ? readonly [
        SignalBucket<Extract<Head, IncidentLabSignal['kind']>>,
        ...ScenarioTemplateSignal<Tail>,
      ]
    : readonly [];

export type ScenarioSignalIndex<TSignal extends readonly string[]> = {
  [TName in TSignal[number] as `signal:${TName & string}`]: readonly IncidentLabSignal[];
};

export type InferSignals<TBlueprint> =
  TBlueprint extends IncidentLabScenarioBlueprint<infer TSignals> ? TSignals : readonly IncidentLabSignal['kind'][];

export interface IncidentLabScenarioBlueprint<TSignals extends readonly IncidentLabSignal['kind'][] = readonly IncidentLabSignal['kind'][]> {
  readonly scenarioId: string;
  readonly owner: string;
  readonly labels: readonly string[];
  readonly topologicalSignature: Readonly<Record<string, readonly string[]>>;
  readonly signals: ScenarioTemplateSignal<TSignals>;
  readonly steps: readonly LabTemplateStep[];
  readonly selectedQueue: readonly StepId[];
}

export interface ScenarioBuildOptions<TSignals extends readonly IncidentLabSignal['kind'][]> {
  readonly scenarioId: string;
  readonly owner: string;
  readonly signals: NoInfer<TSignals>;
  readonly steps: readonly LabTemplateStep[];
  readonly labels?: readonly string[];
  readonly lane: keyof ScenarioSignalIndex<TSignals>;
}

export interface ScenarioEnvelopeContext {
  readonly scenario: IncidentLabScenario;
  readonly createdAt: string;
  readonly route: ScenarioSignalLane;
  readonly phase: PhaseBucket;
}

export type LaneDigest<TSignals extends readonly IncidentLabSignal['kind'][]> = {
  readonly lane: ScenarioSignalLane;
  readonly signals: ScenarioSignalIndex<TSignals>;
};

export type PlanMetric<TState extends LifecycleState = LifecycleState> = {
  readonly state: TState;
  readonly score: number;
  readonly queueLength: number;
  readonly severity: SeverityBand;
};

export const buildScenarioLane = (prefix: string): ScenarioSignalLane =>
  `${prefix}:lane`.toLowerCase() as ScenarioSignalLane;

export const buildRunEnvelope = <TSignals extends readonly IncidentLabSignal['kind'][]>(
  scenario: IncidentLabScenario,
  route: ScenarioSignalLane,
  payload: IncidentLabSignal,
  options: ScenarioBuildOptions<TSignals>,
): ScenarioEnvelopeContext => {
  const clock = createClock();
  return {
    scenario,
    createdAt: clock.now(),
    route,
    phase: 'telemetry',
  };
};

const signalDefaults = [
  { kind: 'capacity', node: 'planner', value: 1 },
  { kind: 'latency', node: 'planner', value: 2 },
  { kind: 'integrity', node: 'planner', value: 0.94 },
] as const satisfies readonly [{ readonly kind: IncidentLabSignal['kind']; readonly node: string; readonly value: number }, ...unknown[]];

export type SignalDefaults = typeof signalDefaults;
export type SignalDefaultsTuple<T extends SignalDefaults> = RecursiveTuple<T>;

export interface SignalBucketWindow {
  readonly kind: IncidentLabSignal['kind'];
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly total: number;
  readonly avg: number;
  readonly signature: string;
  readonly sampleWindow: readonly [IncidentLabSignal, ...IncidentLabSignal[]];
}

export interface SignalBucketEnvelope {
  readonly at: string;
  readonly bucketSize: number;
  readonly signature: string;
  readonly windows: readonly SignalBucketWindow[];
}

export const buildBlueprintFromSignals = <
  const TSignals extends readonly IncidentLabSignal['kind'][],
>(input: {
  readonly scenarioId: string;
  readonly owner: string;
  readonly signals: NoInfer<TSignals>;
  readonly steps: readonly LabTemplateStep[];
  readonly queue: readonly StepId[];
}): IncidentLabScenarioBlueprint<TSignals> => {
  const { scenarioId, owner, signals, steps, queue } = input;
  const blueprint = {
    scenarioId,
    owner,
    labels: ['recovery-lab', 'incident-lab', ...laneKinds],
    topologicalSignature: {
      planner: ['prepare', 'validate', 'dispatch'],
      execution: ['execute', 'verify'],
    },
    signals: signals.map(
      (value) => `${value}:history` as SignalBucket<typeof value>,
    ) as unknown as ScenarioTemplateSignal<TSignals>,
    steps,
    selectedQueue: queue,
  } satisfies IncidentLabScenarioBlueprint<TSignals>;

  return blueprint;
};

const emptyPlanMetric = (state: LifecycleState): PlanMetric => ({
  state,
  score: 0,
  queueLength: 0,
  severity: 'low',
});

export const summarizeBlueprint = <
  const TSignals extends readonly IncidentLabSignal['kind'][],
>(blueprint: IncidentLabScenarioBlueprint<TSignals>): {
  readonly id: string;
  readonly signalLanes: readonly string[];
  readonly phase: PhaseBucket;
  readonly metric: PlanMetric;
} => {
  const signalLanes = Object.keys(blueprint.topologicalSignature).sort();
  const phase: PhaseBucket = signalLanes.length > 2 ? 'dispatch' : 'normalize';
  return {
    id: blueprint.scenarioId,
    signalLanes: signalLanes.length === 0 ? ['empty'] : signalLanes,
    phase,
    metric: {
      ...emptyPlanMetric('draft'),
      queueLength: blueprint.selectedQueue.length,
      severity: phase === 'dispatch' ? 'medium' : 'low',
      score: signalLanes.length * blueprint.selectedQueue.length,
    },
  };
};

export const toPlanMetrics = (plan: IncidentLabPlan): ReadonlyArray<PlanMetric> =>
  plan.selected.map((entry, index) => ({
    state: plan.state,
    score: index + 1,
    queueLength: plan.queue.length,
    severity: (index % 2 === 0 ? 'critical' : 'medium') as SeverityBand,
  }));

export const flattenSignalTemplates = <
  const TSignals extends readonly IncidentLabSignal['kind'][],
>(signals: TSignals): SignalTemplateWindow<TSignals> =>
  signals
    .map((kind) => ({
      raw: kind,
      routed: `${kind}:history` as SignalBucket<typeof kind>,
    }))
    .slice(0, 16) as unknown as SignalTemplateWindow<TSignals>;

export type SignalTemplateWindow<TSignals extends readonly IncidentLabSignal['kind'][]> = {
  readonly entries: {
    readonly [TIndex in TSignals[number] as `${TIndex & string}::signature`]: {
      readonly raw: TIndex;
      readonly routed: SignalBucket<TIndex>;
    };
  }[];
};

export const makeLaneDigest = <TSignal extends readonly IncidentLabSignal['kind'][]>(
  scenario: IncidentLabScenario,
  payloads: ReadonlyArray<IncidentLabSignal>,
): IncidentLabEnvelope<LaneDigest<TSignal>> => ({
  id: `${scenario.id}:lane:${Date.now()}` as IncidentLabEnvelope['id'],
  labId: scenario.labId,
  scenarioId: scenario.id,
  payload: {
    lane: buildScenarioLane(scenario.id),
    signals: payloads.reduce<Record<string, IncidentLabSignal[]>>((acc, signal) => {
      const key = `signal:${signal.kind}`;
      acc[key] = [...(acc[key] ?? []), signal];
      return acc;
    }, {}) as unknown as LaneDigest<TSignal>["signals"],
  },
  createdAt: createClock().now(),
  origin: 'domain-telemetry',
});

export const inspectSignalSequence = (run: IncidentLabRun): readonly string[] => {
  const byKind = new Map<string, number>();
  for (const entry of run.results) {
    for (const effect of entry.sideEffects) {
      byKind.set(effect, (byKind.get(effect) ?? 0) + 1);
    }
  }

  return [...byKind.entries()].map(([kind, count]) => `${kind}:${count}`).toSorted();
};

const normalizeSignals = (signals: readonly IncidentLabSignal[]): readonly IncidentLabSignal[] =>
  [...signals].sort((left, right) => new Date(left.at).getTime() - new Date(right.at).getTime());

const bucketWindowSignature = (kind: IncidentLabSignal['kind'], count: number, index: number): string =>
  `${kind}:${count}:${index}` as const;

export const buildSignalBuckets = (
  input: ReadonlyArray<IncidentLabSignal>,
): Promise<SignalBucketEnvelope> => {
  const sortedSignals = normalizeSignals(input);
  const bucketSize = Math.max(1, Math.floor(sortedSignals.length / Math.max(1, Math.ceil(sortedSignals.length / 4))));
  const groups = new Map<IncidentLabSignal['kind'], IncidentLabSignal[]>();

  for (const signal of sortedSignals) {
    groups.set(signal.kind, [...(groups.get(signal.kind) ?? []), signal]);
  }

  const windows = [...groups.entries()].map<SignalBucketWindow>(([kind, items], index) => {
    const values = items.map((entry) => entry.value);
    const min = values.length === 0 ? 0 : Math.min(...values);
    const max = values.length === 0 ? 0 : Math.max(...values);
    const total = values.reduce((acc, current) => acc + current, 0);
    const avg = values.length === 0 ? 0 : total / values.length;
    const signature = bucketWindowSignature(kind, values.length, index);
    const sampleWindow = [items[0], ...items.slice(1)] as [IncidentLabSignal, ...IncidentLabSignal[]];
    return {
      kind,
      count: values.length,
      min,
      max,
      total,
      avg: Number(avg.toFixed(4)),
      signature,
      sampleWindow,
    };
  }).toSorted((left, right) => left.kind.localeCompare(right.kind));

  return Promise.resolve({
    at: createClock().now(),
    bucketSize,
    signature: `signals:${sortedSignals.length}:${windows.length}`,
    windows,
  });
};
