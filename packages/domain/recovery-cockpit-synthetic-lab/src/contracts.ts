import { z } from 'zod';
import { Brand, NoInfer, OmitNever, RecursivePath } from '@shared/type-level';
import { type ConductorPluginDefinition, type ConductorPluginPhase } from '@shared/recovery-orchestration-runtime';

export const syntheticDomain = 'recovery-cockpit-synthetic-lab';

export const scenarioSeverity = ['critical', 'high', 'medium', 'low'] as const;
export const stepClassOrder = ['assess', 'simulate', 'actuate', 'verify'] as const;

export type ScenarioSeverity = (typeof scenarioSeverity)[number];
export type StepClass = (typeof stepClassOrder)[number];

export type ScenarioId = Brand<string, 'ScenarioId'>;
export type TenantId = Brand<string, 'TenantId'>;
export type RegionCode = Brand<string, 'RegionCode'>;
export type RunId = Brand<string, 'ScenarioRunId'>;
export type RunNamespace = Brand<string, 'ScenarioRunNamespace'>;
export type MetricKey = Brand<string, 'MetricKey'>;
export type ScenarioStepId = Brand<string, 'ScenarioStepId'>;
export type ScenarioRunSignature = Brand<string, 'ScenarioRunSignature'>;

export type ScenarioTag<T extends string = string> = `${T}:scenario`;
export type MetricTag<T extends string = string> = `metric:${T}`;
export type StepTag<T extends string = string> = `step:${T}`;
export type EventTag<T extends string = string> = `event:${T}`;
export type RunLogKey = `${TenantId}::${ScenarioId}::${RunId}`;

export type ScenarioStepIdPath = `${ScenarioId}:${ScenarioStepId}`;
export type StepPath = `${TenantId}/${ScenarioId}/${ScenarioStepId}`;
export type ScenarioPath = `scenario/${TenantId}/${ScenarioId}`;

export type PathLike<T extends object> = Exclude<RecursivePath<T>, never>;

export type StepDependencyMap<TSteps extends readonly ScenarioStep[]> = {
  [I in keyof TSteps as TSteps[I] extends { name: infer StepName extends string } ? StepName : never]: {
    readonly dependsOn: readonly string[];
    readonly index: I;
  };
};

export type PluginInputFor<TPlugin extends ConductorPluginDefinition> = TPlugin extends ConductorPluginDefinition<
  infer TInput,
  any,
  any,
  any
>
  ? TInput
  : never;

export type PluginOutputFor<TPlugin extends ConductorPluginDefinition> = TPlugin extends ConductorPluginDefinition<
  any,
  infer TOutput,
  any,
  any
>
  ? TOutput
  : never;

export type PluginForInput<TDefs extends readonly ConductorPluginDefinition[]> = TDefs extends readonly [
  infer Head extends ConductorPluginDefinition,
  ...infer Tail extends readonly ConductorPluginDefinition[],
]
  ? readonly [PluginInputFor<Head>, ...PluginForInput<Tail>]
  : [];

export type PluginForOutput<TDefs extends readonly ConductorPluginDefinition[]> = TDefs extends readonly [
  infer Head extends ConductorPluginDefinition,
  ...infer Tail extends readonly ConductorPluginDefinition[],
]
  ? readonly [PluginOutputFor<Head>, ...PluginForOutput<Tail>]
  : [];

export type PluginCatalogByPhase<TDefs extends readonly ConductorPluginDefinition[]> = {
  [P in ConductorPluginPhase]: Extract<TDefs[number], { phase: P }>[];
};

export type PluginManifest<TDefs extends readonly ConductorPluginDefinition[]> = {
  [K in keyof TDefs as K extends number
    ? TDefs[K] extends ConductorPluginDefinition
      ? `plugin:${TDefs[K]['id'] & string}`
      : never
    : never]: TDefs[K];
};

export const metricSchema = z
  .object({
    key: z.string().min(2).max(64),
    threshold: z.number().finite().nonnegative(),
    current: z.number().min(0).max(1000),
    unit: z.string().min(1).max(16),
    region: z.string().min(2).max(64),
  })
  .strict();

