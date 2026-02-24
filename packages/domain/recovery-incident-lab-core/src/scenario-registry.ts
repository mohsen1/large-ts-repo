import {
  canonicalizeNamespace,
  buildPluginVersion,
  buildPluginDefinition,
  type PluginDefinition,
  PluginRegistry,
  type PluginContext,
  type PluginResult,
  type PluginEventName,
  type PluginKind,
  type PluginNamespace,
} from '@shared/stress-lab-runtime';
import type { IncidentLabScenario, IncidentLabSignal, IncidentLabRun, IncidentLabPlan } from './types';
import { createClock } from './types';

export type RegistryTag = `incident-lab:${string}`;
export type RegistryNamespace = PluginNamespace;

export type ScenarioPluginMode = 'strict' | 'adaptive';

export interface ScenarioInputPayload {
  readonly scenario: IncidentLabScenario;
  readonly stage: 'normalize' | 'risk' | 'telemetry';
  readonly plan?: IncidentLabPlan;
  readonly run?: IncidentLabRun;
}

export interface ScenarioOutputPayload {
  readonly scenario: IncidentLabScenario;
  readonly tags: readonly RegistryTag[];
  readonly score: number;
  readonly acceptedAt: string;
  readonly signalSummary: Readonly<Record<IncidentLabSignal['kind'], number>>;
}

export interface ScenarioPluginContext {
  readonly mode: ScenarioPluginMode;
  readonly activeKind: PluginKind;
  readonly namespace: RegistryNamespace;
  readonly stage: ScenarioInputPayload['stage'];
  readonly tenant: string;
  readonly signature: string;
}

export type ScenarioPlugin = PluginDefinition<
  ScenarioInputPayload,
  ScenarioOutputPayload,
  any,
  PluginKind
>;

export type ScenarioPluginChain<TMode extends ScenarioPluginMode = ScenarioPluginMode> = TMode extends 'strict'
  ? readonly [typeof normalizePlugin, typeof riskPlugin, typeof telemetryPlugin]
  : readonly [typeof telemetryPlugin, typeof riskPlugin, typeof normalizePlugin];

export type BuildModePayload<TMode extends ScenarioPluginMode> = TMode extends 'strict'
  ? { readonly jitterPercent: number; readonly allowFallback: true }
  : { readonly jitterPercent: number; readonly allowFallback: false };

export type InferScenarioPayload<TPlugin extends ScenarioPlugin> = TPlugin extends PluginDefinition<
  infer TInput,
  infer TOutput,
  any,
  any
>
  ? { input: TInput; output: TOutput }
  : never;

export interface CatalogSummary {
  readonly namespace: RegistryNamespace;
  readonly plugins: readonly { id: string; kind: PluginKind; tags: readonly string[] }[];
  readonly loadedAt: string;
}

const namespace = canonicalizeNamespace('recovery:incident-lab');
const asRegistryTag = (value: string): RegistryTag => `${namespace}:${value}` as RegistryTag;

const baselineSignals = [
  { kind: 'capacity', value: 1 },
  { kind: 'latency', value: 0 },
  { kind: 'integrity', value: 1 },
  { kind: 'dependency', value: 0 },
] as const satisfies readonly { kind: IncidentLabSignal['kind']; value: number }[];

const buildSummary = (scenario: IncidentLabScenario): ScenarioOutputPayload => {
  const signalSummary = {
    capacity: scenario.steps.length,
    latency: scenario.steps.filter((step) => step.dependencies.length === 0).length,
    integrity: Math.max(1, scenario.labels.length),
    dependency: scenario.labels.filter((label) => label.length > 3).length,
  } as Record<IncidentLabSignal['kind'], number>;
  return {
    scenario,
    tags: [
      asRegistryTag('scenario'),
      asRegistryTag(`severity:${scenario.severity}`),
      asRegistryTag(`labels:${scenario.labels.length}`),
    ],
    score: scenario.steps.length,
    acceptedAt: createClock().now(),
    signalSummary,
  };
};

