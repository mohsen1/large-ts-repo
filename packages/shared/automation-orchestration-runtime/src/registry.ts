import type { NoInfer } from '@shared/typed-orchestration-core';
import type {
  OrchestrationMetadata,
  OrchestrationRunId,
  OrchestrationTenant,
  StageContext,
  StageDefinition,
  StageExecution,
  StageFailure,
  StageName,
  StageRunInput,
} from './contract';
import { buildGraphFromDefinitions, withTopology } from './graph';
import { toFailure as failureEnvelope } from './contract';

export interface PluginDefinition<TName extends string = string, TInput = unknown, TOutput = unknown>
  extends StageDefinition<TName, TInput, TOutput> {
  readonly kind: 'plugin';
  readonly metadata?: OrchestrationMetadata;
  readonly execute?: (input: StageRunInput<TInput>, context: StageContext) => Promise<StageExecution<TInput, TOutput>>;
}

export interface PluginExecutionContext {
  readonly runId: OrchestrationRunId;
  readonly namespace: string;
  readonly stage: StageName;
}

type PluginName<TDefs extends readonly PluginDefinition[]> = TDefs[number]['name'];
export type PluginMap<TDefs extends readonly PluginDefinition[]> = {
  [TName in PluginName<TDefs>]: Extract<TDefs[number], { readonly name: TName }>;
};

export type PluginResultMap<TDefs extends readonly PluginDefinition[]> = {
  [TName in PluginName<TDefs>]: Extract<TDefs[number], { readonly name: TName }> extends StageDefinition<
    TName & string,
    any,
    infer TOutput
  >
    ? TOutput
    : never;
};

export type PluginInputMap<TDefs extends readonly PluginDefinition[]> = {
  [TName in PluginName<TDefs>]: Extract<TDefs[number], { readonly name: TName }> extends StageDefinition<
    TName & string,
    infer TInput,
    any
  >
    ? TInput
    : never;
};

export interface RegistryOptions {
  readonly namespace: string;
}

const toTenant = (source: string): OrchestrationTenant => `tenant:${source}` as OrchestrationTenant;
const toScope = (namespace: string): `scope:${string}` => `scope:${namespace}`;
const toNamespace = (namespace: string): `namespace:${string}` => `namespace:${namespace}`;

export class PluginRegistry<TDefinitions extends readonly PluginDefinition[]> {
  readonly #definitions: Map<string, PluginDefinition>;
  readonly #ordered: readonly PluginDefinition[];

  public constructor(definitions: TDefinitions) {
    this.#ordered = definitions;
    this.#definitions = new Map(definitions.map((definition) => [definition.name, definition]));
  }

  public names(): readonly PluginName<TDefinitions>[] {
    return this.#ordered.map((definition) => definition.name) as PluginName<TDefinitions>[];
  }

  public has(name: string): boolean {
    return this.#definitions.has(name);
  }

  public get<TName extends PluginName<TDefinitions>>(name: TName): PluginMap<TDefinitions>[TName] | undefined {
    return this.#definitions.get(name) as PluginMap<TDefinitions>[TName] | undefined;
  }

  public async run<TName extends PluginName<TDefinitions>, TInput = PluginInputMap<TDefinitions>[TName]>(
    name: TName,
    input: NoInfer<TInput>,
    context: PluginExecutionContext,
    metadata?: OrchestrationMetadata,
  ): Promise<PluginResultMap<TDefinitions>[TName] | undefined> {
    const definition = this.get(name);
    if (!definition) {
      throw failureEnvelope('missing_plugin', `Plugin ${name} is not registered`);
    }

    await using scope = new AsyncDisposableStack();
    const runContext: StageContext = {
      tenant: toTenant(metadata?.source ?? 'global'),
      namespace: definition.namespace,
      scope: toScope(context.namespace),
      runId: context.runId,
      metadata: {
        source: metadata?.source ?? definition.kind,
        createdAt: metadata?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        traceParent: metadata?.traceParent,
      },
      tags: definition.tags,
    };
    scope.defer(() => {
      void runContext;
    });

    const request: StageRunInput<TInput> = {
      stageName: definition.name,
      payload: input,
      context: runContext,
    };
    const result = definition.execute
      ? await definition.execute(request, runContext)
      : await definition.run(request, runContext);
    if (result.status === 'error') {
      return undefined;
    }

    return result.output as PluginResultMap<TDefinitions>[TName];
  }

  public async runAll<TContext>(
    order: readonly StageName[],
    initialInput: TContext,
    context: PluginExecutionContext,
    metadata?: OrchestrationMetadata,
  ): Promise<readonly StageExecution<TContext, unknown>[]> {
    const graph = buildGraphFromDefinitions(this.#ordered, {
      tenant: context.namespace,
      namespace: context.namespace,
      revision: 'v1.0',
    });
    const executionOrder = order.length > 0 ? order : graph.graph.sorted();
    withTopology(graph.graph, executionOrder);

    await using scope = new AsyncDisposableStack();
    const output: StageExecution<TContext, unknown>[] = [];
    let cursor = initialInput as Readonly<unknown>;
    const byName = new Map(this.#ordered.map((entry) => [entry.name, entry]));

    for (const stageName of executionOrder) {
      const definition = byName.get(stageName);
      if (!definition) {
        throw failureEnvelope('missing_definition', `Missing stage ${stageName}`);
      }

      const runContext: StageContext = {
        tenant: toTenant(context.namespace),
        namespace: toNamespace(context.namespace),
        scope: toScope(context.namespace),
        runId: context.runId,
        metadata: {
          source: metadata?.source ?? definition.kind,
          createdAt: metadata?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          traceParent: metadata?.traceParent,
        },
        tags: definition.tags,
      };
      const request: StageRunInput<unknown> = {
        stageName,
        payload: cursor as unknown as Readonly<unknown>,
        context: runContext,
      };
      const result = definition.execute
        ? await definition.execute(request, runContext)
        : await definition.run(request, runContext);

      if (result.status === 'error') {
        const failed = result as StageFailure<unknown>;
        throw new Error(failed.error.message);
      }

      cursor = result.output as Readonly<unknown>;
      output.push(result as StageExecution<TContext, unknown>);
      scope.defer(() => {
        void result;
      });
    }

    return output;
  }

  public asDictionary(): PluginMap<TDefinitions> {
    return Object.fromEntries(this.#ordered.map((definition) => [definition.name, definition])) as PluginMap<TDefinitions>;
  }
}

export type OrderedPlugins<TDefinitions extends readonly PluginDefinition[]> = ReturnType<
  PluginRegistry<TDefinitions>['names']
>;
export type StageDependencyMatrix = ReturnType<typeof buildGraphFromDefinitions>;
