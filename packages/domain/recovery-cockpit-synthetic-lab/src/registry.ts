import {
  buildPlugin,
  ConductorPluginRegistry,
  runConductorPlan,
  runConductorStream,
  createAsyncDisposableStack,
  buildRunId as buildConductorRunId,
  type ConductorPluginTag,
} from '@shared/recovery-orchestration-runtime';
import {
  buildConductorNamespace,
  type ConductorNamespace,
  type ConductorRunId,
  type ConductorPluginDefinition,
  type ConductorPluginId,
  type ConductorPluginPhase,
  type OrchestrationInput,
  type OrchestrationEvent,
} from '@shared/recovery-orchestration-runtime';
import { NoInfer } from '@shared/type-level';
import {
  asRunId,
  asRunNamespace,
  asScenarioId,
  asTenantId,
  buildTimelineDigest,
  metricFingerprint,
  phaseWeights,
  type RunId,
  runNamespace,
  scenarioOutputSchema,
  scenarioStepsByPhase,
  type ScenarioEvent,
  type ScenarioInput,
  type ScenarioMetric,
  type ScenarioOutput,
  type ScenarioPlan,
  type ScenarioRunConfig,
  type ScenarioRunSignature,
  type ScenarioStep,
  type ScenarioBlueprint,
  type StepClass,
  type PluginCatalogByPhase,
  type PluginManifest,
  syntheticDomain,
  stepClassOrder,
} from './contracts';

const syntheticNamespace = buildConductorNamespace(syntheticDomain);
const pluginPhases = stepClassOrder as readonly StepClass[];
const asPluginTag = (value: string): ConductorPluginTag => `${value}` as ConductorPluginTag;

export type RunTransition = {
  readonly phase: StepClass;
  readonly pluginId: string;
  readonly index: number;
  readonly inputSize: number;
};

type AssessPayload = {
  readonly scenario: ScenarioBlueprint;
  readonly startedAt: string;
  readonly trace: readonly ScenarioEvent[];
  readonly phase: StepClass;
};

type SimulatePayload = AssessPayload & {
  readonly score: number;
  readonly metricsByPhase: ReadonlyMap<StepClass, readonly ScenarioMetric[]>;
  readonly phase: StepClass;
};

type ActuatePayload = SimulatePayload & {
  readonly planFingerprint: string;
  readonly phase: StepClass;
};

type VerifyOutput = {
  readonly score: number;
  readonly confidence: number;
  readonly diagnostics: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly phase: StepClass;
};

type PluginOutputFor<TDefs extends readonly ConductorPluginDefinition[]> = {
  [K in keyof TDefs]: TDefs[K] extends ConductorPluginDefinition<
    infer TInput,
    infer TOutput,
    infer TConfig,
    infer TPhase
  >
    ? {
        readonly phase: TPhase;
        readonly input: TInput;
        readonly output: TOutput;
        readonly config: TConfig;
      }
    : never;
};

export type RegistryBuildResult<TDefs extends readonly ConductorPluginDefinition[]> = {
  readonly registry: ConductorPluginRegistry<TDefs>;
  readonly manifest: PluginManifest<TDefs>;
  readonly byPhase: PluginCatalogByPhase<TDefs>;
  readonly catalogVersion: ScenarioRunSignature;
};

const hashText = (seed: string): number => {
  return [...seed].reduce((acc, char) => (acc * 37 + char.charCodeAt(0)) % 1_000_000, 0);
};

const buildStepMetricEntries = (steps: readonly ScenarioStep[]): readonly ScenarioEvent[] => {
  return steps.flatMap((step, index) => {
    return step.outputs.map((metric, metricIndex) => ({
      at: Date.now() + index * 1_000 + metricIndex,
      phase: step.className,
      metric: metricFingerprint(metric),
      score: metric.current / Math.max(1, metric.threshold),
      tags: [`tenant:${metric.region}`, `step:${step.name}`, `metric:${metric.unit}`],
    }));
  });
};

const buildStepMap = (steps: readonly ScenarioStep[]): ReadonlyMap<StepClass, readonly ScenarioMetric[]> => {
  const grouped = new Map<StepClass, ScenarioMetric[]>();
  for (const step of steps) {
    const bucket = grouped.get(step.className) ?? [];
    grouped.set(step.className, [...bucket, ...step.outputs]);
  }
  return new Map(
    pluginPhases.map((phase) => [phase, grouped.get(phase) ?? []] as const),
  ) as ReadonlyMap<StepClass, readonly ScenarioMetric[]>;
};

