import type { Brand } from './brands';
import { AsyncScopeFence } from './disposables';
import type { NoInfer } from './tuple-utils';

export type Namespace = Brand<string, 'RegistryNamespace'>;
export type StageName = `stage:${string}`;
export type PluginName = `plugin:${string}`;

export type PluginDependency = `dep:${PluginName}`;

export type PluginContext<TInput> = {
  readonly executionId: string;
  readonly namespace: Namespace;
  readonly runIndex: number;
  readonly correlation: Readonly<{ tenant: string; reason: string }>;
  readonly input: NoInfer<TInput>;
};

export type PluginSuccess<TOutput> = {
  readonly status: 'success';
  readonly output: TOutput;
  readonly elapsedMs: number;
  readonly artifacts: readonly string[];
};

export type PluginFailure = {
  readonly status: 'failure';
  readonly reason: string;
  readonly elapsedMs: number;
};

export type PluginOutcome<TOutput> = PluginSuccess<TOutput> | PluginFailure;

export type PluginDefinition<
  TInput = unknown,
  TOutput = unknown,
  TName extends PluginName = PluginName,
  TDependencies extends readonly PluginDependency[] = readonly PluginDependency[],
> = {
  readonly id: string;
  readonly name: TName;
  readonly namespace: Namespace;
  readonly stage: StageName;
  readonly dependsOn: TDependencies;
  readonly run: (input: NoInfer<TInput>, context: PluginContext<TInput>) => Promise<PluginOutcome<TOutput>>;
};

export type RegistryByName<TDefinitions extends readonly PluginDefinition[]> = {
  [K in TDefinitions[number] as K['name']]: K;
};

export type PluginByName<
  TDefinitions extends readonly PluginDefinition[],
  TTarget extends keyof RegistryByName<TDefinitions> & string,
> = RegistryByName<TDefinitions>[TTarget];

export type PluginInput<
  TDefinitions extends readonly PluginDefinition[],
  TTarget extends keyof RegistryByName<TDefinitions> & string,
> = TTarget extends keyof RegistryByName<TDefinitions>
  ? PluginByName<TDefinitions, TTarget> extends PluginDefinition<infer TInput>
    ? TInput
    : never
  : never;

export type PluginOutput<
  TDefinitions extends readonly PluginDefinition[],
  TTarget extends keyof RegistryByName<TDefinitions> & string,
> = TTarget extends keyof RegistryByName<TDefinitions>
  ? PluginByName<TDefinitions, TTarget> extends PluginDefinition<any, infer TOutput>
    ? TOutput
    : never
  : never;

type RegistryRecord = {
  readonly name: PluginName;
  readonly index: number;
};

export class ScopeError extends Error {
  public constructor(message: string, public readonly nameRef: PluginName) {
    super(message);
    this.name = 'ScopeError';
  }
}

export class PluginScope {
  #disposed = false;
  readonly startedAt = new Date().toISOString();
  readonly artifacts: string[] = [];
  readonly logs: string[] = [];

  public constructor(readonly namespace: Namespace, readonly runId: string, private readonly sink: (value: string) => void) {}

  public log(message: string): void {
    if (this.#disposed) {
      return;
    }
    const payload = `[${this.runId}] ${this.namespace}: ${message}`;
    this.logs.push(payload);
    this.sink(payload);
  }

  public mark(value: string): void {
    if (this.#disposed) {
      return;
    }
    this.artifacts.push(value);
  }

  public [Symbol.dispose](): void {
    this.#disposed = true;
  }
}

export class AsyncPluginScope {
  #disposed = false;
  public constructor(
    readonly namespace: Namespace,
    readonly runId: string,
    private readonly sink: (value: string) => void,
  ) {}

  public [Symbol.asyncDispose](): Promise<void> {
    if (this.#disposed) {
      return Promise.resolve();
    }
    this.#disposed = true;
    this.sink(`[${this.runId}] plugin-scope-close ${this.namespace}`);
    return Promise.resolve();
  }
}

const now = (): number => performance.now();

const useScopes = (namespace: Namespace, executionId: string): [PluginScope, AsyncPluginScope] => {
  const syncScope = new PluginScope(namespace, executionId, (message) => {
    if (typeof console === 'object') {
      console.debug(message);
    }
  });
  const asyncScope = new AsyncPluginScope(namespace, executionId, (message) => {
    if (typeof console === 'object') {
      console.debug(message);
    }
  });
  return [syncScope, asyncScope];
};

export class TypedPluginRegistry<TDefinitions extends readonly PluginDefinition[]> {
  readonly #definitions = new Map<PluginName, PluginDefinition>();
  readonly #order: RegistryRecord[] = [];

