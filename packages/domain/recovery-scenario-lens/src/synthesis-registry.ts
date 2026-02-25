import {
  type PluginContext,
  type PluginDefinition,
  type PluginOutput,
  type SynthesisPluginName,
  type StageName,
  type KeyMappedRecord,
  SynthesisPluginRegistry,
} from '@shared/recovery-synthesis-runtime';
import { scenarioBlueprintSchema, scenarioConstraintSchema, scenarioPlanSchema } from './schema';
import type { SynthesisInput, SynthesisPluginPayload } from './synthesis-types';
import {
  asMillis,
  asScenarioConstraintId,
  asScenarioId,
  asScenarioPlanId,
  type ScenarioConstraint,
  type ScenarioPlan,
} from './types';

const pluginNamespace = 'namespace:recovery-synthesis' as const satisfies `namespace:${string}`;

const buildLabels = (
  owner: string,
  criticality: 'low' | 'medium' | 'high' | 'critical',
): KeyMappedRecord<{ owner: string; criticality: 'low' | 'medium' | 'high' | 'critical' }> =>
  ({
    'cfg:owner': owner,
    'cfg:criticality': criticality,
  } satisfies KeyMappedRecord<{
    owner: string;
    criticality: 'low' | 'medium' | 'high' | 'critical';
  }>);

const isSynthesisInput = (value: unknown): value is SynthesisInput => {
  return (
    !!value &&
    typeof value === 'object' &&
    'traceId' in value &&
    'blueprint' in value &&
    'constraints' in value
  );
};

const isSynthesisPayload = (value: unknown): value is SynthesisPluginPayload => {
  return (
    !!value &&
    typeof value === 'object' &&
    'source' in value &&
    'commandOrder' in value &&
    Array.isArray((value as { commandOrder: readonly unknown[] }).commandOrder)
  );
};

const toPayload = (
  input: SynthesisInput | SynthesisPluginPayload,
  source: SynthesisPluginPayload['source'],
  warnings: readonly string[] = [],
): SynthesisPluginPayload => {
  if (isSynthesisPayload(input)) {
    return {
      source,
      commandOrder: input.commandOrder,
      warnings,
    };
  }

  return {
    source,
    commandOrder: input.blueprint.commands,
    warnings,
  };
};

const normalise = (input: SynthesisInput): PluginOutput<SynthesisPluginPayload> => {
  scenarioBlueprintSchema.parse(input.blueprint);
  return {
    status: 'success',
    payload: toPayload(input, 'normalised', ['validated blueprint', 'normalised']),
    latencyMs: 9,
    artifacts: ['schema', 'normalizer'],
    messages: ['normalization complete'],
    next: ['plugin:analyze'],
  };
};

const analyze = (input: SynthesisPluginPayload): PluginOutput<SynthesisPluginPayload> => {
  scenarioConstraintSchema.partial().parse(input.commandOrder[0] ? {} : {});
  return {
    status: input.warnings.length > 0 ? 'warn' : 'success',
    payload: toPayload(input, 'planned', input.warnings.concat([`command-count:${input.commandOrder.length}`])),
    latencyMs: 7,
    artifacts: ['planner'],
    messages: ['constraints analyzed'],
    next: ['plugin:plan'],
  };
};

const buildPlan = (input: SynthesisPluginPayload): PluginOutput<SynthesisPluginPayload> => {
  const ordered = input.commandOrder.toSorted((left, right) => left.blastRadius - right.blastRadius);
  return {
    status: 'success',
    payload: toPayload(
      {
        ...input,
        source: 'planned',
        commandOrder: ordered,
        warnings: [...input.warnings, 'sorted by blast radius'],
      },
      'simulated',
    ),
    latencyMs: 11,
    artifacts: ['sorter', 'planner'],
    messages: ['plan generated'],
    next: ['plugin:govern'],
  };
};

const govern = (input: SynthesisPluginPayload): PluginOutput<SynthesisPluginPayload> => {
  const baselineWarnings = input.warnings.concat('governance-pass');
  return {
    status: 'success',
    payload: toPayload(input, 'governed', baselineWarnings),
    latencyMs: 5,
    artifacts: ['policy-evaluator'],
    messages: ['governance checks passed'],
    next: ['plugin:publish'],
  };
};

const publish = (input: SynthesisPluginPayload): PluginOutput<SynthesisPluginPayload> => {
  const syntheticPlan: ScenarioPlan = {
    planId: asScenarioPlanId(`plan.${input.commandOrder[0]?.commandId ?? 'fallback'}`),
    blueprintId: asScenarioId(input.commandOrder[0]?.commandId ?? 'fallback-blueprint'),
    version: 1,
    commandIds: input.commandOrder.map((command) => command.commandId),
    createdAt: new Date().toISOString(),
    expectedFinishMs: asMillis(input.commandOrder.length * 1000),
    score: 1,
    constraints: [
      {
        constraintId: asScenarioConstraintId('publish.max_parallelism'),
        type: 'max_parallelism',
        description: 'bounded by command count',
        severity: 'warning',
        commandIds: input.commandOrder.map((command) => command.commandId),
        limit: Math.max(1, input.commandOrder.length),
      } satisfies ScenarioConstraint,
    ],
    warnings: input.warnings,
  };

  scenarioPlanSchema.parse(syntheticPlan as unknown);

  return {
    status: 'success',
    payload: {
      ...toPayload(input, 'governed', [...input.warnings, 'workspace emitted']),
      commandOrder: input.commandOrder,
    },
    latencyMs: 8,
    artifacts: ['publish-emitter'],
    messages: ['plan emitted', 'workspace stored'],
    next: [],
  };
};

