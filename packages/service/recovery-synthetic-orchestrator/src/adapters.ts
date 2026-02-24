import {
  syntheticPhases,
  type SyntheticBlueprint,
  type SyntheticExecutionContext,
  type SyntheticPhase,
  type SyntheticPluginDefinition,
} from '@domain/recovery-synthetic-orchestration';
import { ok, fail, type Result } from '@shared/result';
import { createRunId } from '@data/recovery-synthetic-orchestration-store';

export interface AdapterManifest {
  readonly namespace: string;
  readonly versions: readonly string[];
}

export interface PluginAdapter<
  TInput = unknown,
  TOutput = unknown,
  TConfig extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly name: string;
  readonly create: (context: SyntheticExecutionContext) => Promise<SyntheticPluginDefinition<TInput, TOutput, TConfig>>;
}

interface BaseSyntheticInput {
  scenario: string;
  constraints: Record<string, unknown>;
  requestedBy: string;
  priority: string;
}

interface IngestOutput extends BaseSyntheticInput {
  synthesizedAt: string;
}

interface SynthesizeOutput extends IngestOutput {
  synthesizedOutputs: number;
}

interface SimulateOutput extends SynthesizeOutput {
  confidence: number;
  simulatedAt: string;
}

interface ActuateOutput extends SimulateOutput {
  executedAt: string;
  actor: string;
}

export const makeAdapter = <TInput, TOutput, TConfig extends Record<string, unknown>>(
  name: string,
  definition: SyntheticPluginDefinition<TInput, TOutput, TConfig>,
): Result<SyntheticPluginDefinition<TInput, TOutput, TConfig>, Error> => {
  try {
    const namespaced = `${definition.id}:v1:${name}` as any;
    return ok({
      ...definition,
      id: namespaced,
      domain: definition.domain,
      name,
      channel: definition.channel,
    });
  } catch (error) {
    return fail(error instanceof Error ? error : new Error('adapter-create-failed'));
  }
};

export const inferManifest = (blueprint: SyntheticBlueprint): AdapterManifest => ({
  namespace: blueprint.domain,
  versions: blueprint.tags.length ? blueprint.tags : ['v1'],
});

const asPriority = (raw: string): 'low' | 'medium' | 'high' | 'critical' => {
  if (raw === 'low' || raw === 'medium' || raw === 'high' || raw === 'critical') return raw;
  return 'medium';
};

export const buildDefaultPlugins = () => {
  const makePayload = async <T>(input: T): Promise<T> => input;

  const ingest: SyntheticPluginDefinition<BaseSyntheticInput, IngestOutput, { seed: number }, 'ingest'> = {
    id: 'synthetic.ingest' as any,
    domain: 'recovery-synthetic-orchestration' as any,
    name: 'ingest',
    phase: 'ingest',
    requires: [] as const,
    weight: 1,
    timeoutMs: 1_000,
    priority: 'medium',
    channel: 'recovery-synthetic-orchestration.plugin.ingest',
    metadata: { scope: 'inbound' },
    config: { seed: 1 },
  async execute(input, context) {
      const payload = await makePayload(input as BaseSyntheticInput);
      return {
        ok: true,
        payload: {
          ...payload,
          synthesizedAt: new Date().toISOString(),
        },
        diagnostics: [
          `tenant=${context.tenantId}`,
          `run=${context.runId}`,
          `actor=${context.actor}`,
        ],
        warnings: ['synthetic seed loaded'],
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      };
    },
  };

  const synthesize: SyntheticPluginDefinition<IngestOutput, SynthesizeOutput, { multiplier: number }, 'synthesize'> = {
    id: 'synthetic.synthesize' as any,
    domain: 'recovery-synthetic-orchestration' as any,
    name: 'synthesize',
    phase: 'synthesize',
    requires: ['synthetic.ingest' as any],
    weight: 2,
    timeoutMs: 1_500,
    priority: asPriority('high'),
    channel: 'recovery-synthetic-orchestration.plugin.synthesize',
    metadata: { scope: 'transform' },
    config: { multiplier: 2 },
  async execute(input, _context, _config) {
      const payload: SynthesizeOutput = {
        ...(input as IngestOutput),
        synthesizedOutputs: ((_config as { multiplier: number }).multiplier ?? 1) * syntheticPhases.length,
      };
      return {
        ok: true,
        payload,
        diagnostics: ['synthesis complete'],
        warnings: ['transform generated synthetic signal'],
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      };
    },
  };

  const simulate: SyntheticPluginDefinition<
    SynthesizeOutput,
    SimulateOutput,
    { samples: number },
    'simulate'
  > = {
    id: 'synthetic.simulate' as any,
    domain: 'recovery-synthetic-orchestration' as any,
    name: 'simulate',
    phase: 'simulate',
    requires: ['synthetic.synthesize' as any],
    weight: 3,
    timeoutMs: 2_000,
    priority: asPriority('critical'),
    channel: 'recovery-synthetic-orchestration.plugin.simulate',
    metadata: { scope: 'analysis' },
    config: { samples: 4 },
    async execute(input, context, config) {
      const payload: SimulateOutput = {
        ...(input as unknown as SynthesizeOutput),
        confidence: Math.min(0.99, (config.samples ?? 1) * 0.21),
        simulatedAt: new Date().toISOString(),
      };
      const diagnostics = [
        `tenant=${context.tenantId}`,
        `samples=${String(config.samples)}`,
      ];
      if (!context.traceTags.length) {
        return {
          ok: false,
          diagnostics: [...diagnostics, 'missing trace tags'],
          warnings: ['simulation degraded'],
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        };
      }
      return {
        ok: true,
        payload,
        diagnostics: [...diagnostics, 'simulation complete'],
        warnings: [],
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      };
    },
  };

  const actuate: SyntheticPluginDefinition<SimulateOutput, ActuateOutput, { target: string }, 'actuate'> = {
    id: 'synthetic.actuate' as any,
    domain: 'recovery-synthetic-orchestration' as any,
    name: 'actuate',
    phase: 'actuate',
    requires: ['synthetic.simulate' as any],
    weight: 4,
    timeoutMs: 2_200,
    priority: asPriority('low'),
    channel: 'recovery-synthetic-orchestration.plugin.actuate',
    metadata: { scope: 'effect' },
    config: { target: 'stability' },
    async execute(input, context, _config) {
      const payload: ActuateOutput = {
        ...(input as unknown as SimulateOutput),
        executedAt: new Date().toISOString(),
        actor: context.actor,
      };
      return {
        ok: true,
        payload,
        diagnostics: ['actuation complete'],
        warnings: [],
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      };
    },
  };

  return [ingest, synthesize, simulate, actuate] as const;
};

export const mapToRunId = (tenantId: string, workspaceId: string, suffix: string): string =>
  createRunId(tenantId, workspaceId, suffix);
