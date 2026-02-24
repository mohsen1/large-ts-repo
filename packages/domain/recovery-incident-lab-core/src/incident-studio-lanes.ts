import { Brand, withBrand } from '@shared/core';
import { NoInfer, Prettify } from '@shared/type-level';
import type { StepId, IncidentLabPlan, LabTemplateStep, IncidentLabSignal } from './types';
import type { StudioLaneKind } from './incident-studio-types';

export const lanePriorities = ['critical', 'high', 'normal', 'low'] as const;
export type LanePriority = (typeof lanePriorities)[number];

export type LaneTemplate<T extends readonly StudioLaneKind[]> = {
  [K in keyof T as T[K] extends StudioLaneKind ? `lane:${T[K] & string}` : never]: readonly StepId[];
};

export interface StepLane {
  readonly stepId: StepId;
  readonly lane: Brand<string, 'StudioStepLane'>;
  readonly priority: LanePriority;
  readonly reason: string;
}

export interface LanePlan {
  readonly laneId: Brand<string, 'StudioLaneId'>;
  readonly capacity: number;
  readonly pressure: number;
  readonly steps: readonly StepLane[];
  readonly window: readonly StepId[];
}

export interface LaneState {
  readonly updatedAt: string;
  readonly lanes: Prettify<Record<string, LanePlan>>;
  readonly overload: number;
  readonly reason: readonly string[];
}

export interface LaneManifest {
  readonly signature: Brand<string, 'StudioLaneManifestSignature'>;
  readonly snapshot: LaneState;
  readonly lanes: readonly string[];
}

const laneOrder: readonly StudioLaneKind[] = ['control', 'compute', 'storage', 'network', 'safety', 'policy'];

const normalizeLane = (lane: StudioLaneKind): StudioLaneKind => lane;

const toLaneId = (index: number, lane: StudioLaneKind): Brand<string, 'StudioLaneId'> =>
  withBrand(`lane-${index}:${lane}`, 'StudioLaneId');

const toPriority = (load: number, laneIndex: number): LanePriority => {
  if (load > 0.8) return 'critical';
  if (load > 0.6) return 'high';
  if (load > 0.4) return 'normal';
  return laneIndex % 3 === 0 ? 'normal' : 'low';
};

const deriveLoad = (count: number, laneIndex: number): number =>
  Number(((count + laneIndex * 0.25) / 24).toFixed(3));

const normalizeBucket = <T>(values: readonly T[]): readonly T[] => [...values];

export const buildPlanLanes = <const TSteps extends readonly StepId[]>(args: {
  readonly steps: NoInfer<TSteps>;
  readonly base: readonly LabTemplateStep[];
  readonly lanes?: readonly StudioLaneKind[];
}): LaneTemplate<readonly ['control', 'compute', 'storage', 'network', 'safety', 'policy']> => {
  const laneSet = (args.lanes?.length ? args.lanes : laneOrder).map(normalizeLane);
  const baseSteps = normalizeBucket(args.base.map((entry) => entry.id));
  const windows = baseSteps.length > 0 ? baseSteps : args.steps;

  const buckets = new Map<string, StepId[]>();
  for (const [index, stepId] of windows.entries()) {
    const lane = laneSet[index % laneSet.length] as StudioLaneKind;
    const key = `lane:${lane}` as `lane:${StudioLaneKind}`;
    buckets.set(key, [...(buckets.get(key) ?? []), stepId]);
  }

  const template = {
    'lane:control': [],
    'lane:compute': [],
    'lane:storage': [],
    'lane:network': [],
    'lane:safety': [],
    'lane:policy': [],
  } satisfies Record<`lane:${StudioLaneKind}`, StepId[]> as Record<`lane:${StudioLaneKind}`, StepId[]>;

  for (const lane of laneSet) {
    const key = `lane:${lane}` as `lane:${StudioLaneKind}`;
    template[key] = (buckets.get(key) ?? []) as StepId[];
  }

  return template;
};

const toStepLane = (stepId: StepId, lane: StudioLaneKind, load: number, index: number): StepLane => ({
  stepId,
  lane: withBrand(`${lane}:${stepId}`, 'StudioStepLane'),
  priority: toPriority(load, index),
  reason: `lane=${lane},index=${index},load=${load.toFixed(2)}`,
});

export const buildLaneManifest = (input: {
  readonly plan: IncidentLabPlan;
  readonly signals: readonly IncidentLabSignal[];
  readonly lanes?: readonly StudioLaneKind[];
}): LaneState => {
  const lanes = buildPlanLanes({
    steps: input.plan.queue,
    base: input.plan.queue.map((step) => ({
      id: step,
      label: `plan:${String(step)}`,
      command: String(step),
      expectedDurationMinutes: 1,
      dependencies: [],
      constraints: [],
      owner: withBrand('incident-lab-core', 'ActorId'),
    } satisfies LabTemplateStep)),
    lanes: input.lanes,
  });

  const manifestLanes = (input.lanes?.length ? input.lanes : laneOrder).map(normalizeLane);
  const laneRecords: Record<string, LanePlan> = {};
  let overload = 0;
  const reason: string[] = [`signals=${input.signals.length}`];

  for (const [index, lane] of manifestLanes.entries()) {
    const laneKey = `lane:${lane}`;
    const stepIds = lanes[laneKey as keyof typeof lanes] ?? [];
    const load = deriveLoad(stepIds.length, index);
    const stepMap = stepIds.map((stepId, stepIndex) => toStepLane(stepId, lane, load, stepIndex));

    laneRecords[String(toLaneId(index, lane))] = {
      laneId: toLaneId(index, lane),
      capacity: 10,
      pressure: load,
      steps: stepMap,
      window: stepIds,
    };

    if (load > 0.7) {
      overload += 1;
      reason.push(`${String(toLaneId(index, lane))}:${load.toFixed(2)}`);
    }
  }

  return {
    updatedAt: new Date().toISOString(),
    lanes: laneRecords,
    overload,
    reason,
  };
};

export const buildLaneManifestSignature = (state: LaneState): LaneManifest => ({
  signature: withBrand(`lane-manifest:${state.updatedAt}:${state.overload}`, 'StudioLaneManifestSignature'),
  snapshot: state,
  lanes: Object.keys(state.lanes).toSorted(),
});

export const routeByLane = <T extends readonly StepId[]>(
  lanes: T,
  prefix: string,
): readonly Brand<string, 'StudioLaneRoute'>[] =>
  lanes
    .slice(0, 12)
    .map((step, index) => withBrand(`${prefix}:${step}:${index}`, 'StudioLaneRoute'));

export const toLaneMap = <TSignals extends readonly IncidentLabSignal[]>(
  signals: TSignals,
): Record<`lane:${IncidentLabSignal['kind']}`, readonly IncidentLabSignal[]> =>
  signals.reduce<Record<`lane:${IncidentLabSignal['kind']}`, readonly IncidentLabSignal[]>>(
    (acc, signal) => {
      const key = `lane:${signal.kind}` as `lane:${IncidentLabSignal['kind']}`;
      acc[key] = [...(acc[key] ?? []), signal];
      return acc;
    },
    {
      'lane:capacity': [],
      'lane:latency': [],
      'lane:integrity': [],
      'lane:dependency': [],
    },
  );