export const scenarioStepSchema = z
  .object({
    name: z.string().min(1),
    durationMinutes: z.number().positive(),
    className: z.enum(stepClassOrder),
    outputs: z.array(metricSchema).default([]),
    dependencies: z.array(z.string()).default([]),
    retryPolicy: z
      .object({
        retries: z.number().int().min(0).max(7),
        delaySeconds: z.number().positive(),
      })
      .partial()
      .optional(),
  })
  .strict();

export const scenarioBlueprintSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(3).max(180),
    tenant: z.string().min(3),
    severity: z.enum(scenarioSeverity),
    region: z.string().min(2).max(24),
    tags: z.array(z.string()).default([]),
    createdAt: z.string().datetime(),
    steps: z.array(scenarioStepSchema).min(1),
    metrics: z.array(metricSchema).min(1),
    metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  })
  .strict();

export const scenarioBlueprintArraySchema = z.array(scenarioBlueprintSchema);
export const scenarioOutputSchema = z
  .object({
    score: z.number().min(0).max(100),
    confidence: z.number().min(0).max(1),
    diagnostics: z.array(z.string()),
    metadata: z.record(z.unknown()),
  })
  .strict();

export type ScenarioBlueprint = z.infer<typeof scenarioBlueprintSchema>;
export type ScenarioStep = z.infer<typeof scenarioStepSchema>;
export type ScenarioMetric = z.infer<typeof metricSchema>;
export type ScenarioOutput = z.infer<typeof scenarioOutputSchema>;
export type ScenarioBlueprintSeed = z.input<typeof scenarioBlueprintSchema>;

export type ScenarioEvent = {
  readonly at: number;
  readonly phase: StepClass;
  readonly metric: MetricKey;
  readonly score: number;
  readonly tags: readonly string[];
};

export type ScenarioInput = {
  readonly input: string;
  readonly requestedBy: string;
  readonly context: Readonly<Record<string, string | number | boolean>>;
};

export type ScenarioPlan = {
  readonly id: ScenarioId;
  readonly severity: ScenarioSeverity;
  readonly tenant: TenantId;
  readonly steps: readonly ScenarioStep[];
  readonly score: number;
  readonly signature: ScenarioRunSignature;
  readonly tags: readonly ScenarioTag[];
  readonly startedAt: string;
};

export type ScenarioTimeline = {
  readonly at: string;
  readonly phase: StepClass;
  readonly durationMinutes: number;
  readonly weight: number;
};

export type ScenarioEnvelope<TInput extends ScenarioInput, TOutput extends object = Record<string, never>> = {
  readonly id: RunId;
  readonly tenant: TenantId;
  readonly namespace: RunNamespace;
  readonly scenario: ScenarioId;
  readonly startedAt: string;
  readonly path: PathLike<TOutput>;
  readonly input: TInput;
  readonly digest: ScenarioRunSignature;
};

export type EventTimeline = {
  readonly at: number;
  readonly phase: StepClass;
  readonly score: number;
  readonly tags: readonly string[];
};

export type ScenarioRunConfig<T extends Record<string, unknown> = Record<string, never>> = {
  readonly mode: 'simulate' | 'drill' | 'predict';
  readonly actor: string;
  readonly weights?: Readonly<NoInfer<T>>;
};

export type TupleBuilder<T, N extends number, Acc extends readonly T[] = readonly []> = Acc['length'] extends N
  ? Acc
  : TupleBuilder<T, N, readonly [...Acc, T]>;

export type PhaseTuple<TStep extends readonly ScenarioStep[]> = TStep extends readonly [
  infer Head extends ScenarioStep,
  ...infer Rest extends readonly ScenarioStep[],
]
  ? Head['className'] extends StepClass
    ? readonly [Head, ...PhaseTuple<Rest & readonly ScenarioStep[]>]
    : PhaseTuple<Rest & readonly ScenarioStep[]>
  : readonly [];

export type ScenarioTuple<T extends readonly ScenarioBlueprint[]> = T extends readonly [
  infer Head extends ScenarioBlueprint,
  ...infer Tail extends readonly ScenarioBlueprint[],
]
  ? readonly [Head, ...ScenarioTuple<Tail>]
  : readonly [];

