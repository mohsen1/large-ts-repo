import { z } from 'zod';
import {
  asTenantId,
  asWindowId,
  StreamHealthLevel,
  type StreamHealthSignal,
  type StreamSlaWindow,
} from '@domain/streaming-observability';
import {
  type AnyStreamingPlugin,
  type StreamingPlugin,
  createPluginManifest,
} from '@domain/streaming-observability';
import {
  type CommandRunbookId,
  createRunbookId,
  createSignalId,
  createTenantId,
  type RecoverySignal,
  type RecoverySignalId,
  type TenantId,
} from '@domain/recovery-stress-lab';
import { type StreamLabNormalizedSignal } from './types';

const pluginChannelSchema = z.object({
  tenant: z.string().min(1),
  namespace: z.string().min(3),
  profile: z.enum(['adaptive', 'conservative', 'agile']).default('adaptive'),
  maxSignals: z.number().int().positive().max(2_000).default(500),
  includeTopology: z.boolean().default(true),
});

const pluginTargetSchema = z.object({
  tenant: z.string().min(1),
  streamId: z.string().min(1),
  targetRunbooks: z.array(z.string().min(2)).default([]),
  pluginNames: z.array(z.string().min(3)).default([]),
});

type PluginChannelConfig = z.infer<typeof pluginChannelSchema>;
type PluginTargetConfig = z.infer<typeof pluginTargetSchema>;

interface SeedInput {
  readonly tenantId: TenantId;
  readonly streamId: string;
  readonly signals: readonly RecoverySignal[];
  readonly context: PluginChannelConfig;
}

interface SeedOutput {
  readonly tenantId: TenantId;
  readonly streamId: string;
  readonly signals: readonly StreamHealthSignal[];
  readonly signalIds: readonly RecoverySignalId[];
  readonly runbookIds: readonly CommandRunbookId[];
  readonly topologyFingerprint: string;
}

interface ScoreInput extends SeedOutput {
  readonly context: PluginChannelConfig;
}

interface ScoreOutput extends ScoreInput {
  readonly scores: readonly { readonly pluginId: string; readonly signalScore: number }[];
  readonly weightedScore: number;
}

interface RecommendationInput extends ScoreOutput {
  readonly targetConfig: PluginTargetConfig;
}

interface RecommendationOutput {
  readonly tenantId: TenantId;
  readonly streamId: string;
  readonly targetConfig: Omit<PluginTargetConfig, 'tenant'> & { tenant: TenantId };
  readonly recommendations: readonly {
    readonly runbook: CommandRunbookId;
    readonly confidence: number;
  }[];
  readonly window: StreamSlaWindow;
  readonly contextSummary: {
    readonly activePlugins: readonly string[];
    readonly profile: PluginChannelConfig['profile'];
  };
}

type PluginContext = Parameters<StreamingPlugin['run']>[1];

const sortNumeric = <T>(items: readonly T[], score: (item: T) => number): readonly T[] =>
  [...items].toSorted((left, right) => score(right) - score(left));

const uniqueList = <T extends string>(items: readonly T[]): readonly T[] =>
  Array.from(new Set(items));

const normalizeSignalLevel = (severity: RecoverySignal['severity']): StreamHealthLevel => {
  switch (severity) {
    case 'critical':
      return 'critical';
    case 'high':
    case 'medium':
      return 'warning';
    case 'low':
    default:
      return 'ok';
  }
};

const toNormalized = (signal: RecoverySignal): StreamLabNormalizedSignal => ({
  signalId: createSignalId(signal.id),
  className: signal.class,
  level: normalizeSignalLevel(signal.severity),
  score: signal.severity === 'critical' ? 4 : signal.severity === 'high' ? 3 : signal.severity === 'medium' ? 2 : 1,
  details: [signal.class, signal.title, signal.createdAt],
});

const buildRunbookIds = (target: PluginTargetConfig): readonly CommandRunbookId[] => {
  const workspace = uniqueList(target.targetRunbooks as readonly string[]);
  return sortNumeric(workspace, (entry) => entry.length).map((entry) => createRunbookId(entry));
};

