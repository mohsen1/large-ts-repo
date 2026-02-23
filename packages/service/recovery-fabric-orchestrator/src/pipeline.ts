import { type FabricPlan, type AlertSignal, type FabricTopology } from '@domain/recovery-ops-fabric';

export interface PipelineStep<TIn, TOut> {
  readonly name: string;
  execute(input: TIn): TOut;
}

export interface FabricPipelineInput {
  readonly topology: FabricTopology;
  readonly signals: readonly AlertSignal[];
}

export interface FabricPipelineResult {
  readonly plan: FabricPlan;
  readonly filtered: number;
  readonly generatedAt: string;
}

export const createSignalFilterStep = (): PipelineStep<FabricPipelineInput, FabricPipelineInput> => ({
  name: 'signal-filter',
  execute(input) {
    const signals = input.signals.filter((signal) => signal.value >= signal.baseline);
    return { ...input, signals };
  },
});

export const createDedupStep = (): PipelineStep<FabricPipelineInput, FabricPipelineInput> => ({
  name: 'dedup',
  execute(input) {
    const seen = new Set<string>();
    const filtered = input.signals.filter((signal) => {
      if (seen.has(signal.id)) {
        return false;
      }
      seen.add(signal.id);
      return true;
    });
    return { ...input, signals: filtered };
  },
});

export const runPipeline = (
  input: FabricPipelineInput,
  steps: PipelineStep<FabricPipelineInput, FabricPipelineInput>[],
): FabricPipelineInput => {
  let current = input;
  for (const step of steps) {
    current = step.execute(current);
  }
  return current;
};

export const executePipeline = (_plan: FabricPlan, _input: FabricPipelineInput): FabricPipelineResult => {
  return {
    plan: _plan,
    filtered: _input.signals.length,
    generatedAt: new Date().toISOString(),
  };
};
