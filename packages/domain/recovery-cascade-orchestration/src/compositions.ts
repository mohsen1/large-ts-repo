import { asReadonly } from '@shared/core';
import { chunkArray } from '@shared/cascade-orchestration-kernel';
import type { StageContract } from './blueprints.js';

export interface CompositionContext<TInput> {
  readonly input: TInput;
  readonly metadata: Record<string, unknown>;
}

export const sortStagesByDependency = <TStages extends readonly StageContract[]>(
  stages: TStages,
): readonly TStages[number][] => {
  const sorted: TStages[number][] = [];
  const unresolved = new Map<TStages[number]['name'], TStages[number]>(
    stages.map((stage) => [stage.name, stage]),
  );

  while (unresolved.size > 0) {
    let progress = false;

    for (const [name, stage] of unresolved) {
      const done = stage.dependencies.every((dependency) => {
        return sorted.some((sortedStage) => `dep:${sortedStage.name}` === dependency);
      });

      if (done) {
        sorted.push(stage);
        unresolved.delete(name);
        progress = true;
      }
    }

    if (!progress) {
      sorted.push(...unresolved.values());
      unresolved.clear();
    }
  }

  return asReadonly(sorted) as readonly TStages[number][];
};

export const runChain = async <T extends readonly StageContract[]>(
  stages: T,
  inputs: { [K in T[number] as K['name']]: K['input'] },
): Promise<Record<T[number]['name'], unknown>> => {
  const sorted = sortStagesByDependency(stages);
  const result: Record<string, unknown> = {};

  for (const stage of sorted) {
    const stagedInput = (inputs as Record<string, unknown>)[stage.name] ?? stage.input;
    const payload = (typeof stagedInput === 'object' && stagedInput !== null)
      ? stagedInput
      : { value: stagedInput };
    const out = Object.assign({}, payload, {
      source: stage.metadata,
      produced: new Date().toISOString(),
      stageId: stage.stageId,
    });
    result[stage.name] = out;
  }

  return result as Record<T[number]['name'], unknown>;
};

export const splitInWindows = <T>(items: readonly T[], windowSize: number): T[][] => {
  return chunkArray(items, Math.max(windowSize, 1));
};

export const composeBatches = <T>(items: readonly T[], batchSize: number): readonly T[][] =>
  splitInWindows(items, batchSize);

export const executeWithWindows = async <T>(items: readonly T[], width: number): Promise<T[][]> => {
  const output: T[][] = [];
  for (const batch of splitInWindows(items, width)) {
    output.push(await Promise.resolve(batch));
  }
  return output;
};