const normalizePlugin = {
  ...createPluginManifest('seed-normalizer', 'ingest-plugin', '1.0.0'),
  consumes: ['stream-events'] as const,
  emits: ['stream-signals'] as const,
  async run(input: SeedInput, _context: PluginContext): Promise<SeedOutput> {
    const runbookIds = buildRunbookIds({
      tenant: String(input.tenantId),
      streamId: input.streamId,
      targetRunbooks: ['adaptive-policy'],
      pluginNames: [],
    });
    const sortedSignals = sortNumeric(input.signals, (signal) => (signal.severity === 'critical' ? 4 : signal.severity === 'high' ? 3 : 2));

    const streamSignals = sortedSignals.map((entry): StreamHealthSignal => {
      const normalized = toNormalized(entry);
      return {
        tenant: asTenantId(input.tenantId),
        streamId: input.streamId,
        level: normalized.level,
        score: Number((normalized.score / 4).toFixed(3)),
        details: [normalized.className, ...normalized.details],
        observedAt: new Date().toISOString(),
      };
    });

    return {
      tenantId: input.tenantId,
      streamId: input.streamId,
      signals: streamSignals,
      signalIds: streamSignals.map((signal, index) => createSignalId(`${input.streamId}-${index}`)),
      runbookIds,
      topologyFingerprint: `${input.tenantId}::${input.streamId}::${streamSignals.length}`,
    };
  },
} satisfies StreamingPlugin<'seed-normalizer', 'ingest-plugin', SeedInput, SeedOutput, ['stream-events'], ['stream-signals']>;

const scorePlugin = {
  ...createPluginManifest('score-normalizer', 'policy-plugin', '1.0.0'),
  consumes: ['stream-signals'] as const,
  emits: ['signal-score'] as const,
  async run(input: ScoreInput, _context: PluginContext): Promise<ScoreOutput> {
    const scores = sortNumeric(
      input.signals,
      (entry) => entry.score,
    ).map((entry): { pluginId: string; signalScore: number } => ({
      pluginId: entry.observedAt,
      signalScore: entry.score,
    }));

    const weighted = scores.reduce((acc, score) => acc + score.signalScore, 0) / Math.max(1, scores.length);

    return {
      ...input,
      scores: scores.slice(0, 25),
      weightedScore: Number(weighted.toFixed(6)),
    };
  },
} satisfies StreamingPlugin<'score-normalizer', 'policy-plugin', ScoreInput, ScoreOutput, ['stream-signals'], ['signal-score']>;

const recommendPlugin = {
  ...createPluginManifest('policy-reco', 'topology-plugin', '1.0.0'),
  consumes: ['signal-score'] as const,
  emits: ['policy-recommendation'] as const,
  async run(input: RecommendationInput, context: PluginContext): Promise<RecommendationOutput> {
    const targetRunbooks = input.targetConfig.targetRunbooks as readonly string[];
    const runbookCandidates = sortNumeric(targetRunbooks, (runbook) => runbook.length).map((runbook, index) => ({
      runbook: createRunbookId(runbook),
      confidence: Number(
        Math.max(0, Math.min(1, 1 - index * 0.08 + input.weightedScore * 0.1)).toFixed(4),
      ),
    }));

      const targetWindow: StreamSlaWindow = {
      windowId: asWindowId(`${context.tenant}::${input.streamId}::${context.traceId}`),
      window: {
        start: Date.now() - 30_000,
        end: Date.now(),
      },
      targetMs: 120,
      actualMs: 120 - Math.round(input.weightedScore),
      violated: input.weightedScore > 2.6,
    };

    const activePlugins = uniqueList(context.scope.split(':'));
    const profile = STREAMLAB_CONFIGURATION.channel.profile;

      return {
      tenantId: input.tenantId,
      streamId: input.streamId,
      targetConfig: {
        ...input.targetConfig,
        tenant: createTenantId(input.targetConfig.tenant),
      },
      recommendations: runbookCandidates.map((entry) => ({
        runbook: entry.runbook,
        confidence: entry.confidence,
      })),
      window: targetWindow,
      contextSummary: {
        activePlugins,
        profile,
      },
    };
  },
} satisfies StreamingPlugin<
  'policy-reco',
  'topology-plugin',
  RecommendationInput,
  RecommendationOutput,
  ['signal-score'],
  ['policy-recommendation']
>;

export const STRESS_LAB_PLUGIN_STACK = [
  normalizePlugin,
  scorePlugin,
  recommendPlugin,
] as const satisfies readonly AnyStreamingPlugin[];

export const STREAMLAB_CONFIGURATION: {
  readonly channel: PluginChannelConfig;
  readonly target: PluginTargetConfig;
} = {
  channel: pluginChannelSchema.parse({
    tenant: 'tenant-main',
    namespace: 'stream-lab',
    profile: 'adaptive',
    maxSignals: 500,
    includeTopology: true,
  }),
  target: pluginTargetSchema.parse({
    tenant: 'tenant-main',
    streamId: 'core-stream',
    targetRunbooks: ['rb-7', 'rb-11'],
    pluginNames: ['seed-normalizer', 'score-normalizer', 'policy-reco'],
  }),
};

export type StressLabStackInput = SeedInput;
export type StressLabStackOutput = RecommendationOutput;
