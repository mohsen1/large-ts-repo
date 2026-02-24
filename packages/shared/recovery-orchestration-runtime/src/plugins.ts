import { Brand, NoInfer, RecursivePath } from '@shared/type-level';
import { buildPluginId, ConductorNamespace, ConductorPluginId, ConductorRunId } from './ids';

export type ConductorPluginPhase = 'discover' | 'assess' | 'simulate' | 'actuate' | 'verify' | 'finalize';

export type ConductorPluginKind = Brand<string, 'ConductorPluginKind'>;
export type ConductorPluginTag = Brand<string, 'ConductorPluginTag'>;

export interface ConductorPluginContext<TConfig = Record<string, unknown>> {
  readonly namespace: ConductorNamespace;
  readonly runId: ConductorRunId;
  readonly phase: ConductorPluginPhase;
  readonly tenantId: string;
  readonly startedAt: string;
  readonly config: Readonly<TConfig>;
}

export type ConductorPluginResult<TValue> = {
  readonly ok: boolean;
  readonly payload?: TValue;
  readonly diagnostics: readonly string[];
};

export type ConductorPluginDefinition<
  TInput = unknown,
  TOutput = unknown,
  TConfig = Record<string, unknown>,
  TPhase extends ConductorPluginPhase = ConductorPluginPhase,
> = {
  readonly id: ConductorPluginId;
  readonly name: string;
  readonly namespace: ConductorNamespace;
  readonly phase: TPhase;
  readonly kind: ConductorPluginKind;
  readonly tags: readonly ConductorPluginTag[];
  readonly dependencies: readonly ConductorPluginId[];
  readonly inputShape: readonly string[];
  readonly outputShape: readonly string[];
  readonly config: Readonly<TConfig>;
  readonly run: (
    context: ConductorPluginContext<Record<string, unknown>>,
    input: unknown,
  ) => Promise<ConductorPluginResult<TOutput>>;
};

export type ConductorPluginInput<TPlugin> = TPlugin extends ConductorPluginDefinition<infer TInput, any, any, any>
  ? TInput
  : never;
export type ConductorPluginOutput<TPlugin> = TPlugin extends ConductorPluginDefinition<any, infer TOutput, any, any>
  ? TOutput
  : never;
export type ConductorPluginKindOf<TPlugin> = TPlugin extends ConductorPluginDefinition<
  any,
  any,
  any,
  infer TKind
>
  ? TKind
  : never;

export type PluginDefinitionsByKind<
  TCatalog extends Record<string, ConductorPluginDefinition>,
  TKind extends ConductorPluginKind,
> = {
  [K in keyof TCatalog as ConductorPluginKindOf<TCatalog[K]> extends TKind ? K : never]: TCatalog[K];
};

export type PluginManifest<TDefs extends readonly ConductorPluginDefinition[]> = {
  [key: string]: ConductorPluginDefinition;
};

export type CompatibleChain<TChain extends readonly ConductorPluginDefinition[]> = TChain extends readonly []
  ? []
  : TChain extends readonly [infer Head extends ConductorPluginDefinition, ...infer Tail extends readonly ConductorPluginDefinition[]]
    ? Head extends ConductorPluginDefinition<infer Input, any, any, any>
      ? Tail extends readonly [infer Next extends ConductorPluginDefinition<Input, any, any, any>, ...readonly ConductorPluginDefinition[]]
        ? [Head, ...CompatibleChain<Tail>]
        : [Head]
      : never
    : never;

export type FinalOutputOf<TChain extends readonly ConductorPluginDefinition[]> = TChain extends readonly [
  ...infer _,
  infer Last extends ConductorPluginDefinition<any, infer TOutput, any, any>,
]
  ? TOutput
  : never;

export interface ConductorRegistrySummary {
  readonly namespace: ConductorNamespace;
  readonly phases: readonly ConductorPluginPhase[];
  readonly plugins: number;
  readonly dependencyCount: number;
}

const defaultKind = 'recovery.orchestrator/plugin' as ConductorPluginKind;

export const inferPhasesInUse = (definitions: readonly ConductorPluginDefinition[]): readonly ConductorPluginPhase[] => {
  const seen = new Set<ConductorPluginPhase>();
  for (const definition of definitions) {
    seen.add(definition.phase);
  }
  const ordered: readonly ConductorPluginPhase[] = [
    'discover',
    'assess',
    'simulate',
    'actuate',
    'verify',
    'finalize',
  ] as const;
  return ordered.filter(
    (phase): phase is ConductorPluginPhase => seen.has(phase),
  );
};

