import { createPipeline } from '@shared/playbook-studio-runtime';
import { useMemo } from 'react';
import {
  type PlaybookRunSummary,
  stageKinds,
} from '@domain/recovery-playbook-studio-core';

export interface StageContext<TInput, TOutput> {
  readonly value: TInput;
  readonly stage: string;
  readonly output: TOutput;
}

export interface PipelineProfile {
  readonly stage: string;
  readonly elapsedMs: number;
  readonly resultKey: string;
}

const parseStages = (input: readonly string[]): readonly string[] =>
  [...new Set(input)].filter((value) => typeof value === 'string');

export const createStudioPipeline = <TInput, TOutput>(
  name: string,
  stages: readonly StageKindSpec<TInput, TOutput>[],
) => {
  const stageNames = parseStages(stages.map((entry) => entry.name));
  return createPipeline(name, ...stages.map((entry) => entry.run));
};

export type StageKindSpec<TInput, TOutput> = {
  readonly name: (typeof stageKinds)[number];
  readonly run: (value: TInput) => Promise<TOutput> | TOutput;
};

export interface PipelineResult {
  readonly profile: readonly PipelineProfile[];
  readonly last: unknown;
}

export const executePipeline = async <
  const TInput,
  const TOutput,
>(
  source: TInput,
  specs: readonly StageKindSpec<TInput, TOutput>[],
): Promise<PipelineResult> => {
  const started = performance.now();
  const pipeline = createStudioPipeline<TInput, TOutput>('studio.ui.pipeline', specs);
  const last = await pipeline.run(source);
  const elapsed = performance.now() - started;
  return {
    profile: specs.map((spec, index) => ({
      stage: spec.name,
      elapsedMs: Math.max(0, elapsed / (index + 1)),
      resultKey: String(last),
    })),
    last,
  };
};

export const useStudioPipelineProfile = <TInput, TOutput>(
  source: TInput,
  specs: readonly StageKindSpec<TInput, TOutput>[],
) => {
  return useMemo(() => ({
    source,
    stages: specs.map((item) => item.name),
  }), [source, specs]);
};

export const runProfileToSummary = (run: { readonly stages?: readonly PlaybookRunSummary['runId'][] }): string =>
  run.stages ? `stages:${run.stages.length}` : 'no-stages';

export type RunOutput<T extends { readonly status: string }> = {
  readonly status: T['status'];
  readonly started: string;
};

export const asRunOutput = <T extends { readonly status: string }>(run: T): RunOutput<T> => ({
  status: run.status,
  started: new Date().toISOString(),
});
