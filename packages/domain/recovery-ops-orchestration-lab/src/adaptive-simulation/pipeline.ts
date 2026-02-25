import {
  buildSummary,
  type SimulationEnvelope,
  type SimulationResult,
  type SimulationSummary,
} from './types';
import type { DeepReadonly } from '@shared/type-level';

export type PipelinePhase =
  `pipeline:${'discover' | 'shape' | 'simulate' | 'validate' | 'recommend' | 'execute' | 'verify' | 'close'}`;

export type StageDiagnostics = {
  readonly stageId: string;
  readonly durationMs: number;
  readonly event: string;
};

export interface PipelineStage<TInput = object, TOutput = object> {
  readonly id: PipelinePhase;
  readonly inputShape: string;
  readonly outputShape: string;
  run(input: TInput, traceId: string): Promise<TOutput>;
}

export type PipelineInput<TStages extends readonly PipelineStage[]> = TStages extends readonly [
  infer Head extends PipelineStage<infer TInput, any>,
  ...PipelineStage[]
]
  ? TInput
  : object;

export type PipelineOutput<TStages extends readonly PipelineStage[]> = TStages extends readonly [
  ...PipelineStage[],
  PipelineStage<any, infer TOutput>
]
  ? TOutput
  : object;

export interface AdaptivePipelineResult<TPayload = object> {
  readonly runId: string;
  readonly sessionId: string;
  readonly output: TPayload;
  readonly diagnostics: readonly StageDiagnostics[];
  readonly timeline: readonly PipelinePhase[];
}

export const buildPipelineRunId = (phase: PipelinePhase, seed: string): string => `${phase}-${seed}-${Date.now()}`;

export const runAdaptivePipeline = async <
  const TStages extends readonly PipelineStage[],
  const TInput extends PipelineInput<TStages>,
>(
  stages: TStages,
  input: TInput,
): Promise<AdaptivePipelineResult<PipelineOutput<TStages>>> => {
  const runId = buildPipelineRunId(stages[0]?.id ?? 'pipeline:discover', `${Date.now()}`);
  const timeline: PipelinePhase[] = [stages[0]?.id ?? 'pipeline:discover'];
  const diagnostics: StageDiagnostics[] = [];
  let current: object = input as object;

  for (const stage of stages) {
    const started = performance.now();
    const result = await (stage.run as (input: object, traceId: string) => Promise<object>)(current, runId);
    current = result;
    diagnostics.push({
      stageId: stage.id,
      durationMs: Math.max(0, performance.now() - started),
      event: `${stage.inputShape}->${stage.outputShape}`,
    });
    timeline.push(stage.id);
  }

  return {
    runId,
    sessionId: `session-${runId}`,
    output: current as PipelineOutput<TStages>,
    diagnostics,
    timeline,
  };
};

export const buildPipelineDigest = <TStages extends readonly PipelineStage[]>(stages: TStages): string => {
  return stages.map((stage) => stage.id).join('|');
};

export const pipelineDiagnosticsFromOutput = <TStages extends readonly PipelineStage[]>(
  run: AdaptivePipelineResult<unknown>,
  stages: TStages,
): readonly string[] => [
  run.runId,
  run.sessionId,
  `stages=${stages.length}`,
  `diagnostics=${run.diagnostics.length}`,
  `timeline=${run.timeline.join('>')}`,
];

export const collectPlanSummaries = (runs: readonly AdaptivePipelineResult[]): readonly string[] =>
  runs
    .toSorted((left, right) => right.diagnostics.length - left.diagnostics.length)
    .map((run) => `${run.runId}:${run.timeline.length}`);

export const createSimulationEnvelopeResult = <
  TPayload extends object,
  TContext extends object,
>(
  envelope: SimulationEnvelope<TContext>,
  output: TPayload,
  summary: SimulationSummary = buildSummary(envelope.envelope),
): SimulationResult<TPayload, TContext> => {
  return {
    sessionId: envelope.id,
    runId: envelope.runId,
    output: output as DeepReadonly<TPayload>,
    context: envelope.context as DeepReadonly<TContext>,
    candidates: [],
    selectedPlanId: undefined,
    diagnostics: [`session=${envelope.id}`, `phase=${envelope.phase}`, `summary=${envelope.summary.signalCount}`],
    summary,
  };
};

export const appendCandidate = <
  TOutput,
  TPlanId extends string,
>(
  result: SimulationResult<TOutput>,
  planId: TPlanId,
  score: number,
  rationale: string,
): SimulationResult<TOutput> => {
  return {
    ...result,
    candidates: [
      {
        id: planId as never,
        score,
        topology: 'grid',
        rationale,
        metadata: { source: 'adaptive-session', score },
      },
      ...result.candidates,
    ],
    selectedPlanId: result.selectedPlanId ?? (planId as never),
  };
};

export type RecursiveTuple<
  T extends readonly PipelineStage[],
  Prefix extends string = 'stage',
> = T extends readonly [
  infer Head extends PipelineStage,
  ...infer Tail extends readonly PipelineStage[],
]
  ? readonly [
      stageId: Head['id'],
      phase: `${Prefix}:${Head['id']}`,
      output: Awaited<ReturnType<Head['run']>>,
      tail: RecursiveTuple<Tail, Prefix>,
    ]
  : readonly [
      stageId: `${Prefix}:end`,
      phase: `${Prefix}:end`,
      output: never,
      tail: never,
    ];

export const mapPluginResultToTuple = <TStages extends readonly PipelineStage[]>(
  result: readonly unknown[],
): RecursiveTuple<TStages> => result as RecursiveTuple<TStages>;

export const runAdaptiveTimeline = async <TStages extends readonly PipelineStage[]>(stages: TStages): Promise<TStages> => {
  return stages;
};