const safeFailure = (message: string): PluginResult<never> => ({
  ok: false,
  errors: [message],
  generatedAt: createClock().now(),
});

const normalizePlugin = buildPluginDefinition<'stress-lab/runtime', ScenarioInputPayload, ScenarioOutputPayload, Record<string, unknown>>(
  namespace,
  'stress-lab/runtime',
  {
    name: 'normalize-scenario',
    version: buildPluginVersion(1, 0, 0),
    tags: [asRegistryTag('normalize'), asRegistryTag('incident-lab')],
    dependencies: ['dep:recovery:incident-lab'] as const,
    pluginConfig: {
      allowMutations: true,
      mode: 'normalize',
    },
    run: async (
      _context: PluginContext<Record<string, unknown>>,
      input: ScenarioInputPayload,
    ): Promise<PluginResult<ScenarioOutputPayload>> => {
      if (input.scenario.steps.length === 0) {
        return safeFailure('scenario has no executable steps');
      }

      return {
        ok: true,
        value: {
          ...buildSummary(input.scenario),
          tags: [
            ...buildSummary(input.scenario).tags,
            asRegistryTag('normalize'),
            asRegistryTag(`mode:${input.stage}`),
          ],
        },
        generatedAt: createClock().now(),
      };
    },
  },
);
const riskPlugin = buildPluginDefinition<'stress-lab/risk', ScenarioInputPayload, ScenarioOutputPayload, Record<string, unknown>>(
  namespace,
  'stress-lab/risk',
  {
    name: 'assess-scenario-risk',
    version: buildPluginVersion(1, 0, 0),
    tags: [asRegistryTag('risk'), asRegistryTag('incident-lab')],
    dependencies: ['dep:normalize:scenario'] as const,
    pluginConfig: {
      allowedVariance: 3,
      minSeverity: 'medium',
    },
    run: async (
      _context: PluginContext<Record<string, unknown>>,
      input: ScenarioInputPayload,
    ): Promise<PluginResult<ScenarioOutputPayload>> => {
      const base = buildSummary(input.scenario);
      const risk = input.plan?.selected.length ?? base.score;
      if (risk < 0) {
        return safeFailure('negative plan risk detected');
      }

      return {
        ok: true,
        value: {
          ...base,
          score: Math.max(base.score, risk),
          tags: [...base.tags, asRegistryTag(`plan:${risk}`), asRegistryTag('risk')],
        },
        generatedAt: createClock().now(),
      };
    },
  },
);
const telemetryPlugin = buildPluginDefinition<
  'stress-lab/telemetry',
  ScenarioInputPayload,
  ScenarioOutputPayload,
  Record<string, unknown>
>(
  namespace,
  'stress-lab/telemetry',
  {
    name: 'telemetry-breadcrumb',
    version: buildPluginVersion(1, 0, 0),
    tags: [asRegistryTag('telemetry'), asRegistryTag('incident-lab')],
    dependencies: ['dep:assess:scenario-risk'] as const,
    pluginConfig: {
      emitTelemetry: true,
      channels: baselineSignals.map((signal) => signal.kind),
    },
    run: async (
      _context: PluginContext<Record<string, unknown>>,
      input: ScenarioInputPayload,
    ): Promise<PluginResult<ScenarioOutputPayload>> => {
      if (!input.run) {
        return {
          ok: true,
          value: {
            ...buildSummary(input.scenario),
            tags: [asRegistryTag('telemetry'), asRegistryTag('no-run')],
            score: input.scenario.steps.length,
            acceptedAt: createClock().now(),
            signalSummary: {
              capacity: input.scenario.labels.length,
              latency: 0,
              integrity: 1,
              dependency: 0,
            },
          },
          generatedAt: createClock().now(),
        };
      }

      const signalSummary = baselineSignals.reduce<Record<IncidentLabSignal['kind'], number>>(
        (acc, signal) => {
          acc[signal.kind] = signal.value + input.run!.results.length;
          return acc;
        },
        { capacity: 0, latency: 0, integrity: 0, dependency: 0 },
      );

      return {
        ok: true,
        value: {
          ...buildSummary(input.scenario),
          tags: [asRegistryTag('telemetry'), asRegistryTag(`run:${input.run.runId}`)],
          score: Math.max(input.run.results.length, input.run.results.filter((entry) => entry.status === 'failed').length),
          acceptedAt: createClock().now(),
          signalSummary,
        },
        generatedAt: createClock().now(),
      };
    },
  },
);


