import { z } from 'zod';
import {
  designDefaults,
  stageCatalog,
  isKnownKind,
  type StageConfigSchema,
  type StageChainTemplate,
  type StagePlan,
  type StageVerb,
  type StagePayload,
  type ScenarioContext,
  runPluginSequence,
} from '@shared/scenario-design-kernel';
import { type ScenarioTemplate, type ScenarioStudioInput, type ScenarioRunSnapshot } from '../../types/scenario-studio';
import type { StageStatus } from '@domain/recovery-scenario-design';

const traceSchema = z.object({
  owner: z.string().min(2),
  mode: z.enum(['analysis', 'simulation', 'execution', 'chaos']),
  parameters: z.record(z.unknown()),
});

export interface EngineEnvelope<TInput, TOutput> {
  readonly template: ScenarioTemplate;
  readonly payload: TPayload<TInput, TOutput>;
}

export interface StagePlugin<TInput, TOutput> {
  readonly stage: StageVerb;
  readonly execute: (input: TInput) => Promise<TOutput>;
  readonly confidence: number;
}

type TPayload<TInput, TOutput> = {
  readonly input: TInput;
  readonly output: TOutput;
  readonly status: StageStatus;
  readonly emittedAt: number;
};

export interface EngineReport<TInput, TOutput> {
  readonly runId: string;
  readonly output: TOutput;
  readonly latencyMs: number;
  readonly stages: readonly TPayload<TInput, TOutput>[];
}

export interface EnginePlan<TKind extends StageVerb, TInput, TOutput> extends StagePlan<TKind, TInput, TOutput> {
  readonly pluginIds: readonly string[];
}

const envelopeSchema = z.object({
  input: z.record(z.unknown()),
  output: z.record(z.unknown()),
  status: z.string(),
  emittedAt: z.number().int(),
});

type StageRecord<T> = {
  readonly id: string;
  readonly value: T;
  readonly status: StageStatus;
};

export const traceDefaults = {
  ownerPrefix: 'studio-owner',
  ownerWindowMs: 15 * 60 * 1000,
  checkpointEvery: 2,
} as const;

export function buildEngineTemplate<TInput, TOutput>(
  source: readonly Pick<ScenarioTemplate, 'id' | 'stages'>[],
  input: ScenarioStudioInput,
): StageChainTemplate<readonly EnginePlan<StageVerb, TInput, TOutput>[]> {
  const parsed = traceSchema.parse({
    owner: input.owner,
    mode: input.mode,
    parameters: input.parameters,
  });

  const plan: StageChainTemplate<readonly EnginePlan<StageVerb, TInput, TOutput>[]> = (source.length > 0 ? source : [])
    .flatMap((entry) => entry.stages)
    .filter((item) => isKnownKind(item.id))
    .map((stage, index) => {
      const catalog = stageCatalog[stage.kind as StageVerb];
      const config = (catalog?.requirements.length ?
        {
          endpoint: `${stage.id}.api`,
          timeoutMs: 150 + (index * 8),
          sources: catalog.requirements,
          threshold: 0.5,
          horizonMs: designDefaults.checkpointWindowMs,
          confidence: 0.75,
          maxRetries: catalog.requirements.length,
          checks: catalog.requirements,
          rollbackId: `rb-${index}`,
          hardCutover: false,
          auditOnly: false,
        } :
        {});
      return {
        kind: stage.kind as StageVerb,
        id: `engine-${index}` as EnginePlan<StageVerb, TInput, TOutput>['id'],
        input: null as unknown as TInput,
        output: null as unknown as TOutput,
        config: config as StageConfigSchema,
        pluginIds: [catalog?.token as string ?? `fallback:${index}`],
        execute: async (context) => context,
      };
    }) as StageChainTemplate<readonly EnginePlan<StageVerb, TInput, TOutput>[]>;

  void parsed;
  return plan;
}

export async function runEngine<TInput, TOutput>(
  template: StageChainTemplate<readonly StagePlan<StageVerb, TInput, TOutput>[]>,
  context: ScenarioContext,
  input: TInput,
): Promise<EngineReport<TInput, TOutput>> {
  const plan = [...template]
    .filter((entry) => entry.kind)
    .map((entry, index) => ({
      ...entry,
      pluginIds: [`plugin.${index}`],
    }));

  const stages = plan.map((item, index): StagePayload<ScenarioContext, TInput, TOutput> => {
    const status: StageStatus = index % 2 === 0 ? 'completed' : 'active';
    return {
      stageId: `${item.id}` as unknown as StagePayload<ScenarioContext, TInput, TOutput>['stageId'],
      status,
      context,
      input,
      emittedAt: Date.now(),
    };
  });

  const output = await runPluginSequence(
    input,
    plan.map((item) => ({
      id: `engine-plugin-${item.id}` as unknown as string,
      label: item.id,
      kind: item.kind,
      config: item.config,
      execute: async (stageInput) => stageInput,
    })),
    {
      runId: context.scenario,
      scenario: context.scenario,
      clock: BigInt(stages.length + input.toString().length),
    },
  ) as TOutput;

  const result = envelopeSchema.parse({
    input,
    output,
    status: stages.length ? stages.at(-1)?.status : 'queued',
    emittedAt: Date.now(),
  });

  const outputRun: StageRecord<TOutput> = {
    id: context.runId,
    value: result.output,
    status: result.status === 'completed' ? 'completed' : 'active',
  };
  void outputRun;

  return {
    runId: context.runId,
    output,
    latencyMs: result.emittedAt - Date.now(),
    stages: [...stages],
  };
}

export function selectStageDefaults(kind: StageVerb): StageConfigSchema<StageVerb> {
  const catalog = stageCatalog[kind];
  if (!catalog) {
    return {
      endpoint: 'fallback',
      timeoutMs: 0,
      sources: ['local'],
      threshold: 0,
      horizonMs: 0,
      confidence: 0,
      maxRetries: 0,
      checks: [],
      rollbackId: 'n/a',
      hardCutover: false,
      auditOnly: false,
    };
  }

  return {
    endpoint: `${catalog.token}.svc`,
    timeoutMs: catalog.latencyP95Ms,
    sources: [...catalog.requirements],
    threshold: 0.65,
    horizonMs: designDefaults.checkpointWindowMs,
    confidence: 0.84,
    maxRetries: 2,
    checks: [...catalog.requirements],
    rollbackId: `rb-${catalog.token}`,
    hardCutover: false,
    auditOnly: false,
  };
}

export function enrichTemplateDiagnostics<TTemplate extends readonly ScenarioTemplate[]>(
  templates: TTemplate,
): readonly { readonly templateId: string; readonly averageStageCount: number }[] {
  return templates.map((template) => ({
    templateId: template.id,
    averageStageCount: Math.round(template.stages.length / designDefaults.stages.length),
  }));
}

