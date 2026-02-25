import type { NoInfer } from '@shared/type-level';
import type { AnalyticsRun, SignalKind, EventKind } from './identifiers';

export type StepState = 'idle' | 'running' | 'done' | 'failed';
export type StageId = `stage:${string}`;

export type StageDescriptor<TName extends string = string> = {
  readonly id: StageId;
  readonly name: TName;
  readonly kind: EventKind;
  readonly dependencies: readonly StageId[];
  readonly timeoutMs: 250 | 500 | 750 | 1000 | 2000;
  readonly enabled: boolean;
};

export type PipelineStep<TName extends string = string, TInput = unknown, TOutput = unknown> = Readonly<{
  readonly id: StageId;
  readonly name: TName;
  readonly kind: EventKind;
  readonly onStart: (input: TInput) => Promise<TInput>;
  readonly transform: (input: NoInfer<TInput>) => Promise<TOutput>;
  readonly onError: (error: unknown, event: NoInfer<TInput>) => Promise<TInput>;
}>;

export type PipelineTemplate<
  TSteps extends readonly PipelineStep[],
> = {
  readonly run: (runId: AnalyticsRun) => Promise<void>;
  readonly version: `v${number}`;
  readonly steps: TSteps;
  readonly signature: StepSignature<TSteps>;
};

type Tail<T extends readonly unknown[]> = T extends readonly [unknown, ...infer TRest]
  ? TRest
  : [];

export type StepSignature<TSteps extends readonly PipelineStep[]> = TSteps extends readonly [
  infer THead extends PipelineStep,
  ...infer TRest extends readonly PipelineStep[],
]
  ? TRest extends readonly PipelineStep[]
    ? `${THead['name']}::${StepSignature<TRest>}`
    : `${THead['name']}`
  : 'noop';

export type StepNames<TSteps extends readonly PipelineStep[]> = {
  [K in keyof TSteps]: TSteps[K] extends PipelineStep<infer TName> ? TName : never;
};

type NormalizeStepList<TSteps extends readonly PipelineStep[]> = TSteps extends readonly [
  infer THead extends PipelineStep,
  ...infer TRest extends readonly PipelineStep[],
]
  ? readonly [
      {
        readonly name: THead['name'];
        readonly kind: THead['kind'];
        readonly id: THead['id'];
      },
      ...NormalizeStepList<TRest & readonly PipelineStep[]>,
    ]
  : readonly [];

export const normalizeSteps = <const TSteps extends readonly PipelineStep[]>(
  steps: NoInfer<TSteps>,
): NormalizeStepList<TSteps> => {
  const out = steps.map((entry) => ({
    name: entry.name,
    kind: entry.kind,
    id: entry.id,
  }));
  return out as unknown as NormalizeStepList<TSteps>;
};

export const buildStepSignature = <TSteps extends readonly PipelineStep[]>(steps: NoInfer<TSteps>): StepSignature<TSteps> => {
  const values = normalizeSteps(steps).map((entry) => entry.name).join('>');
  return (values || 'noop') as StepSignature<TSteps>;
};

export const inferStepSignals = <TSignal extends SignalKind, TPayload>(signal: TSignal): `out:${TSignal}` => {
  void ({} as TPayload);
  return `out:${signal}`;
};

export const createPipeline = <TSteps extends readonly PipelineStep[]>(steps: NoInfer<TSteps>): PipelineTemplate<TSteps> => {
  const signature = buildStepSignature(steps);
  const template: PipelineTemplate<TSteps> = {
    run: async () => {
      return;
    },
    version: 'v1',
    steps,
    signature,
  };
  return template;
};

export const buildPipeline = <TInput, TSteps extends readonly PipelineStep[]>(
  runId: AnalyticsRun,
  steps: NoInfer<TSteps>,
  event: TInput,
): string => {
  const ordered = normalizeSteps(steps);
  const labels = ordered.map((entry) => `${entry.id}:${entry.kind}`);
  return `${runId}::${(event as { readonly id?: string }).id ?? String(event)}::${labels.join('~')}`;
};

export const isStepEnabled = (step: PipelineStep): boolean => step.onStart !== undefined;
