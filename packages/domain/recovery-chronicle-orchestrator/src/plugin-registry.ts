import type { NoInfer } from '@shared/type-level';
import type {
  OrchestratedStepResult,
  OrchestrationPolicy,
  OrchestrationRunContext,
  OrchestrationStage,
  OrchestrationStageDescriptor,
  OrchestrationTrace,
  OrchestrationStageInput,
} from './types';

export interface RegistryLifecycle {
  readonly stageCount: number;
  readonly stageNames: readonly string[];
  readonly stageOrder: readonly OrchestrationStage[];
}

export class OrchestrationPluginRegistry<
  TPlugins extends readonly OrchestrationStageDescriptor[] = readonly OrchestrationStageDescriptor[],
> {
  readonly #plugins: TPlugins;
  readonly #policy: OrchestrationPolicy;
  readonly #trace: OrchestrationTrace;

  public constructor(plugins: NoInfer<TPlugins>, policy: OrchestrationPolicy, trace: OrchestrationTrace) {
    this.#plugins = [...plugins] as unknown as TPlugins;
    this.#policy = policy;
    this.#trace = trace;
  }

  public lifecycle(): RegistryLifecycle {
    return {
      stageCount: this.#plugins.length,
      stageNames: this.#plugins.map((plugin) => `${plugin.stage}:${plugin.id}`),
      stageOrder: this.#trace.stageOrder,
    };
  }

  public get trace(): OrchestrationTrace {
    return this.#trace;
  }

  public get policy(): OrchestrationPolicy {
    return this.#policy;
  }

  public byStage<TStage extends OrchestrationStage>(
    stage: TStage,
  ): readonly Extract<TPlugins[number], { readonly stage: TStage }>[] {
    return [...this.#plugins.filter((plugin) => plugin.stage === stage)] as unknown as readonly Extract<
      TPlugins[number],
      { readonly stage: TStage }
    >[];
  }

  public list(): TPlugins {
    return this.#plugins as unknown as TPlugins;
  }

  public async run<TInput extends Record<string, unknown>>(
    input: NoInfer<TInput>,
    context: OrchestrationRunContext,
  ): Promise<readonly OrchestratedStepResult[]> {
    const outputs: OrchestratedStepResult[] = [];
    for (const plugin of this.#plugins) {
      if (!this.#trace.stageOrder.includes(plugin.stage)) continue;

      const payload = inputForStage(plugin.stage, this.#policy, context.runId);
      const descriptorInput = { ...payload, ...input } as OrchestrationStageInput<typeof plugin.stage>;
      const output = await plugin.execute(descriptorInput);

      outputs.push({
        stage: plugin.stage,
        status: output.status,
        output: output.output as OrchestratedStepResult['output'],
        score: output.trace.startedAt % 100,
        latencyMs: output.latencyMs,
      });
    }

    return outputs;
  }

  public [Symbol.dispose](): void {
    // no-op deterministic cleanup path
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    // no-op async cleanup path
  }
}

const inputForStage = (
  stage: OrchestrationStage,
  policy: OrchestrationPolicy,
  runId: string,
): OrchestrationStageInput => {
  switch (stage) {
    case 'bootstrap':
      return {
        stage: 'bootstrap',
        route: 'orchestrator:///bootstrap',
        payload: {
          source: 'signal',
          tenant: policy.tenant,
          warmupMs: 11,
        },
      };
    case 'policy':
      return {
        stage: 'policy',
        route: 'orchestrator:///policy',
        payload: {
          policyId: policy.id,
          threshold: policy.minConfidence,
          constraints: policy.allowedTiers,
        },
      };
    case 'telemetry':
      return {
        stage: 'telemetry',
        route: 'orchestrator:///telemetry',
        payload: {
          samples: [0.1, 0.2, 0.3],
          includeHistory: true,
        },
      };
    case 'finalize':
      return {
        stage: 'finalize',
        route: 'orchestrator:///finalize',
        payload: {
          finalizedBy: runId,
          reason: `${runId}:${policy.id}`,
        },
      };
  }
};

export const registerPlugins = <TPlugins extends readonly OrchestrationStageDescriptor[]>(plugins: TPlugins): TPlugins =>
  [...plugins] as unknown as TPlugins;

export const sequenceByPriority = <T>(items: readonly T[], score: (item: T) => number): readonly T[] =>
  items.toSorted((left, right) => score(right) - score(left));

export const stageOutputsFromTuple = (outputs: readonly OrchestratedStepResult[]): readonly string[] =>
  outputs.map((entry) => `${entry.stage}:${entry.status}`);
