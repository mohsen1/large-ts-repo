import { withBrand } from '@shared/core';
import {
  PluginRegistry,
  type OrchestrationPlugin,
  type PluginInvocationOptions,
  type PluginPhase,
  type WorkflowPhase,
  buildNodeLabel,
} from '@shared/orchestration-kernel';
import type { Brand, NoInfer } from '@shared/type-level';
import type { PluginId } from '@shared/orchestration-kernel';
import type { DesignPlan, DesignPlanId, DesignStage, DesignTenantId, DesignWorkspaceId, WorkspaceTag } from './contracts';

export type PluginWeight = Brand<string, 'PluginWeight'>;
export type PluginNamespace = `ns:${'design' | 'simulation' | 'control' | 'telemetry'}`;
export type DesignPluginPhase = PluginPhase;
export type StageTag<TStage extends DesignStage = DesignStage> = `stage:${TStage}`;

export interface DesignPluginInput {
  readonly planId: DesignPlanId;
  readonly tenantId: DesignTenantId;
  readonly workspaceId: DesignWorkspaceId;
  readonly stage: DesignStage;
  readonly now: string;
}

export interface DesignPluginContext {
  readonly runId: DesignPlanId;
  readonly pluginId?: PluginId;
  readonly startedAt: string;
  readonly plan: DesignPlan;
  readonly requestId: string;
}

export interface DesignPluginOutput {
  readonly runId: DesignPlanId;
  readonly changedNodes: readonly string[];
  readonly tags: readonly WorkspaceTag[];
  readonly signals: readonly string[];
  readonly diagnostics: readonly string[];
}

export type DesignPlugin<
  TNamespace extends PluginNamespace = PluginNamespace,
  TInput extends DesignPluginInput = DesignPluginInput,
  TOutput extends DesignPluginOutput = DesignPluginOutput,
  TTag extends string = string,
  TPhase extends DesignPluginPhase = DesignPluginPhase,
> = OrchestrationPlugin<TNamespace, TInput, TOutput, TTag> & {
  readonly namespace: TNamespace;
  readonly phase: TPhase;
  readonly weight: PluginWeight;
  readonly tags: readonly TTag[];
};

export interface PluginExecutionResult {
  readonly pluginCount: number;
  readonly outputs: Readonly<Record<string, DesignPluginOutput>>;
}

export interface PluginHubSummary {
  readonly namespace: string;
  readonly pluginCount: number;
  readonly tags: readonly string[];
  readonly phases: readonly string[];
}

type PhaseNodeMap = Record<DesignStage, readonly string[]>;

export const phaseByStage = (stage: DesignStage): DesignPluginPhase =>
  stage === 'intake'
    ? 'init'
    : stage === 'design'
      ? 'plan'
      : stage === 'validate'
        ? 'observe'
        : stage === 'execute'
          ? 'execute'
          : stage === 'safety-check'
            ? 'finalize'
            : 'finalize';

export const stageByPhase = (phase: DesignPluginPhase): DesignStage =>
  phase === 'init'
    ? 'intake'
    : phase === 'plan'
      ? 'design'
      : phase === 'observe'
        ? 'validate'
        : phase === 'execute'
          ? 'execute'
          : 'review';

const normalizeStageOutputs = (
  result: unknown,
  runId: DesignPlanId,
): DesignPluginOutput => {
  const raw = result as {
    runId?: DesignPlanId;
    changedNodes?: readonly string[];
    tags?: readonly string[];
    signals?: readonly string[];
    diagnostics?: readonly string[];
  };
  return {
    runId: raw.runId ?? runId,
    changedNodes: [...(raw.changedNodes ?? [])],
    tags: [...(raw.tags ?? [])] as readonly WorkspaceTag[],
    signals: [...(raw.signals ?? [])],
    diagnostics: [...(raw.diagnostics ?? [])],
  };
};

const pluginWeightValue = (weight: PluginWeight): number => Number(weight);

export class DesignPluginHub {
  readonly #registry: PluginRegistry<readonly OrchestrationPlugin[]>;

  private constructor(registry: PluginRegistry<readonly OrchestrationPlugin[]>) {
    this.#registry = registry;
  }

  static empty(): DesignPluginHub {
    return new DesignPluginHub(PluginRegistry.empty() as PluginRegistry<readonly OrchestrationPlugin[]>);
  }

  static from(plugins: readonly DesignPlugin[]): DesignPluginHub {
    let hub = DesignPluginHub.empty();
    for (const plugin of plugins) {
      hub = hub.with(plugin);
    }
    return hub;
  }

  with<TPlugin extends DesignPlugin>(plugin: NoInfer<TPlugin>): DesignPluginHub {
    const registry = this.#registry.with(plugin as unknown as OrchestrationPlugin);
    return new DesignPluginHub(registry as unknown as PluginRegistry<readonly OrchestrationPlugin[]>);
  }

  listIds(): readonly PluginId[] {
    return this.#registry.asPayload().map((plugin) => plugin.id) as readonly PluginId[];
  }

  filter(namespace: PluginNamespace, phase?: DesignPluginPhase): DesignPluginHub {
    const filtered = this.#registry
      .find((plugin) => plugin.namespace === namespace && (!phase || plugin.phase === phase))
      .toSorted((left, right) => String(left.id).localeCompare(String(right.id)));
    return new DesignPluginHub(new PluginRegistry(filtered as readonly OrchestrationPlugin[]));
  }

