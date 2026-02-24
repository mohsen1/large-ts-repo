import type { NoInfer } from '@shared/type-level';
import type {
  MeshExecutionPhase,
  MeshIntent,
  MeshNodeId,
  MeshPlan,
  MeshScopeLabel,
  MeshSpan,
  MeshStageId,
} from './types';

export interface MeshPluginContext {
  readonly runId: string;
  readonly stageId: string;
  readonly tenant: string;
  readonly trace: readonly string[];
  readonly scope: MeshScopeLabel;
  readonly span: MeshSpan;
}

export interface MeshPluginManifest<
  TName extends string = string,
  TCategory extends string = string,
> {
  readonly name: `mesh-plugin:${TName}`;
  readonly category: TCategory;
  readonly version: `${number}.${number}.${number}`;
  readonly phases: readonly MeshExecutionPhase[];
  readonly optionalStages?: readonly MeshStageId[];
  readonly enabledByDefault: boolean;
  readonly supportsStreaming: boolean;
  readonly description: string;
}

export interface MeshPluginDefinition<
  TName extends string = string,
  TInput = unknown,
  TConfig = unknown,
  TOutput = unknown,
  TContext extends MeshPluginContext = MeshPluginContext,
  TCategory extends string = string,
  TPhase extends MeshExecutionPhase = MeshExecutionPhase,
> {
  readonly manifest: MeshPluginManifest<TName, TCategory>;
  readonly phase: TPhase;
  configure(input: TInput, context: TContext): Promise<NoInfer<TConfig>>;
  execute(input: NoInfer<TConfig>, context: TContext): Promise<{
    readonly output: NoInfer<TOutput>;
    readonly nodeIds: readonly MeshNodeId[];
    readonly nextPhase?: TPhase;
  }>;
  readonly supports?: readonly TPhase[];
}

export type PluginInputFor<TPlugin extends MeshPluginDefinition> = TPlugin extends MeshPluginDefinition<
  string,
  infer TInput,
  never,
  never,
  never,
  never,
  never
>
  ? TInput
  : never;

export type PluginConfigFor<TPlugin extends MeshPluginDefinition> = TPlugin extends MeshPluginDefinition<
  string,
  never,
  infer TConfig,
  never,
  never,
  never,
  never
>
  ? TConfig
  : never;

export type PluginOutputFor<TPlugin extends MeshPluginDefinition> = TPlugin extends MeshPluginDefinition<
  string,
  never,
  never,
  infer TOutput,
  never,
  never,
  never
>
  ? TOutput
  : never;

export type PluginNames<TPlugins extends readonly MeshPluginDefinition[]> = TPlugins[number]['manifest']['name'];

export type PluginOfName<TPlugins extends readonly MeshPluginDefinition[], TName extends PluginNames<TPlugins>> = Extract<
  TPlugins[number],
  { manifest: { readonly name: TName } }
>;

export type PluginConfigByName<
  TPlugins extends readonly MeshPluginDefinition[],
  TName extends PluginNames<TPlugins>,
> = PluginConfigFor<PluginOfName<TPlugins, TName>>;

export type PluginOutputByName<
  TPlugins extends readonly MeshPluginDefinition[],
  TName extends PluginNames<TPlugins>,
> = PluginOutputFor<PluginOfName<TPlugins, TName>>;

export type PluginInputByName<
  TPlugins extends readonly MeshPluginDefinition[],
  TName extends PluginNames<TPlugins>,
> = PluginInputFor<PluginOfName<TPlugins, TName>>;

export type PluginNameTuple<TPlugins extends readonly MeshPluginDefinition[]> = readonly PluginNames<TPlugins>[];

export type PluginByCategory<TPlugins extends readonly MeshPluginDefinition[], TCategory extends string> = Extract<
  TPlugins[number],
  { manifest: { category: TCategory } }
>;

export type StageMappedPlugins<TPlugins extends readonly MeshPluginDefinition[]> = {
  [K in MeshExecutionPhase]: readonly PluginByCategory<TPlugins, string & {}>[];
};

export type PluginChain<TPlugins extends readonly MeshPluginDefinition[]> =
  TPlugins extends readonly [infer Head extends MeshPluginDefinition, ...infer Tail extends MeshPluginDefinition[]]
    ? readonly [
        Head,
        ...PluginChain<Tail>
      ]
    : readonly [];

export type PluginChainInput<TPlugins extends readonly MeshPluginDefinition[]> = TPlugins extends readonly [
  infer Head extends MeshPluginDefinition,
  ...infer Rest extends MeshPluginDefinition[],
]
  ? readonly [
      {
        plugin: Head['manifest']['name'];
        input: NoInfer<PluginInputFor<Head>>;
      },
      ...PluginChainInput<Rest>,
    ]
  : readonly [];

export type PluginExecutionMap<TPlugins extends readonly MeshPluginDefinition[]> = {
  [K in PluginNames<TPlugins>]: {
    readonly input: PluginInputFor<PluginOfName<TPlugins, K>>;
    readonly output: PluginOutputFor<PluginOfName<TPlugins, K>>;
    readonly config: PluginConfigFor<PluginOfName<TPlugins, K>>;
  };
};

export const pluginDefinitionGuard = (value: unknown): value is MeshPluginDefinition => {
  return typeof value === 'object' && value !== null && 'manifest' in value && 'configure' in value && 'execute' in value;
};

const defaultPhaseWeights = {
  detect: 1,
  assess: 2,
  orchestrate: 3,
  simulate: 4,
  execute: 5,
  observe: 6,
  recover: 7,
  settle: 8,
} as const satisfies Record<MeshExecutionPhase, number>;

export const orderedPhases = () => Object.entries(defaultPhaseWeights).sort((left, right) => left[1] - right[1]).map((entry) => entry[0]) as MeshExecutionPhase[];

export const validatePluginManifest = (manifest: MeshPluginManifest): boolean => {
  return manifest.phases.every((phase) => phase in defaultPhaseWeights);
};

export const pluginSupportsPhase = (plugin: MeshPluginDefinition, phase: MeshExecutionPhase): boolean =>
  plugin.phase === phase || plugin.supports?.includes(phase) === true;

export const pluginIdentity = <TPlugin extends MeshPluginDefinition>(plugin: TPlugin): `${TPlugin['manifest']['name']}` =>
  plugin.manifest.name as `${TPlugin['manifest']['name']}`;

export const pluginLabels = <
  TPlugins extends readonly MeshPluginDefinition[],
  TLabel extends keyof MeshPluginDefinition = 'manifest',
>(
  plugins: TPlugins,
  label: TLabel,
): readonly MeshPluginDefinition[typeof label][] =>
  plugins.map((plugin) => plugin[label]) as readonly MeshPluginDefinition[typeof label][];

export const pluginExecutionTrace = (
  intent: MeshIntent,
  plugin: MeshPluginDefinition,
): readonly string[] => [
  `intent:${intent.id as string}`,
  `plugin:${plugin.manifest.name}`,
  `phase:${plugin.phase}`,
];

export const buildExecutionMap = <TPlugins extends readonly MeshPluginDefinition[]>(
  plugins: TPlugins,
): PluginExecutionMap<TPlugins> => {
  const map = {} as PluginExecutionMap<TPlugins>;
  for (const plugin of plugins) {
    map[plugin.manifest.name as PluginNames<TPlugins>] = {
      input: undefined as unknown as PluginInputFor<typeof plugin>,
      output: undefined as unknown as PluginOutputFor<typeof plugin>,
      config: undefined as unknown as PluginConfigFor<typeof plugin>,
    };
  }
  return map;
};