  public constructor(
    private readonly definitions: TDefinitions,
    private readonly logger: (value: string) => void = () => undefined,
  ) {
    for (const definition of definitions) {
      this.#definitions.set(definition.name, definition);
      this.#order.push({ name: definition.name, index: this.#order.length });
    }
  }

  public names(): readonly PluginName[] {
    return this.#order.map((item) => item.name);
  }

  public get<TName extends keyof RegistryByName<TDefinitions> & string>(name: TName): RegistryByName<TDefinitions>[TName] | undefined {
    return this.#definitions.get(name as PluginName) as RegistryByName<TDefinitions>[TName] | undefined;
  }

  public dependenciesOf<TName extends PluginName>(name: TName): readonly PluginDependency[] {
    return (this.#definitions.get(name)?.dependsOn ?? []) as readonly PluginDependency[];
  }

  public async run<TName extends keyof RegistryByName<TDefinitions> & string>(
    name: TName,
    input: PluginInput<TDefinitions, TName>,
    namespace: Namespace,
  ): Promise<PluginOutcome<PluginOutput<TDefinitions, TName>>> {
    const plugin = this.get(name);
    if (!plugin) {
      throw new ScopeError('plugin-missing', name);
    }

    const executionId = `scope:${String(name)}:${Date.now().toString(36)}`;
    const start = now();
      const [scope, asyncScope] = useScopes(namespace, executionId);
    const context: PluginContext<PluginInput<TDefinitions, TName>> = {
      executionId,
      namespace,
      runIndex: 0,
      correlation: { tenant: namespace, reason: String(name) },
      input,
    };

    using _scope = scope;
    const typedPlugin = plugin as unknown as PluginDefinition<
      PluginInput<TDefinitions, TName>,
      PluginOutput<TDefinitions, TName>,
      TName,
      PluginDependency[]
    >;
    try {
      const result = await typedPlugin.run(input, context);
      const elapsedMs = Math.round(now() - start);
      _scope.log(`run:${String(name)}:${elapsedMs}`);
      if (result.status === 'failure') {
        _scope.mark(`failed:${result.reason}`);
      }
      return { ...result, elapsedMs };
    } finally {
      await asyncScope[Symbol.asyncDispose]();
    }
  }
}

export const buildStageOrder = <TDefinitions extends readonly PluginDefinition[]>(definitions: TDefinitions): readonly PluginName[] => {
  const byName = new Map<PluginName, PluginDefinition>();
  const indegree = new Map<PluginName, number>();
  const outgoing = new Map<PluginName, PluginName[]>();

  for (const def of definitions) {
    byName.set(def.name, def);
    indegree.set(def.name, def.dependsOn.length);
    outgoing.set(def.name, []);
  }

  for (const def of definitions) {
    for (const dependency of def.dependsOn) {
      const normalized = (dependency as string).replace('dep:', '') as PluginName;
      const dependents = outgoing.get(normalized);
      if (dependents) {
        dependents.push(def.name);
      }
    }
  }

  const ready: PluginName[] = [...byName.keys()].filter((name) => (indegree.get(name) ?? 0) === 0);
  const ordered: PluginName[] = [];

  while (ready.length > 0) {
    const current = ready.shift();
    if (!current) {
      break;
    }
    ordered.push(current);
    for (const next of outgoing.get(current) ?? []) {
      const nextDegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextDegree);
      if (nextDegree <= 0) {
        ready.push(next);
      }
    }
  }

  if (ordered.length !== byName.size) {
    throw new ScopeError('plugin-cycle', byName.keys().next().value as PluginName);
  }

  return ordered;
};

export const executeAllByStage = async <TDefinitions extends readonly PluginDefinition[]>({
  definitions,
  namespace,
  inputByName,
  logger,
}: {
  definitions: TDefinitions;
  namespace: Namespace;
  inputByName: Partial<Record<PluginName, unknown>>;
  logger?: (value: string) => void;
}): Promise<Record<string, PluginOutcome<unknown>>> => {
  const ordered = buildStageOrder(definitions);
  const registry = new TypedPluginRegistry(definitions, logger);
  const outputs: Record<string, PluginOutcome<unknown>> = {};

  for (const name of ordered) {
    const definition = registry.get(name);
    if (!definition) {
      continue;
    }
    const input = inputByName[name] as never;
    const output = await registry.run(name, input as never, namespace);
    outputs[name] = output as PluginOutcome<unknown>;
  }

  return outputs;
};

export const runWithAsyncFence = async <TResult>(
  namespace: Namespace,
  executionId: string,
  callback: () => Promise<TResult>,
): Promise<TResult> => {
  const fence = new AsyncScopeFence({ namespace, tags: ['registry'] }, () => {});
  try {
    return await callback();
  } finally {
    await fence.close('typed-plugin-registry');
  }
};
