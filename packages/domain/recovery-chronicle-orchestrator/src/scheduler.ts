import type { OrchestrationMode, OrchestrationPolicy, OrchestrationStage, OrchestrationStageDescriptor } from './types';

export interface ScheduleInput {
  readonly tenant: string;
  readonly policy: OrchestrationPolicy;
  readonly mode: OrchestrationMode;
}

export interface StageSlot {
  readonly stage: OrchestrationStage;
  readonly weight: number;
}

export type StageSchedule<T extends readonly OrchestrationStageDescriptor[]> = {
  readonly order: T;
  readonly budget: number;
  readonly parallel: boolean;
};

const stageWeight = (stage: OrchestrationStage): number =>
  stage === 'bootstrap' ? 20 : stage === 'policy' ? 30 : stage === 'telemetry' ? 15 : 10;

export const prioritizeStages = (policy: OrchestrationPolicy): readonly StageSlot[] =>
  policy.stages
    .map((stage, index) => ({ stage, weight: stageWeight(stage) + index }))
    .toSorted((left, right) => right.weight - left.weight);

export const buildSchedule = <TPlugins extends readonly OrchestrationStageDescriptor[]>(
  descriptors: TPlugins,
  input: ScheduleInput,
): StageSchedule<TPlugins> => {
  const slotWeight = new Map<string, number>(
    prioritizeStages(input.policy).map((slot) => [slot.stage, slot.weight]),
  );

  const order = descriptors
    .toSorted((left, right) => {
      const leftWeight = slotWeight.get(left.stage) ?? stageWeight(left.stage);
      const rightWeight = slotWeight.get(right.stage) ?? stageWeight(right.stage);
      return rightWeight - leftWeight;
    })
    .map((descriptor) => ({ ...descriptor })) as unknown as TPlugins;

  return {
    order,
    budget: Math.max(32, input.policy.maxParallelism * 16),
    parallel: input.mode === 'adaptive',
  };
};

export const toSlots = (inputs: readonly OrchestrationStage[]): readonly StageSlot[] =>
  inputs.map((stage, index) => ({ stage, weight: stageWeight(stage) + index * 2 }));

export const slotCoverage = (slots: readonly StageSlot[]): readonly StageSlot[] => {
  const unique = new Map<OrchestrationStage, StageSlot>();
  for (const slot of slots) {
    const existing = unique.get(slot.stage);
    unique.set(slot.stage, existing ? { stage: slot.stage, weight: Math.max(existing.weight, slot.weight) } : slot);
  }
  return [...unique.values()];
};