const buildPluginDefinition = <
  TPhase extends StepClass,
  TConfig extends Record<string, unknown>,
  TInput,
  TOutput,
>(
  namespace: ConductorNamespace,
  phase: TPhase,
  name: string,
  dependencies: readonly ConductorPluginId[],
  config: TConfig,
  run: (input: TInput) => Promise<TOutput>,
): ConductorPluginDefinition<TInput, TOutput, TConfig, TPhase> => {
  const runId = buildConductorRunId(namespace, hashText(`${namespace}:${name}`), `${name}:${phase}`);
  return buildPlugin(namespace, phase, {
    name,
    runId,
    tags: [asPluginTag(`phase:${phase}`), asPluginTag(`plugin:${name}`)] as const,
    dependencies,
    config,
    implementation: async (_context, input) => {
      const payload = await run(input as NoInfer<TInput>);
      return {
        ok: true,
        payload,
        diagnostics: [`phase=${phase}`, `plugin=${name}`, `hash=${hashText(name)}`],
      };
    },
  });
};

const createAssessPlugin = <TConfig extends Record<string, unknown>>(
  scenario: ScenarioBlueprint,
  config: NoInfer<TConfig>,
) => {
  const diagnostics = [
    `scenario:${scenario.id}`,
    `tenant:${scenario.tenant}`,
    `steps:${scenario.steps.length}`,
  ] as const;

  return buildPluginDefinition<
    'assess',
    TConfig & { stage: 'assess' },
    ScenarioInput,
    AssessPayload
  >(syntheticNamespace, 'assess', `${scenario.id}:assess`, [] as const, { ...config, stage: 'assess' } as TConfig & { stage: 'assess' }, async (input) => {
    const trace = buildStepMetricEntries(scenario.steps.filter((step) => step.className === 'assess'));
    const grouped = scenarioStepsByPhase(scenario);
    const score = trace.reduce((acc, entry) => acc + entry.score, 0);
    return {
      scenario,
      startedAt: new Date().toISOString(),
      phase: 'assess' as const,
      trace: [
        ...trace,
        ...grouped.simulate.flatMap((step) =>
          buildStepMetricEntries([step]).map((entry) => ({
            ...entry,
            tags: [...entry.tags, ...diagnostics],
          })),
        ),
      ],
      score,
    } as AssessPayload;
  });
};

const createSimulatePlugin = <TConfig extends Record<string, unknown>>(
  scenario: ScenarioBlueprint,
  assess: ConductorPluginDefinition<ScenarioInput, AssessPayload, TConfig, ConductorPluginPhase>,
  config: NoInfer<TConfig>,
) => {
  return buildPluginDefinition<'simulate', TConfig & { stage: 'simulate' }, AssessPayload, SimulatePayload>(
    syntheticNamespace,
    'simulate',
    `${scenario.id}:simulate`,
    [assess.id],
    { ...config, stage: 'simulate' } as TConfig & { stage: 'simulate' },
    async (input) => {
      const metricsByPhase = buildStepMap(scenario.steps);
      const trace = buildStepMetricEntries(scenario.steps.filter((step) => step.className === 'simulate'));
      const score = trace.reduce((acc, event) => acc + event.score, 0);
      await Promise.resolve(input);
      return {
        ...input,
        phase: 'simulate' as const,
        score,
        metricsByPhase,
      } as SimulatePayload;
    },
  );
};

const createActuatePlugin = <TConfig extends Record<string, unknown>>(
  scenario: ScenarioBlueprint,
  simulate: ConductorPluginDefinition<AssessPayload, SimulatePayload, TConfig, ConductorPluginPhase>,
  config: NoInfer<TConfig>,
) => {
  return buildPluginDefinition<'actuate', TConfig & { stage: 'actuate' }, SimulatePayload, ActuatePayload>(
    syntheticNamespace,
    'actuate',
    `${scenario.id}:actuate`,
    [simulate.id],
    { ...config, stage: 'actuate' } as TConfig & { stage: 'actuate' },
    async (input) => {
      const fingerprint = buildTimelineDigest(
        Object.entries(phaseWeights).flatMap(([phase, weight]) =>
          scenario.steps
            .filter((step) => step.className === phase)
            .map((step) => ({
              at: new Date().toISOString(),
              phase: phase as StepClass,
              durationMinutes: step.durationMinutes,
              weight,
            })),
        ),
      );
      await Promise.resolve(input);
      return {
        ...input,
        phase: 'actuate' as const,
        planFingerprint: fingerprint,
      } as ActuatePayload;
    },
  );
};