const plugins = [normalizePlugin, riskPlugin, telemetryPlugin] as const;

const pluginEvents = plugins.reduce(
  (acc, plugin) => {
    acc.push(`${plugin.kind}:registered:${plugin.id}` as PluginEventName);
    return acc;
  },
  [] as PluginEventName[],
);

const toStage = (mode: ScenarioPluginMode): ScenarioInputPayload['stage'] => {
  return mode === 'strict' ? 'normalize' : 'risk';
};

export const incidentLabNamespace = namespace;
export const incidentLabPluginIds = plugins.map((plugin) => plugin.id) as readonly ScenarioPlugin['id'][];
export const incidentLabEventNames = pluginEvents;

export const getScenarioPluginRegistry = (): PluginRegistry => {
  return PluginRegistry.create(namespace)
    .register(normalizePlugin)
    .register(riskPlugin)
    .register(telemetryPlugin);
};

export const createPluginPayload = (
  scenario: IncidentLabScenario,
  stage: ScenarioInputPayload['stage'],
  run?: IncidentLabRun,
): ScenarioInputPayload => ({
  scenario,
  stage,
  ...(scenario.steps.length % 2 === 0 ? { plan: undefined } : {}),
  ...(run ? { run } : {}),
});

export const summarizeRegistry = (registry: PluginRegistry): CatalogSummary => ({
  namespace: incidentLabNamespace,
  plugins: registry.list().map((plugin) => ({
    id: String(plugin.id),
    kind: plugin.kind,
    tags: plugin.tags,
  })),
  loadedAt: createClock().now(),
});

export const buildScenarioPluginChain = <TMode extends ScenarioPluginMode>(
  mode: TMode,
  options?: BuildModePayload<TMode>,
): ScenarioPluginChain<TMode> => {
  const resolvedOptions = (options ??
    ({ jitterPercent: 0, allowFallback: mode === 'strict' } as BuildModePayload<TMode>));

  if (mode === 'adaptive' && resolvedOptions.allowFallback) {
    return [telemetryPlugin, riskPlugin, normalizePlugin] as unknown as ScenarioPluginChain<TMode>;
  }

  return [normalizePlugin, riskPlugin, telemetryPlugin] as unknown as ScenarioPluginChain<TMode>;
};

export const ensureOrderedPluginChain = <TMode extends ScenarioPluginMode>(
  mode: TMode,
  payload: BuildModePayload<TMode>,
): ScenarioPluginChain<TMode> => {
  return buildScenarioPluginChain(mode, payload);
};

export const scenarioPluginContext = (mode: ScenarioPluginMode): ScenarioPluginContext => {
  const activeKind = mode === 'strict' ? telemetryPlugin.kind : riskPlugin.kind;
  return {
    mode,
    tenant: 'recovery-incident-lab',
    stage: toStage(mode),
    signature: `${namespace}:${mode}:chain:${plugins.length}`,
    activeKind,
    namespace,
  };
};

export const resolvePluginMetadata = <TPlugin extends ScenarioPlugin>(
  plugin: TPlugin,
): {
  readonly id: TPlugin['id'];
  readonly namespace: PluginNamespace;
  readonly kind: TPlugin['kind'];
} => ({
  id: plugin.id,
  namespace: plugin.namespace,
  kind: plugin.kind,
});