export type StepPhaseDigest<TBlueprint extends readonly ScenarioStep[]> = {
  readonly [K in StepClass]: Extract<TBlueprint[number], { className: K }>[];
};

export const scenarioCatalogSeed = [
  {
    id: 'incident-spike-01',
    title: 'Cross-region failover load spike',
    tenant: 'tenant-neo',
    severity: 'critical',
    region: 'us-east-1',
    tags: ['region', 'failover', 'resiliency'],
    createdAt: '2026-01-10T00:00:00.000Z',
    steps: [
      {
        name: 'assess-failover-readiness',
        durationMinutes: 8,
        className: 'assess',
        outputs: [
          {
            key: 'readiness-rto',
            threshold: 12,
            current: 98,
            unit: '%',
            region: 'us-east-1',
          },
        ],
        dependencies: [],
        retryPolicy: {
          retries: 1,
          delaySeconds: 4,
        },
      },
      {
        name: 'simulate-replay',
        durationMinutes: 14,
        className: 'simulate',
        outputs: [
          {
            key: 'recovery-rpo',
            threshold: 3,
            current: 2,
            unit: 'm',
            region: 'us-east-1',
          },
        ],
        dependencies: ['assess-failover-readiness'],
      },
      {
        name: 'actuate-routing',
        durationMinutes: 6,
        className: 'actuate',
        outputs: [
          {
            key: 'traffic-shift',
            threshold: 92,
            current: 95,
            unit: '%',
            region: 'us-east-1',
          },
        ],
        dependencies: ['simulate-replay'],
      },
      {
        name: 'verify-thresholds',
        durationMinutes: 4,
        className: 'verify',
        outputs: [
          {
            key: 'dr-success',
            threshold: 99,
            current: 99,
            unit: '%',
            region: 'us-east-1',
          },
        ],
        dependencies: ['actuate-routing'],
      },
    ],
    metrics: [
      {
        key: 'readiness-rto',
        threshold: 12,
        current: 98,
        unit: '%',
        region: 'us-east-1',
      },
      {
        key: 'recovery-rpo',
        threshold: 3,
        current: 2,
        unit: 'm',
        region: 'us-east-1',
      },
    ],
  },
  {
    id: 'database-consensus-degrade',
    title: 'Consensus lag and degraded writes',
    tenant: 'tenant-nebula',
    severity: 'high',
    region: 'eu-west-1',
    tags: ['db', 'consensus', 'latency'],
    createdAt: '2026-01-12T00:00:00.000Z',
    steps: [
      {
        name: 'assess-consensus-health',
        durationMinutes: 11,
        className: 'assess',
        outputs: [
          {
            key: 'consensus-lag',
            threshold: 120,
            current: 98,
            unit: 'ms',
            region: 'eu-west-1',
          },
        ],
        dependencies: [],
      },
      {
        name: 'simulate-quorum-shift',
        durationMinutes: 9,
        className: 'simulate',
        outputs: [
          {
            key: 'quorum-stability',
            threshold: 98,
            current: 99,
            unit: '%',
            region: 'eu-west-1',
          },
        ],
        dependencies: ['assess-consensus-health'],
      },
      {
        name: 'actuate-write-failover',
        durationMinutes: 7,
        className: 'actuate',
        outputs: [
          {
            key: 'write-throughput',
            threshold: 88,
            current: 91,
            unit: 'ops',
            region: 'eu-west-1',
          },
        ],
        dependencies: ['simulate-quorum-shift'],
      },
      {
        name: 'verify-quorum-complete',
        durationMinutes: 5,
        className: 'verify',
        outputs: [
          {
            key: 'quorum-complete',
            threshold: 1,
            current: 1,
            unit: 'ok',
            region: 'eu-west-1',
          },
        ],
        dependencies: ['actuate-write-failover'],
      },
    ],
    metrics: [
      {
        key: 'consensus-lag',
        threshold: 120,
        current: 120,
        unit: 'ms',
        region: 'eu-west-1',
      },
    ],
  },
  {
    id: 'telemetry-pipeline-latency',
    title: 'Telemetry pipeline pressure under synthetic storm',
    tenant: 'tenant-nebula',
    severity: 'medium',
    region: 'ap-southeast-1',
    tags: ['telemetry', 'pipeline', 'dr'],
    createdAt: '2026-01-14T00:00:00.000Z',
    steps: [
      {
        name: 'assess-pipeline-backlog',
        durationMinutes: 9,
        className: 'assess',
        outputs: [
          {
            key: 'pipeline-backlog',
            threshold: 1400,
            current: 900,
            unit: 'entries',
            region: 'ap-southeast-1',
          },
        ],
        dependencies: [],
      },
      {
        name: 'simulate-load-surge',
        durationMinutes: 13,
        className: 'simulate',
        outputs: [
          {
            key: 'pipeline-latency',
            threshold: 120,
            current: 88,
            unit: 'ms',
            region: 'ap-southeast-1',
          },
        ],
        dependencies: ['assess-pipeline-backlog'],
      },
      {
        name: 'actuate-pipeline-hedge',
        durationMinutes: 6,
        className: 'actuate',
        outputs: [
          {
            key: 'pipeline-capacity',
            threshold: 95,
            current: 96,
            unit: '%',
            region: 'ap-southeast-1',
          },
        ],
        dependencies: ['simulate-load-surge'],
      },
      {
        name: 'verify-recovery-gain',
        durationMinutes: 4,
        className: 'verify',
        outputs: [
          {
            key: 'dr-success',
            threshold: 99,
            current: 99,
            unit: '%',
            region: 'ap-southeast-1',
          },
        ],
        dependencies: ['actuate-pipeline-hedge'],
      },
    ],
    metrics: [
      {
        key: 'pipeline-latency',
        threshold: 120,
        current: 88,
        unit: 'ms',
        region: 'ap-southeast-1',
      },
    ],
  },
] as const satisfies readonly ScenarioBlueprintSeed[];

