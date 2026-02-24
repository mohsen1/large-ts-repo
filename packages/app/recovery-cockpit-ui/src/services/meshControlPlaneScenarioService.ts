import { buildPluginDefinition, buildPluginVersion, canonicalizeNamespace, type PluginContext, type PluginDefinition, type PluginDependency, type PluginKind } from '@shared/stress-lab-runtime';
import { parseMeshSeed, type MeshLane, type MeshMode, type MeshRunSeed, type MeshRunEnvelope, resolveManifestForLane } from '@shared/orchestration-lab-core';
import {
  createMeshControlPlan,
  compileExecutionPlan,
  executeControlPlan,
  type ControlPlaneCommand,
  type ControlPlaneConfig,
  type ControlPlaneLane,
  type MeshControlPlaneLaneWeights,
  type MeshControlPlaneResult,
} from '@shared/mesh-control-plane';
import { parseMeshManifest } from '@shared/orchestration-lab-core';
import { z } from 'zod';

const pluginDependency = (id: string): PluginDependency => `dep:${id}` as PluginDependency;

type PluginOutput<TPayload extends object = object> = {
  readonly command: string;
  readonly payload: TPayload;
  readonly generatedAt: string;
};

interface MeshControlPluginContext {
  readonly controlLane: MeshLane;
  readonly controlMode: MeshMode;
  readonly commandPhase: string;
}

interface MeshControlPlanInput {
  readonly tenantId: string;
  readonly lane: MeshLane;
  readonly mode: MeshMode;
  readonly commands: readonly ControlPlaneCommand[];
  readonly weights: readonly MeshControlPlaneLaneWeights[];
}

const controlSeedSchema = z.object({
  tenantId: z.string(),
  lane: z.string(),
  mode: z.string(),
  selectedSignals: z.array(z.string()),
  constraints: z.array(z.string()),
});

type MeshControlInput = {
  readonly seed: MeshRunSeed;
  readonly manifest: ReturnType<typeof resolveManifestForLane>;
  readonly commandSet: readonly string[];
};

const withRunId = (seed: MeshRunSeed): string => `${seed.tenantId}::${seed.lane}::${seed.mode}::${seed.source}`;
const resolveControlMode = (rawMode: string, lane: MeshLane, scenario: string): MeshMode => {
  if (
    rawMode === 'discovery' ||
    rawMode === 'control' ||
    rawMode === 'simulation' ||
    rawMode === 'policy-what-if'
  ) {
    return rawMode;
  }
  if (rawMode === 'policy') {
    return 'policy-what-if';
  }
  if (scenario.includes('simulation')) {
    return 'simulation';
  }
  if (scenario.includes('policy')) {
    return 'policy-what-if';
  }
  return lane === 'simulation' ? 'simulation' : 'control';
};

const makePlugin = <const TPayload extends MeshControlPluginContext & Record<string, unknown>, const TOutput extends PluginOutput<Record<string, unknown>>>(
  name: string,
  lane: MeshLane,
  dependencies: readonly PluginDependency[],
  run: (context: MeshControlPluginContext, payload: TPayload) => Promise<TOutput>,
): PluginDefinition => {
  const namespace = canonicalizeNamespace(`control-plane:${lane}`);
  const kind = `mesh-control/${lane}` as PluginKind;
  return buildPluginDefinition(namespace, kind, {
    name,
    version: buildPluginVersion(1, 0, 0),
    tags: [name, lane],
    dependencies,
    pluginConfig: {
      lane,
      commandPhase: 'bootstrap',
    } as Record<string, unknown>,
    run: async (_context: PluginContext<Record<string, unknown>>, rawPayload: unknown) => {
      const context = {
        controlLane: lane,
        controlMode: 'control',
        commandPhase: 'bootstrap',
      } satisfies MeshControlPluginContext;
      const typedPayload = rawPayload as TPayload;
      const output = await run(context, typedPayload);
      return {
        ok: true,
        value: output,
        generatedAt: new Date().toISOString(),
      };
    },
  }) as unknown as PluginDefinition;
};

const toWeightedCommand = (command: ControlPlaneCommand, index: number): MeshControlPlaneLaneWeights => ({
  lane: command.command.startsWith('cp:') ? 'signal' : 'policy',
  weight: Number(((index + 1) / 10).toFixed(2)),
});

