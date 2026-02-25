export type NoInfer<T> = [T][T extends never ? never : 0];

export type PluginTag = `tag:${string}`;
export type PluginNamespace = `namespace:${string}`;
export type PluginKind<T extends string = string> = `kind:${T}`;
export type PluginVersion = `${number}.${number}.${number}`;
export type PluginDependency = `dependency:${string}`;

export interface PluginContext<TState extends Record<string, unknown> = Record<string, unknown>> {
  readonly scopeId: string;
  readonly runId: string;
  readonly startedAt: string;
  readonly state: TState;
  readonly signalCancel: (reason: string) => void;
}

export type PluginResult<TValue> =
  | { readonly ok: true; readonly value: TValue; readonly generatedAt: string }
  | { readonly ok: false; readonly error: string; readonly generatedAt: string };

export interface PluginDefinition<
  TInput,
  TOutput,
  TState extends Record<string, unknown> = Record<string, unknown>,
  TKind extends PluginKind = PluginKind,
  TNamespace extends PluginNamespace = PluginNamespace,
> {
  readonly namespace: TNamespace;
  readonly kind: TKind;
  readonly tags: readonly PluginTag[];
  readonly version: PluginVersion;
  readonly dependencies: readonly PluginDependency[];
  readonly inputSchema: (raw: unknown) => raw is TInput;
  readonly outputSchema: (raw: unknown) => raw is TOutput;
  run(context: PluginContext<TState>, input: NoInfer<TInput>): Promise<PluginResult<TOutput>>;
}

export type PluginMap = Record<string, PluginDefinition<any, any, any, any, any>>;

export type PluginInput<T> = T extends PluginDefinition<infer TInput, any, any, any, any> ? TInput : never;
export type PluginOutput<T> = T extends PluginDefinition<any, infer TOutput, any, any, any> ? TOutput : never;
export type PluginState<T> = T extends PluginDefinition<any, any, infer TState, any, any> ? TState : never;

export type PluginKindOf<TPlugins extends PluginMap, TKind extends PluginKind> = {
  [K in keyof TPlugins]: TPlugins[K] extends PluginDefinition<any, any, any, infer Kind>
    ? Kind extends TKind
      ? TPlugins[K]
      : never
    : never;
};

export const pluginNamespace = <TName extends string>(name: TName): `namespace:${TName}` =>
  `namespace:${name}` as `namespace:${TName}`;

export const pluginVersion = {
  create(major: number, minor: number, patch: number): PluginVersion {
    return `${major}.${minor}.${patch}` as PluginVersion;
  },
  bumpPatch(version: PluginVersion): PluginVersion {
    const [major, minor, patch] = version.split('.').map((value) => Number.parseInt(value, 10));
    return `${major}.${minor}.${patch + 1}` as PluginVersion;
  },
};

export const buildPlugin = <
  TInput,
  TOutput,
  TState extends Record<string, unknown>,
  TKind extends PluginKind,
  TNamespace extends PluginNamespace,
>(
  namespace: TNamespace,
  kind: TKind,
  details: {
    readonly tags: readonly PluginTag[];
    readonly version: PluginVersion;
    readonly dependencies: readonly PluginDependency[];
    readonly inputSchema: (raw: unknown) => raw is TInput;
    readonly outputSchema: (raw: unknown) => raw is TOutput;
    run(context: PluginContext<TState>, input: TInput): Promise<PluginResult<TOutput>>;
  },
): PluginDefinition<TInput, TOutput, TState, TKind, TNamespace> => ({
  namespace,
  kind,
  tags: details.tags,
  version: details.version,
  dependencies: details.dependencies,
  inputSchema: details.inputSchema,
  outputSchema: details.outputSchema,
  run: details.run,
});