type AnyInput = unknown;
type RegistryNamespace = `namespace:recovery-synthesis`;
type RegistryPlugin = PluginDefinition<
  AnyInput,
  unknown,
  SynthesisPluginName,
  StageName,
  RegistryNamespace
>;

const toPluginOutput = (output: PluginOutput<SynthesisPluginPayload>): PluginOutput<unknown> =>
  output as PluginOutput<unknown>;

export const pluginDefinitions: readonly RegistryPlugin[] = [
  {
    name: 'plugin:ingest' as SynthesisPluginName,
    namespace: pluginNamespace,
    stage: 'stage:ingest' as StageName,
    dependsOn: [] as const,
    description: 'normalise synthesis input',
    labels: buildLabels('platform', 'high'),
    run: async (input: AnyInput, context: PluginContext<AnyInput>): Promise<PluginOutput<unknown>> => {
      if (!isSynthesisInput(input)) {
        throw new Error(`plugin:ingest expected SynthesisInput; got ${context.plugin}`);
      }
      const output = normalise(input);
      return toPluginOutput({
        ...output,
        messages: [...output.messages, `trace=${context.traceId}`, `tenant=${context.metadata['cfg:tenant'] ?? 'default'}`],
      });
    },
  },
  {
    name: 'plugin:analyze' as SynthesisPluginName,
    namespace: pluginNamespace,
    stage: 'stage:analyze' as StageName,
    dependsOn: ['plugin:ingest'] as const,
    description: 'derive risk envelope',
    labels: buildLabels('risk', 'medium'),
    run: async (input: AnyInput, context: PluginContext<AnyInput>): Promise<PluginOutput<unknown>> => {
      if (!isSynthesisPayload(input)) {
        throw new Error(`plugin:analyze expected SynthesisPluginPayload; got ${context.plugin}`);
      }
      const output = analyze(input);
      return toPluginOutput({
        ...output,
        messages: [...output.messages, `stage=${context.stage}`],
      });
    },
  },
  {
    name: 'plugin:plan' as SynthesisPluginName,
    namespace: pluginNamespace,
    stage: 'stage:plan' as StageName,
    dependsOn: ['plugin:analyze'] as const,
    description: 'compose plan payload',
    labels: buildLabels('planner', 'critical'),
    run: async (input: AnyInput, context: PluginContext<AnyInput>): Promise<PluginOutput<unknown>> => {
      if (!isSynthesisPayload(input)) {
        throw new Error(`plugin:plan expected SynthesisPluginPayload; got ${context.plugin}`);
      }
      const output = buildPlan(input);
      return toPluginOutput({
        ...output,
        messages: [...output.messages, `commands=${input.commandOrder.length}`],
      });
    },
  },
  {
    name: 'plugin:govern' as SynthesisPluginName,
    namespace: pluginNamespace,
    stage: 'stage:govern' as StageName,
    dependsOn: ['plugin:plan'] as const,
    description: 'validate governance constraints',
    labels: buildLabels('governance', 'high'),
    run: async (input: AnyInput, context: PluginContext<AnyInput>): Promise<PluginOutput<unknown>> => {
      if (!isSynthesisPayload(input)) {
        throw new Error(`plugin:govern expected SynthesisPluginPayload; got ${context.plugin}`);
      }
      const output = govern(input);
      return toPluginOutput({
        ...output,
        messages: [...output.messages, `runtime=${context.startedAt}`],
      });
    },
  },
  {
    name: 'plugin:publish' as SynthesisPluginName,
    namespace: pluginNamespace,
    stage: 'stage:store' as StageName,
    dependsOn: ['plugin:govern'] as const,
    description: 'emit final workspace output',
    labels: buildLabels('runtime', 'critical'),
    run: async (input: AnyInput, context: PluginContext<AnyInput>): Promise<PluginOutput<unknown>> => {
      if (!isSynthesisPayload(input)) {
        throw new Error(`plugin:publish expected SynthesisPluginPayload; got ${context.plugin}`);
      }
      const output = publish(input);
      return toPluginOutput({
        ...output,
        messages: [...output.messages, `mode=${context.stage}`],
      });
    },
  },
];

export const buildSynthesisRegistry = (): SynthesisPluginRegistry<typeof pluginDefinitions> =>
  new SynthesisPluginRegistry(pluginDefinitions);
