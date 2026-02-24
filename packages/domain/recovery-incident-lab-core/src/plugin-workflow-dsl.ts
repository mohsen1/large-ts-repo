import {
  PluginDependency,
  PluginExecutionState,
  PluginManifest,
  PluginKind,
  PluginRoute,
  PluginStage,
} from './plugin-contracts';
import { PluginTopologySpec, buildTopologySpec, walkTopology } from './plugin-topology';

export const workflowTags = ['preflight', 'plan', 'act', 'observe', 'postflight'] as const;
export const workflowModes = ['adaptive', 'strict', 'manual', 'simulated'] as const;
export type WorkflowMode = (typeof workflowModes)[number];
export type WorkflowTag = (typeof workflowTags)[number];

type Append<T extends readonly unknown[], U> = readonly [...T, U];
type StepTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? readonly [Head, ...StepTuple<Tail>]
  : readonly [];

type Deduplicate<T extends readonly string[]> = T extends readonly [infer Head extends string, ...infer Tail extends readonly string[]]
  ? Head extends Tail[number]
    ? Deduplicate<Tail>
    : readonly [Head, ...Deduplicate<Tail>]
  : readonly [];

export interface WorkflowStepMetadata {
  readonly tag: string;
  readonly stage: PluginStage;
  readonly state: PluginExecutionState;
}

export interface WorkflowStep<
  TKind extends PluginKind = PluginKind,
  TInput = unknown,
  TOutput = unknown,
> {
  readonly kind: TKind;
  readonly mode: WorkflowMode;
  readonly manifest: PluginManifest<TKind>;
  readonly metadata: WorkflowStepMetadata;
  readonly input: TInput;
  readonly output: TOutput;
}

export type WorkflowOutput<TKind extends PluginKind, TInput = unknown> = (
  input: TInput,
  context: PluginRoute,
) => Promise<{
  readonly manifest: PluginManifest<TKind>;
  readonly tags: Deduplicate<string[]>;
  readonly dependencies: readonly PluginDependency[];
}>;

export interface WorkflowBlueprint<TSteps extends readonly WorkflowStep[] = readonly WorkflowStep[]> {
  readonly id: string;
  readonly tags: readonly string[];
  readonly modes: readonly WorkflowMode[];
  readonly steps: TSteps;
}

export type StepUnion<T extends readonly WorkflowStep[]> = T[number];

export type StepPayload<T extends WorkflowBlueprint> = {
  [K in keyof T['steps'] as K extends `${number}` ? `step:${K}` : never]: T['steps'][K] extends WorkflowStep<
    infer _K,
    infer _Input,
    infer _Output
  >
    ? PluginExecutionState
    : never;
};

export interface WorkflowContext<TInput = unknown, TOutput = unknown> {
  readonly input: TInput;
  readonly output: TOutput;
  readonly index: number;
  readonly timeline: readonly string[];
}

export class WorkflowBuilder<TSteps extends readonly WorkflowStep[]> {
  readonly #id: string;
  readonly #steps: TSteps;
  readonly #tags: readonly string[];
  readonly #modes: readonly WorkflowMode[];

  private constructor(
    id: string,
    steps: TSteps,
    tags: readonly string[] = [],
    modes: readonly WorkflowMode[] = ['adaptive'],
  ) {
    this.#id = id;
    this.#steps = steps;
    this.#tags = tags;
    this.#modes = modes;
  }

  static seed(id: string): WorkflowBuilder<readonly []> {
    return new WorkflowBuilder(id, []);
  }

  withMode(mode: WorkflowMode): WorkflowBuilder<TSteps> {
    return new WorkflowBuilder(this.#id, this.#steps, this.#tags, [...this.#modes, mode]);
  }

  withTag(tag: string): WorkflowBuilder<TSteps> {
    return new WorkflowBuilder(this.#id, this.#steps, [...this.#tags, tag], this.#modes);
  }

  withStep<TKind extends PluginKind, TInput, TOutput>(input: {
    readonly kind: TKind;
    readonly manifest: PluginManifest<TKind>;
    readonly mode: WorkflowMode;
    readonly dependencies: readonly PluginDependency[];
    readonly metadata: Omit<WorkflowStepMetadata, 'tag'> & {
      readonly tag: WorkflowTag;
    };
    readonly transform: WorkflowOutput<TKind, TInput>;
  }): WorkflowBuilder<Append<TSteps, WorkflowStep<TKind, TInput, TOutput>>> {
    const state = input.metadata.state;
    const normalizedMode = input.mode === 'simulated' ? 'adaptive' : input.mode;
    const step: WorkflowStep<TKind, TInput, TOutput> = {
      kind: input.kind,
      mode: normalizedMode,
      manifest: input.manifest,
      metadata: {
        ...input.metadata,
        stage: input.metadata.stage,
      },
      input: {} as TInput,
      output: {} as TOutput,
    };

    void [state, input.dependencies, input.transform];
    return new WorkflowBuilder(
      this.#id,
      [...this.#steps, step] as Append<TSteps, WorkflowStep<TKind, TInput, TOutput>>,
      this.#tags,
      this.#modes,
    );
  }

  withSteps<TNext extends readonly WorkflowStep[]>(
    ...steps: TNext
  ): WorkflowBuilder<[...TSteps, ...TNext]> {
    return new WorkflowBuilder(this.#id, [...this.#steps, ...steps] as [...TSteps, ...TNext]);
  }

  get id(): string {
    return this.#id;
  }

  get tags(): readonly string[] {
    return [...this.#tags];
  }

  get modes(): readonly WorkflowMode[] {
    return [...this.#modes];
  }

  get steps(): TSteps {
    return this.#steps;
  }

  build(): WorkflowBlueprint<TSteps> {
    return {
      id: this.#id,
      tags: this.#tags,
      modes: this.#modes,
      steps: this.#steps,
    };
  }

  compileManifestCatalog(): PluginTopologySpec {
    const manifests = this.#steps.map((step) => step.manifest);
    return buildTopologySpec(this.#id, manifests);
  }

  execute<Input, Output>(input: Input): {
    readonly input: Input;
    readonly output: WorkflowContext<Input, StepPayload<WorkflowBlueprint<TSteps>>>;
  } {
    const routeTimeline = walkTopology(this.compileManifestCatalog()).map((entry) => `${entry.manifest.route}`);
    const manifestSteps = this.#steps.map((step, index) => ({
      ...step,
      metadata: {
        ...step.metadata,
        tag: `${step.kind}:${index}`,
      },
    }));

    return {
      input,
      output: {
        input,
        output: Object.fromEntries(
          manifestSteps.map((entry, index) => [
            `step:${index}`,
            entry.metadata.state,
          ]),
        ) as StepPayload<WorkflowBlueprint<TSteps>>,
        index: manifestSteps.length,
        timeline: routeTimeline,
      },
    };
  }
}

const defaultModes = ['adaptive', 'manual'] as const satisfies readonly WorkflowMode[];
const defaultTags = ['preflight', 'plan', 'act'] as const satisfies readonly WorkflowTag[];

export const createStarterWorkflow = <T extends string>(seed: T): WorkflowBuilder<readonly []> =>
  WorkflowBuilder.seed(`${seed}:${defaultTags[0]}`)
    .withTag(defaultTags[0])
    .withMode(defaultModes[0]);