const buildBasePlugins = (seed: MeshRunSeed): readonly PluginDefinition[] => {
  const parsed = parseMeshSeed(seed);
  const context = {
    controlLane: parsed.lane,
    controlMode: parsed.mode,
    commandPhase: 'bootstrap',
  } satisfies MeshControlPluginContext;

  const parse = makePlugin(
    `mesh-control-${parsed.lane}-parse`,
    parsed.lane,
    [],
    async (_context, payload) => ({
      command: 'mesh.control.parse',
      payload: {
        ...payload,
        manifest: parseMeshManifest({
          namespace: parsed.tenantId,
          activeLane: parsed.lane,
          activeMode: parsed.mode,
          pluginCount: 0,
          tags: ['control-plane'],
          constraints: [],
        }),
      },
      generatedAt: new Date().toISOString(),
    }),
  );

  const enrich = makePlugin(
    `mesh-control-${parsed.lane}-enrich`,
    parsed.lane,
    [pluginDependency(parse.id)],
    async (_context, payload) => ({
      command: 'mesh.control.enrich',
      payload: {
        ...context,
        ...payload,
        tenantId: parsed.tenantId,
        constraints: parsed.selectedSignals.length,
        manifestFingerprint: JSON.stringify(payload),
      },
      generatedAt: new Date().toISOString(),
    }),
  );

  const output = makePlugin(
    `mesh-control-${parsed.lane}-output`,
    parsed.lane,
    [pluginDependency(enrich.id)],
    async (_context, payload) => ({
      command: 'mesh.control.output',
      payload: {
        ...payload,
        score: Number((Math.max(1, parsed.selectedSignals.length) / Math.max(1, context.commandPhase.length)).toFixed(6)),
        confidence: 0.77,
      },
      generatedAt: new Date().toISOString(),
    }),
  );

  return [parse, enrich, output];
};

const buildPlanInput = (seed: MeshRunSeed): MeshControlPlanInput => {
  const commands: readonly ControlPlaneCommand[] = compileExecutionPlan([
    { command: 'cp:start', payload: { phase: 'bootstrap', seed: withRunId(seed) } },
    { command: 'cp:pause', payload: { phase: 'throttle', limit: seed.selectedSignals.length } },
    { command: 'cp:start', payload: { phase: 'run', limit: seed.lane } },
    { command: 'cp:close', payload: { phase: 'close', score: seed.selectedSignals.length } },
  ]).map((entry) => entry.command);

  return {
    tenantId: seed.tenantId,
    lane: seed.lane,
    mode: seed.mode,
    commands,
    weights: commands.map((command, index) => ({
      lane: (command.command === 'cp:start' ? 'topology' : 'signal') as MeshLane,
      weight: `${seed.lane}:${seed.mode}`.length + index + 0.5,
    })),
  };
};

const normalizeSignals = (signals: readonly string[], max = 8): readonly string[] => {
  const unique = new Set(signals.filter((signal) => signal.trim().length > 0).map((signal) => signal.toLowerCase()));
  return [...unique].slice(0, max).toSorted();
};

const toControlConfig = (tenantId: string, lane: ControlPlaneLane): ControlPlaneConfig => ({
  namespace: `${tenantId}::${lane}`,
  lane,
  mode: 'control',
  enabled: true,
  maxParallelism: 4,
  throttleWindowMs: 0,
  window: {
    from: new Date().toISOString(),
    to: new Date(Date.now() + 60_000).toISOString(),
    timezone: 'utc',
  },
  artifacts: {
    enabled: false,
  },
  tags: ['mesh', 'control-plane'],
});

const normalizePlan = <TCommands extends readonly ControlPlaneCommand[]>(
  commands: TCommands,
): readonly ControlPlaneCommand[] =>
  compileExecutionPlan(commands)
    .toSorted((left, right) => left.order - right.order)
    .map((entry) => entry.command);

const toSessionId = (input: Pick<MeshRunSeed, 'tenantId'> & { readonly mode: string }): string =>
  `${input.tenantId}::${input.mode}::${Date.now()}` as const;

export interface MeshControlExecutionRequest {
  readonly tenantId: string;
  readonly lane: MeshLane;
  readonly mode: MeshMode;
  readonly selectedSignals: readonly string[];
}

export interface MeshControlExecutionResult {
  readonly runId: string;
  readonly score: number;
  readonly confidence: number;
  readonly ok: boolean;
  readonly lanes: readonly string[];
  readonly traces: readonly string[];
  readonly metadata: {
    readonly route: MeshRunEnvelope['route'];
    readonly policyFingerprint: string;
    readonly telemetry: number;
  };
}

const resolvePlanPayload = (seed: MeshRunSeed): MeshControlInput => {
  const manifest = resolveManifestForLane(seed);
  const commandSet = manifest.tags.toSorted();
  return { seed, manifest, commandSet };
};

