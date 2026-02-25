import { z } from 'zod';
import type { ZodIssue } from 'zod';
import type { Brand, NoInfer, KeyPaths } from '@shared/type-level';
import { defaultStudioStages, type PluginRoute, type StudioPolicyDefinition } from './advanced-types';
import { flow, FlowSequence } from './iterator-tools';
import type {
  PluginCatalog,
  PluginExecutionInput,
  PluginExecutionOutput,
  PluginStage,
  TenantId,
  PlanToken,
  RunToken,
} from '@shared/lab-simulation-kernel';

export type PlanId = Brand<string, 'PlanId'>;
export type PlanVersion = Brand<string, 'PlanVersion'>;

export interface PlanStep<TInput = unknown, TOutput = unknown> {
  readonly id: string;
  readonly plugin: string;
  readonly stage: PluginStage;
  readonly input: TInput;
  readonly output?: TOutput;
  readonly startedAt: number;
  readonly latencyMs: number;
}

export type StagePath<TSteps extends readonly string[]> = TSteps extends readonly [
  infer Head extends string,
  ...infer Rest extends readonly string[],
]
  ? `${Head}/${StagePath<Rest>}`
  : 'terminal';

export interface PlanManifest {
  readonly id: PlanId;
  readonly version: PlanVersion;
  readonly lane: 'simulate' | 'verify' | 'restore' | 'recover';
  readonly stages: readonly PluginStage[];
  readonly route: string;
  readonly pluginCount: number;
}

export interface PlanExecution<TInput = unknown> {
  readonly planId: PlanId;
  readonly catalog: PluginCatalog;
  readonly steps: readonly PlanStep<TInput>[];
  readonly trace: readonly string[];
}

export interface PlanRunResult<TInput = unknown, TOutput = unknown> {
  readonly ok: boolean;
  readonly error?: string;
  readonly manifest: PlanManifest;
  readonly input: TInput;
  readonly output?: TOutput;
}

type PlanRunOutput = Readonly<Record<string, unknown>>;

export type BuildPlan<
  TCatalog extends PluginCatalog,
  TInput extends PluginExecutionInput<unknown>,
> = {
  readonly id: PlanId;
  readonly version: PlanVersion;
  readonly catalog: TCatalog;
  readonly stages: readonly PluginStage[];
  readonly execute: (input: NoInfer<TInput>) => Promise<PlanRunResult<TInput, PlanRunOutput>>;
};

interface PlanRunContext<TInput> {
  readonly plan: PlanManifest;
  readonly input: TInput;
  readonly window: readonly number[];
  readonly metrics: ReadonlyMap<string, number>;
}

const planSchema = z.object({
  id: z.string().min(1),
  lane: z.enum(['simulate', 'verify', 'restore', 'recover']),
  stages: z.array(z.enum(defaultStudioStages)),
});

type PlanError = { readonly code: 'parse' | 'invalid' | 'runtime'; readonly message: string };

interface ParsedPlan {
  readonly id: string;
  readonly lane: 'simulate' | 'verify' | 'restore' | 'recover';
  readonly stages: readonly PluginStage[];
}

const normalizePlanInput = (value: unknown): ParsedPlan | PlanError => {
  const parsed = planSchema.safeParse(value);
  if (!parsed.success) {
    return {
      code: 'parse',
      message: parsed.error.issues.map((issue: ZodIssue) => issue.path.join('.')).join('|'),
    };
  }
  return {
    id: parsed.data.id,
    lane: parsed.data.lane,
    stages: parsed.data.stages,
  };
};

export const parsePlanDescriptor = (value: unknown): ParsedPlan | PlanError => normalizePlanInput(value);

export const formatWindow = (values: readonly number[]): string =>
  values.map((value) => value.toFixed(2)).join(',');

export const buildPlanManifest = (
  id: string,
  lane: 'simulate' | 'verify' | 'restore' | 'recover',
  plugins: PluginCatalog,
): PlanManifest => {
  const stages = [...new Set(plugins.map((plugin) => plugin.stage))];
  return {
    id: `plan:${id}` as PlanId,
    version: `v${plugins.length}` as PlanVersion,
    lane,
    stages,
    route: stages.map((stage) => stage).toSorted().join('::'),
    pluginCount: plugins.length,
  };
};

export const buildPlanPayload = <TInput>(
  id: string,
  input: TInput,
): PluginExecutionInput<TInput> => {
  const now = Date.now();
  return {
    tenant: `tenant:${id}` as TenantId,
    planId: `plan:${id}` as PlanToken,
    runId: `run:${id}:${now}` as RunToken,
    stage: 'detect',
    payload: input,
    context: { source: 'plan:builder' },
  };
};

