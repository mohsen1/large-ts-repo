import { NoInfer } from '@shared/type-level';
import {
  type ConductorPluginDefinition,
  runConductorStream,
  type OrchestrationInput,
  type OrchestrationEvent,
  createAsyncDisposableStack,
  ConductorPluginRegistry,
} from '@shared/recovery-orchestration-runtime';
import {
  asTenantId,
  scenarioCatalogParsed,
  type ScenarioBlueprint,
  type ScenarioId,
  type ScenarioInput,
  type ScenarioOutput,
  type ScenarioRunConfig,
  runNamespace,
  type StepClass,
  type TenantId,
  type ScenarioRunSignature,
} from './contracts';
import { buildSyntheticPlugins } from './registry';

export type TelemetryFrame = {
  readonly pluginId: string;
  readonly phase: StepClass;
  readonly stage: number;
  readonly payload: unknown;
  readonly diagnostics: readonly string[];
  readonly durationHintMs: number;
};

type SummarizedTelemetry = {
  readonly pluginCount: number;
  readonly topPlugin: string;
  readonly frameCount: number;
  readonly avgDiagnostics: number;
};

type ScenarioEnvelope = {
  readonly id: string;
  readonly tenant: string;
  readonly namespace: string;
  readonly signature: ScenarioRunSignature;
  readonly scenario: ScenarioId;
};

type PluginTraceConfig = ScenarioRunConfig<Record<string, unknown>>;

type PluginCountInput = readonly ConductorPluginDefinition[];

export const pluginRegistryManifest = (tenant: TenantId): { readonly pluginCount: number; readonly namespace: string; readonly mode: ScenarioRunConfig['mode'] } => ({
  pluginCount: 4,
  namespace: `${tenant}`,
  mode: 'simulate',
});

const countPlugins = (definitions: PluginCountInput): number => definitions.length;

const isStepClass = (phase: string): phase is StepClass =>
  phase === 'assess' || phase === 'simulate' || phase === 'actuate' || phase === 'verify';

const eventDiagnosticsScore = (event: OrchestrationEvent<ScenarioOutput>): number => event.diagnostics.length;

export const collectTelemetry = async <TConfig extends Record<string, unknown>>(
  scenario: ScenarioBlueprint,
  config: NoInfer<TConfig> & PluginTraceConfig,
): Promise<readonly TelemetryFrame[]> => {
  const plugins = buildSyntheticPlugins(scenario, config);
  const registry = ConductorPluginRegistry.create(plugins);
  const input: OrchestrationInput<ScenarioInput, ScenarioOutput> = {
    tenantId: scenario.tenant,
    namespace: runNamespace(asTenantId(scenario.tenant)) as never,
    runIdSeed: `telemetry:${scenario.id}:${config.actor}`,
    registry,
    phaseOrder: ['assess', 'simulate', 'actuate', 'verify'],
    input: {
      input: scenario.id,
      requestedBy: config.actor,
      context: {
        actor: config.actor,
        mode: config.mode,
      },
    },
  } as OrchestrationInput<ScenarioInput, ScenarioOutput>;

  const frames: TelemetryFrame[] = [];
  await using stack = createAsyncDisposableStack();
  stack.use({
    [Symbol.asyncDispose]: () => {
      frames.push({
        pluginId: 'telemetry-stack',
        phase: 'verify',
        stage: 0,
        payload: undefined,
        diagnostics: ['telemetry-stack-shutdown'],
        durationHintMs: 2,
      });
      return Promise.resolve();
    },
  });

  for await (const event of runConductorStream(input)) {
    if (event.type === 'progress') {
      frames.push({
        pluginId: event.pluginId,
        phase: event.phase as StepClass,
        stage: event.stage,
        payload: event.payload,
        diagnostics: event.diagnostics,
        durationHintMs: eventDiagnosticsScore(event) * 4,
      });
    } else {
      frames.push({
        pluginId: `complete:${event.phase}`,
        phase: event.phase as StepClass,
        stage: event.stage,
        payload: event.payload,
        diagnostics: event.diagnostics,
        durationHintMs: eventDiagnosticsScore(event) * 5,
      });
    }
  }

  return frames;
};

