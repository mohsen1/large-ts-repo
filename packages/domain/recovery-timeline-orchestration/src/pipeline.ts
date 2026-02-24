import { type RecoveryTimeline, type RecoveryTimelineEvent, type RecoveryTimelineSegment } from '@domain/recovery-timeline';
import {
  createConductorId,
  type ConductorId,
  type ConductorMetricSample,
  type ConductorMode,
} from './types';

export interface ConductorStepInput {
  readonly timelineId: string;
  readonly events: readonly RecoveryTimelineEvent[];
  readonly segments: readonly RecoveryTimelineSegment[];
  readonly samples: readonly ConductorMetricSample[];
}

export interface ConductorStepOutput {
  readonly timelineId: string;
  readonly messages: readonly string[];
  readonly risk: number;
  readonly candidates: readonly string[];
}

export interface ConductorStep<TInput, TOutput> {
  readonly kind: string;
  readonly run: (input: TInput) => Promise<TOutput>;
}

export type ConductorChain<TSteps extends readonly ConductorStep<any, any>[]> = {
  readonly steps: [...TSteps];
};

export type AppendConductorStep<
  TChain extends readonly ConductorStep<any, any>[],
  TNext extends ConductorStep<any, any>,
> = ConductorChain<[...TChain, TNext]>;

export type ConductorInputFromChain<TChain extends readonly ConductorStep<any, any>[]> =
  TChain extends readonly [infer H, ...infer _Tail]
    ? H extends ConductorStep<infer I, any>
      ? I
      : never
    : never;

export type ConductorOutputFromChain<TChain extends readonly ConductorStep<any, any>[]> =
  TChain extends readonly [...infer _Head, infer L]
    ? L extends ConductorStep<any, infer O>
      ? O
      : never
    : never;

export function createChain<TSteps extends readonly ConductorStep<any, any>[]>(steps: TSteps): ConductorChain<TSteps> {
  return { steps: [...steps] } as ConductorChain<TSteps>;
}

export async function executeChain<TSteps extends readonly ConductorStep<any, any>[]>(
  chain: ConductorChain<TSteps>,
  input: ConductorInputFromChain<TSteps>,
): Promise<ConductorOutputFromChain<TSteps>> {
  let cursor: unknown = input;
  for (const step of chain.steps) {
    cursor = await step.run(cursor);
  }
  return cursor as ConductorOutputFromChain<TSteps>;
}

export function composeChain<T1 extends ConductorStep<any, any>, T2 extends ConductorStep<any, any>>(
  left: T1,
  right: T2,
): AppendConductorStep<[T1], T2> {
  return createChain([left, right] as const) as AppendConductorStep<[T1], T2>;
}

export async function analyzePlan(
  timeline: RecoveryTimeline,
): Promise<ConductorStepOutput> {
  const candidates = timeline.events
    .filter((event) => event.state === 'failed' || event.state === 'blocked')
    .map((event) => event.id);

  const risk = timeline.events.reduce((acc, event) => acc + event.riskScore, 0) / Math.max(1, timeline.events.length);

  return {
    timelineId: timeline.id,
    messages: candidates.map((candidate) => `candidate:${candidate}`),
    risk,
    candidates,
  };
}

export async function enrichEvents(
  input: ConductorStepInput,
): Promise<ConductorStepOutput> {
  const messages: string[] = [];
  for (const event of input.events) {
    if (event.dependencies.length > 0) {
      messages.push(`${event.id}->${event.dependencies.join('|')}`);
    }
  }

  const avgRisk = input.samples.length > 0
    ? input.samples.reduce((acc, sample) => acc + sample.score, 0) / input.samples.length
    : 0;

  return {
    timelineId: input.timelineId,
    messages,
    risk: avgRisk,
    candidates: input.samples.map((sample) => `${sample.phase}:${sample.score}`),
  };
}

export async function simulateConductorOutcome(
  mode: ConductorMode,
  input: ConductorStepOutput,
  baseline: RecoveryTimeline,
): Promise<ConductorStepOutput & { readonly runId: ConductorId<ConductorMode> }> {
  const runId = createConductorId(mode);
  const next = `${runId}`;
  return {
    timelineId: input.timelineId,
    runId,
    messages: [next, ...input.messages],
    risk: input.risk * 0.84,
    candidates: [...baseline.events.map((event) => event.id), ...input.candidates],
  };
}

export const defaultChain = createChain([
  {
    kind: 'analyze',
    run: async (timeline: RecoveryTimeline) => analyzePlan(timeline),
  },
  {
    kind: 'enrich',
    run: async (output: ConductorStepOutput) => {
      return {
        ...output,
        candidates: output.candidates,
      };
    },
  },
]);
