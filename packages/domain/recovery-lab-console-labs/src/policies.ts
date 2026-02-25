import {
  type ControlLabContext,
  type ControlLabVerb,
  type LabRunOutput,
  type LabRunId,
} from './types';

export type PolicyTuple = readonly [string, number];

export interface PolicyDecision<TPayload> {
  readonly policyName: string;
  readonly weight: number;
  readonly reason: string;
  readonly input: TPayload;
}

export type PolicyBucket<T extends readonly PolicyTuple[]> = {
  [K in T[number] as K[0]]: Extract<T[number], [K[0], any]>[1];
};

export type PolicyScorer<T> = (input: T) => number;

export const rankPolicies = <T extends readonly PolicyTuple[]>(policies: T): readonly PolicyTuple[] => {
  return [...policies].sort((left, right) => right[1] - left[1]);
};

export const selectPolicy = <TInput, T extends readonly PolicyTuple[]>(
  policies: T,
  payload: TInput,
  threshold = 0.5,
): PolicyDecision<TInput> => {
  const ranked = rankPolicies(policies);
  const selection = ranked.find(([, score]) => score >= threshold) ?? ranked[ranked.length - 1] ?? ['default', 0];
  return {
    policyName: selection[0],
    weight: selection[1],
    reason: `ranked=${ranked.length}`,
    input: payload,
  };
};

export const blendPolicy = (items: readonly PolicyTuple[], fallback: string): PolicyBucket<typeof items> => {
  const reduced = items.reduce(
    (acc, [name, weight]) => ({
      ...acc,
      [name]: weight,
    }),
    {} as Record<string, number>,
  );
  return {
    ...reduced,
    [fallback]: reduced[fallback] ?? 0,
  } as PolicyBucket<typeof items>;
};

export const reducePolicyScores = <T>(
  values: readonly T[],
  scorer: PolicyScorer<T>,
  base: number,
): number => values.reduce((acc, value) => acc + scorer(value), base);

export const buildPolicyReason = (selected: string, score: number): string =>
  `${selected}:score=${score.toFixed(2)}:${new Date().toISOString()}`;

export interface PolicySimulationInput<TPayload, TMeta> {
  readonly payload: TPayload;
  readonly context: TMeta;
  readonly requestedStage: ControlLabVerb;
  readonly timestamp: string;
}

export interface PolicySimulationOutput<TPayload> {
  readonly accepted: boolean;
  readonly reasons: readonly string[];
  readonly nextPayload: TPayload;
}

export const simulatePolicyInput = <TPayload, TMeta>(
  payload: TPayload,
  context: TMeta,
  stage: ControlLabVerb,
): PolicySimulationInput<TPayload, TMeta> => ({
  payload,
  context,
  requestedStage: stage,
  timestamp: new Date().toISOString(),
});

export const evaluatePolicyResult = <TPayload>(
  input: PolicySimulationInput<TPayload, ControlLabContext>,
  policy: string,
  score: number,
): PolicySimulationOutput<TPayload> => {
  const accepted = score >= 0.5;
  return {
    accepted,
    reasons: [
      `${policy} ${input.requestedStage}`,
      `tenant=${input.context.tenantId}`,
      `score=${score}`,
      accepted ? 'accepted' : 'rejected',
    ],
    nextPayload: input.payload,
  };
};

export const pluginResultSummary = <T extends { status: 'passed' | 'skipped' | 'failed'; output: T; notes: readonly string[] }>(
  result: T,
): {
  status: T['status'];
  note: string;
} => ({
  status: result.status,
  note: `${result.status} notes=${result.notes.length}`,
});

export interface PolicyRunReport<TOutput = unknown> {
  readonly runId: LabRunId;
  readonly elapsedMs: number;
  readonly policy: string;
  readonly decision: string;
  readonly output: TOutput;
}

export const buildPolicyRunReport = <TOutput>(
  run: Omit<LabRunOutput<TOutput>, 'output'>,
  policy: string,
  decision: string,
): PolicyRunReport<TOutput> => ({
  runId: run.runId,
  elapsedMs: run.elapsedMs,
  policy,
  decision,
  output: run.timeline as TOutput,
});