export const scenarioBlueprintSeedParsed = scenarioBlueprintArraySchema.parse(scenarioCatalogSeed);
export const scenarioCatalogParsed = scenarioBlueprintSeedParsed.map((scenario) => ({
  ...scenario,
  id: `${scenario.id}` as ScenarioId,
  tenant: `${scenario.tenant}` as TenantId,
  region: `${scenario.region}` as RegionCode,
})) satisfies readonly ScenarioBlueprint[];

export const scenarioBlueprintByTenant = (tenant: TenantId): readonly ScenarioBlueprint[] =>
  scenarioCatalogParsed.filter((entry) => entry.tenant === tenant);

export const asScenarioId = (value: string): ScenarioId => `${value}` as ScenarioId;
export const asRunId = (value: string): RunId => `${value}` as RunId;
export const asMetricKey = (value: string): MetricKey => `${value}` as MetricKey;
export const asRunSignature = (value: string): ScenarioRunSignature => `${value}` as ScenarioRunSignature;
export const asTenantId = (value: string): TenantId => `${value}` as TenantId;
export const asRegionCode = (value: string): RegionCode => `${value}` as RegionCode;
export const asRunNamespace = (value: string): RunNamespace => `${value}` as RunNamespace;

export const metricFingerprint = (metric: ScenarioMetric): MetricKey =>
  `${asMetricKey(`${metric.key}:${metric.unit}`)}` as MetricKey;

export const buildRunId = (scenarioId: ScenarioId, seed: number): RunId => `${scenarioId}:${seed}` as RunId;
export const runNamespace = (tenant: TenantId): RunNamespace => `${syntheticDomain}:${tenant}` as RunNamespace;

export const normalizeScenario = (raw: ScenarioBlueprint | ScenarioBlueprintSeed): ScenarioBlueprint => {
  const parsed = scenarioBlueprintSchema.parse(raw);
  return {
    ...parsed,
    id: asScenarioId(parsed.id),
    tenant: asTenantId(parsed.tenant),
    region: asRegionCode(parsed.region),
  };
};