const createVerifyPlugin = <TConfig extends Record<string, unknown>>(
  scenario: ScenarioBlueprint,
  actuate: ConductorPluginDefinition<SimulatePayload, ActuatePayload, TConfig, ConductorPluginPhase>,
  config: NoInfer<TConfig>,
) => {
  return buildPluginDefinition<'verify', TConfig & { stage: 'verify' }, ActuatePayload, VerifyOutput>(
    syntheticNamespace,
    'verify',
    `${scenario.id}:verify`,
    [actuate.id],
    { ...config, stage: 'verify' } as TConfig & { stage: 'verify' },
    async (input) => {
      const metricScore = Object.values(Object.fromEntries(input.metricsByPhase)).flat().reduce(
        (acc, metric) => acc + Math.min(1, metric.current / metric.threshold),
        0,
      );
      const score = Math.max(0, Math.min(100, metricScore * phaseWeights.assess * 100));
      const payload = scenarioOutputSchema.parse({
        score,
        confidence: Math.max(0.05, Math.min(0.99, input.score / 100)),
        diagnostics: [
          `verify:${scenario.id}`,
          `phases:${scenario.steps.length}`,
          `fingerprint:${input.planFingerprint}`,
          `configured:${JSON.stringify(config).slice(0, 32)}`,
        ],
        metadata: {
          scenario: scenario.id,
          tenant: scenario.tenant,
          phase: 'verify',
          ...config,
        },
      });
      await Promise.resolve(input);
      return {
        ...payload,
        phase: 'verify' as const,
      } as VerifyOutput;
    },
  );
};

export const buildSyntheticPlugins = <TConfig extends Record<string, unknown>>(
  scenario: ScenarioBlueprint,
  config: NoInfer<TConfig>,
) => {
  const assess = createAssessPlugin(scenario, config);
  const simulate = createSimulatePlugin(scenario, assess, config);
  const actuate = createActuatePlugin(scenario, simulate, config);
  const verify = createVerifyPlugin(scenario, actuate, config);

  return [assess, simulate, actuate, verify] as const;
};

const buildPhaseMap = <TDefs extends readonly ConductorPluginDefinition[]>(definitions: TDefs): PluginCatalogByPhase<TDefs> => {
  const output = {
    discover: [] as ConductorPluginDefinition[],
    assess: [] as ConductorPluginDefinition[],
    simulate: [] as ConductorPluginDefinition[],
    actuate: [] as ConductorPluginDefinition[],
    verify: [] as ConductorPluginDefinition[],
    finalize: [] as ConductorPluginDefinition[],
  };

  for (const definition of definitions) {
    output[definition.phase].push(definition);
  }

  return output as PluginCatalogByPhase<TDefs>;
};

export const createSyntheticCatalog = <
  TConfig extends Record<string, unknown>,
>(
  scenario: ScenarioBlueprint,
  config: NoInfer<TConfig>,
): RegistryBuildResult<readonly ConductorPluginDefinition[]> => {
  const definitions = buildSyntheticPlugins(scenario, config);
  const registry = ConductorPluginRegistry.create(definitions);
  const manifest = registry.manifest as PluginManifest<readonly ConductorPluginDefinition[]>;
  const byPhase = buildPhaseMap(definitions);

  return {
    registry,
    manifest,
    byPhase,
    catalogVersion: buildTimelineDigest(
      definitions.map((definition, index) => ({
        at: new Date().toISOString(),
        phase: definition.phase as StepClass,
        durationMinutes: 1 + (index % 5),
        weight: phaseWeights[definition.phase as StepClass] ?? 0,
      })),
    ),
  };
};

type ScenarioCatalogEnvelope = {
  readonly id: RunId;
  readonly tenant: ReturnType<typeof asTenantId>;
  readonly namespace: ReturnType<typeof asRunNamespace>;
  readonly scenario: ReturnType<typeof asScenarioId>;
  readonly path: string;
  readonly input: ScenarioInput;
  readonly startedAt: string;
  readonly digest: ScenarioRunSignature;
};

export const runSyntheticScenario = async <
  TConfig extends Record<string, unknown>,
  TInput extends ScenarioInput,