export const runMeshControlPlan = async (
  tenantId: string,
  scenario: string,
  rawSignals: readonly string[],
  rawMode: string,
): Promise<MeshControlExecutionResult> => {
  const signals = normalizeSignals(rawSignals);
  const resolvedMode = resolveControlMode(rawMode, scenario.includes('policy') ? 'policy' : 'signal', scenario);
  const parsed = controlSeedSchema.parse({
    tenantId,
    lane: scenario.includes('policy') ? 'policy' : 'signal',
    mode: resolvedMode,
    selectedSignals: signals,
    constraints: signals,
  }) as {
    readonly tenantId: string;
    readonly lane: MeshLane;
    readonly mode: MeshMode;
    readonly selectedSignals: readonly string[];
    readonly constraints: readonly string[];
  };

  const seed = parseMeshSeed({
    tenantId: parsed.tenantId,
    lane: parsed.lane,
    mode: parsed.mode,
    selectedSignals: parsed.selectedSignals,
    window: {
      from: new Date().toISOString(),
      to: new Date(Date.now() + 90_000).toISOString(),
      timezone: 'utc',
    },
    context: {
      constraints: parsed.constraints,
      scenario,
    },
    source: scenario,
  });
  const planInput = buildPlanInput(seed);
  const config = toControlConfig(tenantId, planInput.lane);
  const normalizedCommands = normalizePlan(planInput.commands);
  const plugins = buildBasePlugins(seed);

  const execution = await executeControlPlan(
    tenantId,
    plugins as never,
    seed,
    config,
    {
      commands: normalizedCommands,
      weights: normalizedCommands.map((command, index) => ({
        lane: (command.command.startsWith('cp:') ? 'policy' : (seed.lane as ControlPlaneLane)) as MeshLane,
        weight: index + 1,
      })),
    },
  );

  const result = execution.result;
  const profile = resolvePlanPayload(seed);
  const policyFingerprint = createMeshControlPlan({
    tenantId,
    manifestHint: {
      tenantId: tenantId as any,
      lane: seed.lane,
      mode: seed.mode,
      namespace: profile.commandSet.join('/'),
    },
    commands: profile.commandSet.map((command, index) => ({
      command: (index % 2 === 0 ? 'cp:start' : index % 2 === 1 ? 'cp:pause' : 'cp:close') as ControlPlaneCommand['command'],
      payload: { command },
    })),
    lanes: [{ lane: seed.lane, weight: 1 }],
  });

  if (result === undefined) {
    return {
      runId: toSessionId(seed),
      score: 0,
      confidence: 0,
      ok: false,
      lanes: [seed.lane],
      traces: ['no-result'],
      metadata: {
        route: profile.manifest.activeMode === 'control' ? 'mesh/signal/control' as MeshRunEnvelope['route'] : 'mesh/signal/policy' as MeshRunEnvelope['route'],
        policyFingerprint: buildMeshControlLaneFingerprint(policyFingerprint),
        telemetry: 0,
      },
    };
  }

  return {
    runId: result.snapshot.runId,
    score: result.snapshot.score,
    confidence: result.snapshot.confidence,
    ok: result.ok,
    lanes: policyFingerprint.lanes.map((entry) => entry.lane),
    traces: result.snapshot.events.map((entry) => `${entry.kind}:${entry.value}`),
    metadata: {
      route: profile.manifest.activeLane === seed.lane ? buildEnvelopeRoute(seed) : buildEnvelopeRoute(seed),
      policyFingerprint: buildMeshFingerprintFromResult(result),
      telemetry: result.telemetry.length,
    },
  };
};

export const buildCompatibilityRunInputs = (tenantId: string): readonly MeshControlExecutionRequest[] => {
  const modes = ['discovery', 'control', 'simulation', 'policy-what-if'] as const;
  const lanes: readonly MeshLane[] = ['signal', 'topology', 'policy', 'safety', 'simulation'];
  const pairs = modes.flatMap((mode) =>
    lanes.map((lane) => ({
      tenantId,
      lane,
      mode: mode as MeshMode,
      selectedSignals: [`${tenantId}-${mode}-${lane}`, `${tenantId}-${lane}-baseline`],
    })),
  );
  return pairs.filter((entry, index) => index < 16);
};

export const runMeshControlCompatibilityChecks = async (
  tenantId: string,
): Promise<readonly MeshControlExecutionResult[]> => {
  const requests = buildCompatibilityRunInputs(tenantId);
  const outputs = await Promise.all(
    requests.map(async (request) =>
      runMeshControlPlan(
        request.tenantId,
        `${request.mode}-${request.lane}`,
        request.selectedSignals,
        request.mode,
      ),
    ),
  );
  return outputs.toSorted((left, right) => right.score - left.score);
};

const buildMeshFingerprintFromResult = (result: MeshControlPlaneResult): string =>
  `${result.snapshot.runId}::${result.snapshot.score}::${result.snapshot.confidence}`;

const buildMeshControlLaneFingerprint = (plan: ReturnType<typeof createMeshControlPlan>): string =>
  `${plan.tenantId}::${plan.lanes.length}::${plan.commands.length}`;

const buildEnvelopeRoute = (seed: MeshRunSeed): MeshRunEnvelope['route'] =>
  `mesh/${seed.lane}/${seed.mode}` as MeshRunEnvelope['route'];