export const scenarioStepsByPhase = (scenario: ScenarioBlueprint): OmitNever<Record<StepClass, readonly ScenarioStep[]>> => {
  return scenario.steps.reduce(
    (acc, step) => {
      acc[step.className].push(step);
      return acc;
    },
    {
      assess: [],
      simulate: [],
      actuate: [],
      verify: [],
    } as Record<StepClass, ScenarioStep[]>,
  );
};

export const scenarioStepSignature = (steps: readonly ScenarioStep[]): string =>
  steps.map((step) => `${step.className}:${step.name}:${step.durationMinutes}`).join('|');

export const phaseWeights = {
  assess: 0.4,
  simulate: 0.3,
  actuate: 0.2,
  verify: 0.1,
} as const satisfies Record<StepClass, number>;

export const phaseWeightsTuple = <const T extends readonly [number, ...number[]]>(values: T): T => values;

export const buildTimelineDigest = (timeline: readonly ScenarioTimeline[]): ScenarioRunSignature =>
  timeline
    .map((entry) => `${entry.phase}:${entry.durationMinutes}:${entry.weight.toFixed(2)}`)
    .join('>') as ScenarioRunSignature;

export const tupleFromSteps = (count: number): TupleBuilder<ScenarioStep, 4> => {
  const source = Array.from({ length: count }).map(
    (_entry, index): ScenarioStep => ({
      name: `step-${index + 1}`,
      durationMinutes: 1,
      className: 'assess',
      outputs: [],
      dependencies: [],
    }),
  );
  const output = [...source];
  const fallback = output.at(-1) ?? {
    name: `step-${Math.max(1, Math.min(4, count) + 1)}`,
    durationMinutes: 1,
    className: 'assess',
    outputs: [],
    dependencies: [],
  };
  while (output.length < 4) {
    output.push(fallback);
  }
  return output.slice(0, 4) as unknown as TupleBuilder<ScenarioStep, 4>;
};

export const blueprintByPhaseMatrix = (scenario: ScenarioBlueprint): { [K in StepClass]: number } => {
  const byPhase = scenarioStepsByPhase(scenario);
  return {
    assess: byPhase.assess.length,
    simulate: byPhase.simulate.length,
    actuate: byPhase.actuate.length,
    verify: byPhase.verify.length,
  };
};

export const estimateScenarioComplexity = (scenario: ScenarioBlueprint): number => {
  const weighted = blueprintByPhaseMatrix(scenario);
  return (
    scenario.steps.length * 0.45 +
    weighted.assess * 1.4 +
    weighted.simulate * 1.2 +
    weighted.actuate * 1.1 +
    weighted.verify * 0.7
  );
};

export const eventTimelineFromRun = (runId: RunId, scenario: ScenarioBlueprint) => {
  const timeline = scenario.steps.map((step, index) => ({
    phase: step.className,
    score: Math.min(1, step.outputs.reduce((acc, metric) => acc + metric.current / Math.max(1, metric.threshold), 0)),
    at: Date.now() + index * 1_000,
    tags: [`event:${runId}`, `step:${step.name}`] as const,
  }));

  return timeline;
};

export const collectScenarioTags = (scenario: ScenarioBlueprint): readonly ScenarioTag[] => {
  const tags = new Set<string>([
    `seed:${scenario.id}`,
    `tenant:${scenario.tenant}`,
    `steps:${scenario.steps.length}`,
    ...scenario.metrics.map((metric) => `${metric.key}:${metric.unit}`),
  ]);
  return [...tags] as readonly ScenarioTag[];
};

const isReadOnlyArray = (value: unknown): value is readonly unknown[] => Array.isArray(value);

const isStepClassPhase = (phase: unknown): phase is StepClass =>
  phase === 'assess' || phase === 'simulate' || phase === 'actuate' || phase === 'verify';

export const validateTimeline = (timeline: unknown): timeline is readonly EventTimeline[] => {
  return isReadOnlyArray(timeline) && timeline.every((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return false;
    }
    const candidate = entry as Partial<EventTimeline>;
    return (
      typeof candidate.at === 'number' &&
      typeof candidate.score === 'number' &&
      isStepClassPhase(candidate.phase) &&
      isReadOnlyArray(candidate.tags)
    );
  });
};
