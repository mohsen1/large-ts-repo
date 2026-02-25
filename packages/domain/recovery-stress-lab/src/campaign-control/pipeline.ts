import { type NoInfer } from '@shared/type-level';
import {
  type CampaignBundleId,
  type CampaignContextState,
  type CampaignPlanResult,
  type CampaignPhase,
  type CampaignSeed,
  createCampaignSessionId,
  createCampaignId,
} from './types';

export interface CampaignPipelineEvent {
  readonly phase: CampaignPhase;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly phaseMs: number;
}

export interface CampaignPipelineStep<TInput = unknown, TOutput = unknown, TContext extends CampaignContextState = CampaignContextState> {
  readonly id: CampaignBundleId;
  readonly phase: CampaignPhase;
  execute(input: TInput, context: NoInfer<TContext>): Promise<{
    readonly ok: boolean;
    readonly output: TOutput;
    readonly events: readonly CampaignPipelineEvent[];
  }>;
}

export type InferInput<C extends readonly CampaignPipelineStep[]> =
  C extends readonly [infer Head, ...infer _Rest]
    ? Head extends CampaignPipelineStep<infer I>
      ? I
      : never
    : never;

export type InferOutput<C extends readonly CampaignPipelineStep[]> =
  C extends readonly [...infer _Prefix, infer Last]
    ? Last extends CampaignPipelineStep<any, infer O>
      ? O
      : never
    : never;

export type PipelineTelemetry<TSteps extends readonly CampaignPipelineStep[]> = {
  readonly inputType: InferInput<TSteps>;
  readonly outputType: InferOutput<TSteps>;
  readonly stepCount: number;
};

export interface CampaignPlanBlueprint {
  readonly tenant: string;
  readonly title: string;
  readonly windowCount: number;
}

export const buildPlanBlueprint = (seed: CampaignSeed): CampaignPlanBlueprint => ({
  tenant: String(seed.tenantId),
  title: seed.title,
  windowCount: seed.windows.length,
});

export const composeCampaignPipeline = <
  const TSteps extends readonly CampaignPipelineStep[],
>(
  sessionSeed: CampaignSeed,
  steps: NoInfer<TSteps>,
): ((seed: CampaignSeed, context: CampaignContextState) => Promise<{
  readonly ok: boolean;
  readonly steps: TSteps;
  readonly events: readonly CampaignPipelineEvent[];
  readonly telemetry: PipelineTelemetry<TSteps>;
  readonly output: InferOutput<TSteps>;
}>) => {
  const sessionId = createCampaignSessionId(sessionSeed.tenantId, createCampaignId(sessionSeed.tenantId, sessionSeed.campaignId));
  return async (seed: CampaignSeed, context: CampaignContextState) => {
    const collected: CampaignPipelineEvent[] = [];
    let current: unknown = seed;

    for (const step of steps) {
      const startedAt = new Date().toISOString();
      const result = await step.execute(current as never, context);
      const endedAt = new Date().toISOString();

      const phaseMs = Math.max(1, Date.parse(endedAt) - Date.parse(startedAt));
      collected.push({ phase: step.phase, startedAt, endedAt, phaseMs });
      current = result.output;
      if (!result.ok) {
        break;
      }
    }

    const output = current as InferOutput<TSteps>;
    const blueprint = buildPlanBlueprint(seed);

    void sessionId;
    return {
      ok: typeof current === 'object' || Array.isArray(current),
      steps,
      events: [...collected],
      telemetry: {
        inputType: sessionSeed,
        outputType: output,
        stepCount: steps.length,
      } as PipelineTelemetry<TSteps>,
      output,
    };
  };
};

export const normalizePhaseOrder = (phases: readonly CampaignPhase[]): readonly CampaignPhase[] => {
  const order: Record<CampaignPhase, number> = {
    seed: 1,
    discovery: 2,
    modeling: 3,
    orchestration: 4,
    simulation: 5,
    verification: 6,
    review: 7,
  };

  return [...phases].sort((left, right) => order[left] - order[right]);
};

export const extractPlanFromOutput = <TOutput extends CampaignPlanResult>(output: TOutput): {
  readonly phases: readonly CampaignPhase[];
  readonly sessionId: string;
} => {
  return {
    phases: output.phases,
    sessionId: String(output.sessionId),
  };
};
