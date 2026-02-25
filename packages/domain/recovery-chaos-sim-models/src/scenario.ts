import { type Brand } from '@shared/type-level';
import type {
  ChaosRunToken,
  ChaosScenarioId,
  ChaosSimulationId,
  ChaosSimNamespace,
  NamespacePath,
  RecursiveTuple,
  SignalEnvelope,
  UnixEpochMs
} from './identity';

export type TimelinePhase = 'ingest' | 'safety' | 'run' | 'recover' | 'postmortem';
export type TimelineWindow = `${number}${'s' | 'm' | 'h'}`;

export type TimelineToken<T extends TimelinePhase = TimelinePhase> = `${T}:${TimelineWindow}`;
export type ScenarioTemplateId<T extends string = string> = `template:${T}`;

export interface StageModel<Name extends string = string, Input = unknown, Output = unknown> {
  readonly name: Name;
  readonly input: Input;
  readonly output: Output;
  readonly weight?: number;
  readonly dependencies?: readonly Name[];
  readonly timeoutMs?: number;
}

export type StageInput<T extends StageModel> = T['input'];
export type StageOutput<T extends StageModel> = T['output'];

export type StageByName<
  TStages extends readonly StageModel<string, unknown, unknown>[],
  TName extends TStages[number]['name']
> = Extract<TStages[number], { name: TName }>;

export type StageNameTuple<T extends readonly StageModel<string, unknown, unknown>[]> = T extends readonly [
  infer Head extends StageModel<string, unknown, unknown>,
  ...infer Tail extends readonly StageModel<string, unknown, unknown>[]
]
  ? readonly [Head['name'], ...StageNameTuple<Tail>]
  : readonly [];

export type StagePayloadTuple<
  TStages extends readonly StageModel<string, unknown, unknown>[]
> = TStages extends readonly [
  infer Head extends StageModel<string, unknown, unknown>,
  ...infer Tail extends readonly StageModel<string, unknown, unknown>[]
]
  ? readonly [Head['input'], ...StagePayloadTuple<Tail>]
  : readonly [];

export type StageOrder<T extends readonly StageModel<string, unknown, unknown>[]> = {
  [Index in keyof T]: T[Index] extends StageModel<infer Name, any, any> ? Name : never;
};

export type StageWeightMap<T extends readonly StageModel<string, unknown, unknown>[]> = {
  [K in T[number]['name'] as `${K & string}:weight`]:
    Extract<T[number], { name: K }>['weight'] extends number ? Extract<T[number], { name: K }>['weight'] : never;
};

export type ScenarioEnvelope<T extends readonly StageModel<string, unknown, unknown>[]> = {
  readonly namespace: ChaosSimNamespace;
  readonly simulationId: ChaosSimulationId;
  readonly scenarioId: ChaosScenarioId;
  readonly stages: T;
  readonly timeline: readonly TimelineToken[];
  readonly profile: Readonly<Record<T[number]['name'], number>>;
  readonly createdAt: UnixEpochMs;
  readonly metadata?: Readonly<Record<string, unknown>>;
};

export type ScenarioEnvelopeByWindow<T extends readonly StageModel<string, unknown, unknown>[]> = {
  [K in TimelinePhase]: ScenarioEnvelope<T> & {
    readonly phase: K;
    readonly window: TimelineWindow;
  };
};

export type PlanSignature<T extends readonly StageModel<string, unknown, unknown>[]> =
  `plan:${T[number]['name']}` & Brand<string, 'PlanSignature'>;

export interface TimelineSlice<T extends readonly StageModel<string, unknown, unknown>[], TName extends string> {
  readonly token: TimelineToken<TName & TimelinePhase>;
  readonly weight: T extends readonly [infer Head extends StageModel<string, unknown, unknown>, ...any[]]
    ? Head['weight']
    : never;
  readonly stages: StagePayloadTuple<T>[number][];
}

export type StageTransition<T extends readonly StageModel<string, unknown, unknown>[]> = {
  [K in T[number]['name']]: {
    readonly stage: K;
    readonly input: Extract<T[number], { name: K }>['input'];
    readonly output: Extract<T[number], { name: K }>['output'];
  };
};

const phaseWeights: Record<TimelinePhase, number> = {
  ingest: 1,
  safety: 2,
  run: 3,
  recover: 4,
  postmortem: 5
};

export const defaultPhases = Object.keys(phaseWeights) as readonly TimelinePhase[];

export function buildTimeline<T extends readonly StageModel<string, unknown, unknown>[]>(
  phases: readonly TimelinePhase[] = defaultPhases
): readonly TimelineToken[] {
  return phases.map((phase) => `${phase}:5m` as TimelineToken);
}

export function buildProfile<T extends readonly StageModel<string, unknown, unknown>[]>(
  stages: T,
  namespace: ChaosSimNamespace,
  simulationId: ChaosSimulationId,
  scenarioId: ChaosScenarioId,
  runToken: ChaosRunToken
): ScenarioEnvelope<T> {
  const timeline = buildTimeline<T>(defaultPhases);
  const profile = {} as Record<T[number]['name'], number>;
  for (const stage of stages) {
    profile[stage.name as T[number]['name']] = stage.weight ?? 1;
  }

  return {
    namespace,
    simulationId,
    scenarioId,
    stages,
    timeline,
    profile,
    createdAt: Date.now() as UnixEpochMs
  } as ScenarioEnvelope<T>;
}

export function snapshotSignature<T extends readonly StageModel<string, unknown, unknown>[]>(
  envelope: ScenarioEnvelope<T>
): PlanSignature<T> {
  const names = [...envelope.stages]
    .map((stage) => stage.name)
    .join('-') as string;

  return `plan:${names}` as PlanSignature<T>;
}

export function normalizeWindow<T extends RecursiveTuple<[number, number, number]>>(window: T): number {
  return Number(`${window[0]}${window[1]}${window[2]}`);
}

export function projectSignalValues<T extends readonly StageModel<string, unknown, unknown>[]>(
  envelopes: ReadonlyArray<SignalEnvelope<T>>
): ReadonlyArray<number> {
  return envelopes.flatMap((item, index) => {
    const factor = Number.isFinite(item.priority) ? item.priority : 0;
    return factor === 0 ? [] : [factor + index];
  });
}