  summarize(): PluginHubSummary {
    const payload = this.#registry.asPayload();
    const tags = [...new Set(payload.flatMap((plugin) => [...plugin.tags] as readonly string[]))];
    const stageMap = payload.reduce<PhaseNodeMap>(
      (acc, plugin) => {
        const next = { ...acc };
        const stage = stageByPhase(plugin.phase);
        next[stage] = [...next[stage], plugin.id as string];
        return next;
      },
      { intake: [], design: [], validate: [], execute: [], 'safety-check': [], review: [] },
    );
    return {
      namespace: payload.map((plugin) => plugin.namespace).join(',') || 'none',
      pluginCount: payload.length,
      tags,
      phases: Object.keys(stageMap).filter((stage) => stageMap[stage as DesignStage].length > 0) as readonly string[],
    };
  }

  async runByPhase<TPhase extends DesignPluginPhase>(
    phase: NoInfer<TPhase>,
    input: DesignPluginInput,
    context: DesignPluginContext,
  ): Promise<Record<string, DesignPluginOutput>> {
    const plugins = this.#registry.find((plugin) => plugin.phase === phase);
    const results = await Promise.all(
      plugins.map((plugin) =>
        this.#registry.run(
          plugin.id as PluginId,
          { ...input, stage: stageByPhase(phase), now: context.startedAt },
          {} satisfies PluginInvocationOptions,
        ) as Promise<unknown>,
      ),
    );
    const merged = Object.fromEntries(
      plugins.map((plugin, index) => [
        `${plugin.id}`,
        normalizeStageOutputs(results[index] as unknown, input.planId),
      ]),
    );
    return merged as Record<string, DesignPluginOutput>;
  }

  async runByStage<TStage extends DesignStage>(
    stage: NoInfer<TStage>,
    input: DesignPluginInput,
    context: DesignPluginContext,
  ): Promise<PluginExecutionResult> {
    const selectedPhase = phaseByStage(stage);
    const plugins = this.#registry.find((plugin) => plugin.phase === selectedPhase);
    const results = await Promise.all(
      plugins.map((plugin) =>
        this.#registry.run(
          plugin.id as PluginId,
          { ...input, stage, now: context.startedAt },
          {} satisfies PluginInvocationOptions,
        ) as Promise<unknown>,
      ),
    );

    const outputs = Object.fromEntries(
      plugins.map((plugin, index) => [
        `${plugin.id}`,
        normalizeStageOutputs(results[index] as unknown, input.planId),
      ]),
    ) as Readonly<Record<string, DesignPluginOutput>>;

    return {
      pluginCount: Object.keys(outputs).length,
      outputs,
    };
  }

  asPayload(): readonly OrchestrationPlugin[] {
    return this.#registry.asPayload();
  }

  label(): string {
    const summary = this.summarize();
    const [mappedPhase] = summary.phases as readonly DesignStage[];
    const phase: WorkflowPhase =
      mappedPhase === 'intake'
        ? 'collect'
        : mappedPhase === 'design'
          ? 'plan'
          : mappedPhase === 'validate'
            ? 'verify'
            : mappedPhase === 'safety-check'
              ? 'close'
              : 'execute';
    return buildNodeLabel('input', phase);
  }

  listByNamespace<TNamespace extends PluginNamespace>(namespace: TNamespace): readonly DesignPlugin[] {
    return this.#registry.find((plugin) => plugin.namespace === namespace) as readonly DesignPlugin[];
  }

  summarizeByNamespace(): readonly PluginHubSummary[] {
    const payload = this.#registry.asPayload();
    const byNamespace = new Map<string, PluginHubSummary>();
    for (const plugin of payload) {
      const namespace = String(plugin.namespace);
      const prior = byNamespace.get(namespace);
      const previousTags = prior?.tags ?? [];
      byNamespace.set(namespace, {
        namespace,
        pluginCount: (prior?.pluginCount ?? 0) + 1,
        tags: [...new Set([...previousTags, ...plugin.tags])],
        phases: [...new Set([...(prior?.phases ?? []), plugin.phase])],
      });
    }
    return [...byNamespace.values()];
  }
}

export const composePluginHub = (plugins: readonly DesignPlugin[]): DesignPluginHub =>
  DesignPluginHub.from([...plugins]);

const ensurePositiveWeight = (value: number): number =>
  Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;

export const pluginWeight = (value: number): PluginWeight =>
  withBrand(`${ensurePositiveWeight(value)}`, 'PluginWeight') as PluginWeight;

export const pluginNamespace = <TStage extends DesignStage>(value: TStage): StageTag<TStage> =>
  `stage:${value}`;

export const pluginSignature = (plugin: { readonly namespace: PluginNamespace; readonly phase: DesignPluginPhase }): string =>
  `${plugin.namespace}:${plugin.phase}`;

export const registerPluginByWeight = (plugins: readonly DesignPlugin[]): readonly DesignPlugin[] =>
  [...plugins].toSorted((left, right) => pluginWeightValue(right.weight) - pluginWeightValue(left.weight));