export class ConductorPluginRegistry<TDefs extends readonly ConductorPluginDefinition[]> {
  private readonly definitions: TDefs;
  private readonly byId: Map<ConductorPluginId, ConductorPluginDefinition>;
  private readonly byPhase: Map<ConductorPluginPhase, ConductorPluginDefinition[]>;

  private constructor(definitions: TDefs) {
    this.definitions = definitions;
    this.byId = new Map<ConductorPluginId, ConductorPluginDefinition>();
    this.byPhase = new Map<ConductorPluginPhase, ConductorPluginDefinition[]>();

    for (const definition of definitions) {
      this.byId.set(definition.id, definition);
      const phase = definition.phase;
      const list = this.byPhase.get(phase) ?? [];
      this.byPhase.set(phase, list.concat(definition));
    }
  }

  static create<TDefs extends readonly ConductorPluginDefinition[]>(definitions: TDefs): ConductorPluginRegistry<TDefs> {
    return new ConductorPluginRegistry(definitions);
  }

  get manifest(): PluginManifest<TDefs> {
    const output = {} as PluginManifest<TDefs>;
    for (const definition of this.definitions) {
      output[definition.id] = definition;
    }
    return output;
  }

  get count(): number {
    return this.definitions.length;
  }

  phases(): readonly ConductorPluginPhase[] {
    return inferPhasesInUse(this.definitions);
  }

  plugins(): readonly ConductorPluginDefinition[] {
    return [...this.definitions];
  }

  phaseDefinitions<TPhase extends ConductorPluginPhase>(phase: TPhase): readonly ConductorPluginDefinition[] {
    return [...(this.byPhase.get(phase) ?? [])];
  }

  pluginById(id: ConductorPluginId): ConductorPluginDefinition | undefined {
    return this.byId.get(id);
  }

  dependencies(): readonly ConductorPluginId[] {
    const output: ConductorPluginId[] = [];
    for (const definition of this.definitions) {
      output.push(...definition.dependencies);
    }
    return output;
  }

  sequence(phaseOrder: readonly ConductorPluginPhase[] = this.phases()): readonly ConductorPluginDefinition[] {
    const result: ConductorPluginDefinition[] = [];
    for (const phase of phaseOrder) {
      const ordered = this.byPhase.get(phase) ?? [];
      result.push(...ordered);
    }
    return result;
  }

  summarize(): ConductorRegistrySummary {
    return {
      namespace: this.definitions[0]?.namespace ?? ('default' as ConductorNamespace),
      phases: this.phases(),
      plugins: this.definitions.length,
      dependencyCount: this.dependencies().length,
    };
  }

  hasCycle(): boolean {
    const resolved = new Set<string>();
    const visiting = new Set<string>();

    const visit = (id: string): boolean => {
      if (resolved.has(id)) {
        return false;
      }
      if (visiting.has(id)) {
        return true;
      }
      visiting.add(id);
      const definition = this.pluginById(id as ConductorPluginId);
      if (definition) {
        for (const dependency of definition.dependencies) {
          if (visit(dependency as string)) {
            return true;
          }
        }
      }
      visiting.delete(id);
      resolved.add(id);
      return false;
    };

    for (const plugin of this.definitions) {
      if (visit(plugin.id as string)) {
        return true;
      }
    }
    return false;
  }
}

export const buildPlugin = <
  TPhase extends ConductorPluginPhase,
  TInput,
  TOutput,
  TConfig extends Record<string, unknown>,
>(
  namespace: ConductorNamespace,
  phase: TPhase,
  config: {
    readonly name: string;
    readonly runId: ConductorRunId;
    readonly tags: readonly ConductorPluginTag[];
    readonly dependencies: readonly ConductorPluginId[];
    readonly config: TConfig;
    readonly implementation: (
      context: ConductorPluginContext<TConfig>,
      input: NoInfer<TInput>,
    ) => Promise<ConductorPluginResult<TOutput>>;
  },
): ConductorPluginDefinition<TInput, TOutput, TConfig, TPhase> => {
  const id = buildPluginId(namespace, phase);
  const inputShape = [''] as readonly string[];
  const outputShape = [''] as readonly string[];

  return {
    id,
    name: config.name,
    namespace,
    phase,
    kind: defaultKind,
    tags: config.tags,
    dependencies: [...config.dependencies],
    inputShape,
    outputShape,
    config: config.config,
    run: ((context: ConductorPluginContext<Record<string, unknown>>, input: unknown) =>
      config.implementation(context as ConductorPluginContext<TConfig>, input as TInput)) as ConductorPluginDefinition<
      TInput,
      TOutput,
      TConfig,
      TPhase
    >['run'],
  };
};