export const summarizeTelemetry = (frames: readonly TelemetryFrame[]): SummarizedTelemetry => {
  const pluginSet = new Set(frames.map((frame) => frame.pluginId));
  const byPlugin = new Map<string, number>();

  for (const frame of frames) {
    byPlugin.set(frame.pluginId, (byPlugin.get(frame.pluginId) ?? 0) + 1);
  }

  let topPlugin = 'n/a';
  let maxFrames = 0;
  for (const [pluginId, score] of byPlugin) {
    if (score > maxFrames) {
      topPlugin = pluginId;
      maxFrames = score;
    }
  }

  const totalDiagnostics = frames.reduce((acc, frame) => acc + frame.diagnostics.length, 0);
  return {
    pluginCount: pluginSet.size,
    topPlugin,
    frameCount: frames.length,
    avgDiagnostics: frames.length === 0 ? 0 : totalDiagnostics / frames.length,
  };
};

export const collectScenarioTimeline = (event: OrchestrationEvent<ScenarioOutput>): readonly {
  phase: StepClass;
  stage: number;
  at: number;
}[] => [
  {
    phase: isStepClass(event.phase) ? event.phase : 'verify',
    stage: event.type === 'progress' ? event.stage : event.stage + 1,
    at: Date.now(),
  },
];

export const collectTenantAudit = async (tenant: TenantId, actor: string) => {
  const entries = scenarioCatalogParsed.filter((scenario) => scenario.tenant === tenant);
  const audit = await Promise.all(
    entries.map(async (scenario) => {
      const frames = await collectTelemetry(scenario, {
        mode: 'simulate',
        actor,
        weights: {
          tenant,
          stage: 0,
        },
      });
      return {
        scenario: scenario.id,
        summary: summarizeTelemetry(frames),
        frames,
      };
    }),
  );

  return audit;
};

export const collectAllTelemetry = async () => {
  const byPhase = new Map<StepClass, number>([
    ['assess', 0],
    ['simulate', 0],
    ['actuate', 0],
    ['verify', 0],
  ]);

  const frames = (await Promise.all(
    scenarioCatalogParsed.map(async (scenario) =>
      collectTelemetry(scenario, {
        mode: 'simulate',
        actor: 'telemetry',
        weights: {
          scenario: scenario.id,
          tenant: scenario.tenant,
        },
      }),
    ),
  )).flat();

  return frames
    .filter((frame): frame is TelemetryFrame & { phase: StepClass } => isStepClass(frame.phase))
    .map((frame) => {
      byPhase.set(frame.phase, (byPhase.get(frame.phase) ?? 0) + frame.diagnostics.length);
      return {
        pluginId: frame.pluginId,
        phase: frame.phase,
        stage: frame.stage,
      };
    });
};

export const collectScenarioEnvelope = async (
  tenant: TenantId,
): Promise<ScenarioEnvelope | undefined> => {
  const scenario = scenarioCatalogParsed.find((entry) => entry.tenant === tenant);
  if (scenario === undefined) {
    return undefined;
  }

  const firstRun = await collectTelemetry(scenario, {
    mode: 'simulate',
    actor: `audit:${tenant}`,
    weights: {
      source: tenant,
    },
  });

  return {
    id: `catalog:${scenario.id}`,
    tenant: scenario.tenant,
    namespace: runNamespace(asTenantId(scenario.tenant)),
    scenario: scenario.id,
    signature: `${firstRun.length}` as ScenarioRunSignature,
  };
};

export const telemetryPluginIndex = (frames: readonly TelemetryFrame[]): ReadonlyMap<string, number> => {
  const output = new Map<string, number>();
  for (const frame of frames) {
    output.set(frame.pluginId, (output.get(frame.pluginId) ?? 0) + 1);
  }
  return output;
};

export const estimateTelemetryLoad = (frames: readonly TelemetryFrame[]): number =>
  frames.reduce((acc, frame) => acc + frame.durationHintMs, 0);

export const rankedBySignal = (frames: readonly TelemetryFrame[]): readonly string[] => {
  const keyed = telemetryPluginIndex(frames);
  return [...keyed.entries()]
    .toSorted((left, right) => right[1] - left[1])
    .map(([pluginId]) => pluginId);
};