>(
  config: ScenarioRunConfig<TConfig>,
  scenario: ScenarioBlueprint,
  input: TInput,
) => {
  const { registry, catalogVersion } = createSyntheticCatalog(scenario, config);
  const namespace = runNamespace(asTenantId(scenario.tenant));
  const runtimeNamespace = buildConductorNamespace(`tenant/${scenario.tenant}`);
  const runId = asRunId(
    buildConductorRunId(runtimeNamespace, Date.now(), `${scenario.id}:${config.mode}:${config.actor}`),
  );
  const transitions: RunTransition[] = [];
  const timeline: string[] = [];

  const orchestrationInput: OrchestrationInput<TInput, ScenarioOutput> = {
    tenantId: `${scenario.tenant}`,
    namespace: runtimeNamespace as ConductorNamespace,
    runIdSeed: `${runId}`,
    registry,
    phaseOrder: [...pluginPhases],
    input,
    onTransition: async (event) => {
      transitions.push({
        phase: event.phase as StepClass,
        pluginId: event.pluginId,
        index: event.index,
        inputSize: event.input ? Object.keys(event.input as Record<string, unknown>).length : 0,
      });
      timeline.push(
        `${event.phase}#${event.pluginId}:${event.index}::${event.input === undefined ? 'nil' : 'payload'}`,
      );
      await Promise.resolve();
    },
  };

  const completion = await runConductorPlan(orchestrationInput);
  const startedAt = new Date().toISOString();

  return {
    completion,
    transitions,
    metrics: [...timeline],
    config: config as ScenarioRunConfig<Record<string, unknown>>,
    envelope: {
      id: runId,
      tenant: asTenantId(scenario.tenant),
      namespace: asRunNamespace(namespace),
      scenario: asScenarioId(scenario.id),
      path: `scenario:${scenario.id}`,
      input,
      startedAt,
      digest: buildTimelineDigest(
        Object.entries(phaseWeights).map(([phase, weight], index) => ({
          at: new Date().toISOString(),
          phase: phase as StepClass,
          durationMinutes: scenario.steps[index]?.durationMinutes ?? 0,
          weight,
        })),
      ),
    } as ScenarioCatalogEnvelope,
    catalogVersion,
  };
};

export const streamSyntheticScenario = async <
  TConfig extends Record<string, unknown>,
  TInput extends ScenarioInput,
>(
  scenario: ScenarioBlueprint,
  config: ScenarioRunConfig<TConfig>,
  input: TInput,
) => {
  const { registry } = createSyntheticCatalog(scenario, config);
  const runtimeNamespace = buildConductorNamespace(`tenant/${scenario.tenant}`);
  const runId = buildConductorRunId(runtimeNamespace, Date.now(), `${scenario.id}:${config.actor}`);
  const events: OrchestrationEvent<ScenarioOutput>[] = [];

  const orchestrationInput: OrchestrationInput<TInput, ScenarioOutput> = {
    tenantId: scenario.tenant,
    namespace: runtimeNamespace,
    runIdSeed: `${runId}`,
    registry,
    phaseOrder: [...pluginPhases],
    input,
    onTransition: async (event) => {
      await Promise.resolve(event.phase);
    },
  };

  void buildConductorRunId(runtimeNamespace, Date.now(), `${runId}`);
  await using stack = createAsyncDisposableStack();
  stack.use({
    [Symbol.asyncDispose]: () => {
      events.length = 0;
      return Promise.resolve(undefined);
    },
  });

  for await (const event of runConductorStream(orchestrationInput)) {
    events.push(event);
  }

  return events;
};

export const runIdForScenario = async (scenario: ScenarioBlueprint): Promise<ConductorRunId> => {
  const runtimeNamespace = buildConductorNamespace(`tenant/${scenario.tenant}`);
  const events = await streamSyntheticScenario(scenario, { mode: 'simulate', actor: 'system', weights: {} }, {
    input: scenario.id,
    requestedBy: 'system',
    context: { actor: 'system', mode: 'simulate' },
  });
  const lastEvent = events[events.length - 1];
  const tailSeed = lastEvent?.type === 'progress' ? lastEvent.pluginId : 'complete';

  return buildConductorRunId(
    runtimeNamespace,
    events.length,
    `${scenario.id}:${tailSeed}`,
  );
};

export const pluginOutputMap = <TDefs extends readonly ConductorPluginDefinition[]>(definitions: TDefs): PluginOutputFor<TDefs> =>
  definitions.map((definition) => definition) as PluginOutputFor<TDefs>;