export const stageFlow = (stages: readonly PluginStage[]): FlowSequence<PluginStage> =>
  flow(stages.map((stage) => stage), 'plan-stages');

export const runPlanWindow = async <TInput>(
  input: TInput,
  manifest: PlanManifest,
  pluginPolicies: readonly StudioPolicyDefinition<TInput>[],
): Promise<PlanRunResult<TInput, PlanRunOutput>> => {
  const start = Date.now();
  const steps: PlanStep<TInput, unknown>[] = [];
  const metrics = new Map<string, number>();

  for (const policy of pluginPolicies.toSorted((left, right) => right.policy.weight - left.policy.weight)) {
    const stepStart = Date.now();
    const pluginResult = await policy.run({ request: input });
    const durationMs = Math.max(1, Date.now() - stepStart);
    steps.push({
      id: policy.id,
      plugin: policy.spec.name,
      stage: policy.stage,
      input,
      output: pluginResult.payload,
      startedAt: stepStart,
      latencyMs: durationMs,
    });
    metrics.set(`${policy.id}`, durationMs);
  }

  const context: PlanRunContext<TInput> = {
    plan: manifest,
    input,
    window: [...metrics.values()],
    metrics,
  };
  return {
    ok: steps.length > 0,
    error: steps.length > 0 ? undefined : 'runtime:no-steps',
    manifest,
    input,
    output: {
      ...context,
      route: manifest.route,
      stageCount: context.plan.stages.length,
      pluginKeys: [...metrics.keys()],
    },
  };
};

export const buildPlan = (
  id: string,
  plugins: PluginCatalog,
  lane: 'simulate' | 'verify' | 'restore' | 'recover',
): BuildPlan<PluginCatalog, PluginExecutionInput<Record<string, unknown>>> => {
  const manifest = buildPlanManifest(id, lane, plugins);
  const runPayload = (rawInput: PluginExecutionInput<Record<string, unknown>>): PluginExecutionInput<Record<string, unknown>> => rawInput;

  const policyDefs = flow(plugins)
    .map((plugin): StudioPolicyDefinition<PluginExecutionInput<Record<string, unknown>>> => ({
      spec: plugin.spec,
      id: `${plugin.name}`,
      stage: plugin.stage,
      policy: {
        id: String(plugin.name),
        weight: plugin.spec.weight,
        lane,
      },
      run: async (input): Promise<PluginExecutionOutput<unknown>> => {
        const pluginInput = runPayload(input.request);
        const resolved = await plugin.run(pluginInput);
        return resolved;
      },
    }))
    .toArray();

  const execute = async (
    input: PluginExecutionInput<Record<string, unknown>>,
  ): Promise<PlanRunResult<PluginExecutionInput<Record<string, unknown>>, PlanRunOutput>> => {
    const result = await runPlanWindow(input, manifest, policyDefs);
    return {
      ...result,
      manifest,
      input,
    };
  };

  return {
    id: manifest.id,
    version: manifest.version,
    catalog: plugins,
    stages: manifest.stages,
    execute,
  };
};

export const replayPlan = async <TOutput>(
  manifest: PlanManifest,
  pluginDefs: readonly StudioPolicyDefinition<unknown>[],
): Promise<readonly PluginExecutionOutput<TOutput>[]> => {
  const entries = flow(manifest.stages)
    .map((value, state) => ({ stage: value, index: state.index, route: `${manifest.id}:${value}` }))
    .toSorted((left, right) => left.index - right.index);

  const windows = flow(pluginDefs).zip(entries);
  const outputs: PluginExecutionOutput<TOutput>[] = [];
  for (const [plugin, entry] of windows.toArray()) {
    const output = await plugin.run({
      request: {
        key: `${plugin.id}` as string,
        stage: entry.stage,
        route: entry.route,
      } as { readonly key: string; readonly stage: string; readonly route: string },
    });
    outputs.push({
      plugin: `${plugin.spec.name}`,
      stage: entry.stage as PluginStage,
      durationMs: entry.index * 3,
      payload: output.payload as TOutput,
      warnings: output.warnings,
    });
  }
  return outputs;
};

export type PlanPath<T extends readonly string[]> = StagePath<T>;
export type RouteTemplate = PluginRoute<['plan', 'orchestrate']>;
export type WindowKeyPaths = KeyPaths<{ readonly route: { readonly stages: string[]; readonly signature: string } }>;
