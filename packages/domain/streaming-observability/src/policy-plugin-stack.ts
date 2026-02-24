import { StreamEventRecord } from './event';
import {
  StreamHealthLevel,
  StreamHealthSignal,
  StreamSlaWindow,
  asTenantId,
  asWindowId,
} from './types';
import {
  StreamingPlugin,
  AnyStreamingPlugin,
  StreamingPluginContext,
  createPluginManifest,
} from './plugin-framework';

export interface SignalNormalizationInput {
  readonly streamId: string;
  readonly events: readonly StreamEventRecord[];
}

export interface SignalNormalizationOutput {
  readonly streamId: string;
  readonly signals: readonly StreamHealthSignal[];
  readonly warnings: readonly string[];
}

export interface TopologyEnrichmentInput extends SignalNormalizationOutput {}

export interface TopologyEnrichmentOutput {
  readonly streamId: string;
  readonly signals: readonly StreamHealthSignal[];
  readonly warnings: readonly string[];
  readonly topologyAlerts: readonly {
    readonly nodeId: string;
    readonly code: string;
    readonly message: string;
    readonly severity: 1 | 2 | 3 | 4 | 5;
  }[];
}

export interface PolicyDecisionInput extends TopologyEnrichmentOutput {}

export interface PolicyDecisionOutput {
  readonly streamId: string;
  readonly traceWindow: StreamSlaWindow;
  readonly signals: readonly StreamHealthSignal[];
  readonly warnings: readonly string[];
  readonly topologyAlerts: readonly {
    readonly nodeId: string;
    readonly code: string;
    readonly message: string;
    readonly severity: 1 | 2 | 3 | 4 | 5;
  }[];
  readonly recommendedScale: number;
  readonly healthState: StreamHealthLevel;
}

const calculateTopologies = (
  alerts: TopologyEnrichmentOutput['topologyAlerts'],
): {
  readonly severity: 1 | 2 | 3 | 4 | 5;
  readonly level: 'ok' | 'warning' | 'critical';
} => {
  const maxSeverity = Math.max(...alerts.map((alert) => alert.severity), 1);
  const critical = alerts.filter((alert) => alert.severity >= 4).length;
  const warning = alerts.filter((alert) => alert.severity === 3).length;
  const score = maxSeverity as 1 | 2 | 3 | 4 | 5;
  return {
    severity: score,
    level: critical > 0 ? 'critical' : warning > 0 ? 'warning' : 'ok',
  };
};

const signalNormalizer = {
  ...createPluginManifest('signal-normalizer', 'ingest-plugin', '1.0.0'),
  consumes: ['stream-events'] as const,
  emits: ['stream-signals'] as const,
  async run(input: SignalNormalizationInput, _context: StreamingPluginContext) {
    const warnings: string[] = [];
    const signals = input.events.map((event): StreamHealthSignal => ({
      tenant: asTenantId(input.streamId),
      streamId: event.streamId,
      level: event.severity >= 4 ? 'critical' : event.severity >= 2 ? 'warning' : 'ok',
      score: Number(Math.max(0.1, Math.min(1, event.severity / 5)).toFixed(3)),
      details: [event.eventType, ...Object.keys(event.metadata)],
      observedAt: event.sampleAt,
    }));
    return {
      streamId: input.streamId,
      signals,
      warnings,
    } satisfies SignalNormalizationOutput;
  },
} as const satisfies StreamingPlugin<
  'signal-normalizer',
  'ingest-plugin',
  SignalNormalizationInput,
  SignalNormalizationOutput,
  ['stream-events'],
  ['stream-signals']
>;

const topologyEnricher = {
  ...createPluginManifest('topology-enricher', 'topology-plugin', '1.2.1'),
  consumes: ['stream-signals'] as const,
  emits: ['topology-alerts'] as const,
  async run(input: TopologyEnrichmentInput, _context: StreamingPluginContext) {
    const nodeCount = Math.max(1, Math.round(input.signals.length / 2));
    const topologyAlerts = input.signals.slice(0, nodeCount).map((signal, index) => {
      const severity: 1 | 2 | 3 | 4 | 5 = signal.level === 'critical'
        ? 4
        : signal.level === 'warning'
          ? 2
          : 1;
      return {
        nodeId: `${input.streamId}::${index + 1}`,
        code: signal.level === 'critical' ? 'POLICY-CRITICAL' : 'POLICY-INFO',
        message: `${signal.streamId} has ${signal.level} signal`,
        severity,
      } satisfies TopologyEnrichmentOutput['topologyAlerts'][number];
    });
    return {
      streamId: input.streamId,
      signals: input.signals,
      warnings: input.warnings,
      topologyAlerts,
    } satisfies TopologyEnrichmentOutput;
  },
} as const satisfies StreamingPlugin<
  'topology-enricher',
  'topology-plugin',
  TopologyEnrichmentInput,
  TopologyEnrichmentOutput,
  ['stream-signals'],
  ['topology-alerts']
>;

const policyDecider = {
  ...createPluginManifest('policy-decider', 'policy-plugin', '2.0.0'),
  consumes: ['topology-alerts', 'signals'] as const,
  emits: ['policy-score'] as const,
  async run(input: PolicyDecisionInput, _context: StreamingPluginContext) {
    const criticalCount = input.signals.filter((signal) => signal.level === 'critical').length;
    const warningCount = input.signals.filter((signal) => signal.level === 'warning').length;
    const severityBucket = input.topologyAlerts.map((alert) => alert.severity);
    const health = calculateTopologies(input.topologyAlerts);
    const baseScale = severityBucket.length > 0
      ? Math.max(1, Math.round(severityBucket.reduce((acc: number, next: number) => acc + next, 0) / severityBucket.length))
      : 1;
    const warnings = [...input.warnings];
    if (warningCount > criticalCount) {
      warnings.push(`warning signals ${warningCount} exceed critical balance`);
    }
    return {
      streamId: input.streamId,
      signals: input.signals,
      warnings,
      topologyAlerts: input.topologyAlerts,
      traceWindow: {
        windowId: asWindowId(`window-${input.streamId}`),
        window: {
          start: Date.now() - 60_000,
          end: Date.now(),
        },
        targetMs: 120,
        actualMs: 130,
        violated: health.level === 'critical',
      },
      recommendedScale: Math.max(1, baseScale + criticalCount - warningCount),
      healthState: health.level,
    } satisfies PolicyDecisionOutput;
  },
} as const satisfies StreamingPlugin<
  'policy-decider',
  'policy-plugin',
  PolicyDecisionInput,
  PolicyDecisionOutput,
  ['topology-alerts', 'signals'],
  ['policy-score']
>;

export const STREAMING_POLICY_PLUGIN_STACK = [
  signalNormalizer,
  topologyEnricher,
  policyDecider,
] as const satisfies readonly AnyStreamingPlugin[];

export type StreamingPolicyPlugins = typeof STREAMING_POLICY_PLUGIN_STACK;
export type PolicyPluginInput = StreamingPolicyPlugins[0] extends {
  run: (input: infer TInput, ...args: any[]) => any;
} ? TInput : never;
export type PolicyPluginOutput = StreamingPolicyPlugins[number] extends StreamingPlugin<any, any, any, infer TOutput, any, any> ? TOutput : never;

export const DEFAULT_POLICY_PLUGIN_MAP = STREAMING_POLICY_PLUGIN_STACK.reduce(
  (acc, plugin) => ({
    ...acc,
    [plugin.name]: plugin,
  }),
  {} as {
    [K in StreamingPolicyPlugins[number] as K['name']]: K;
  },
);

export interface StreamPolicyDecisionRecord {
  readonly pluginName: string;
  readonly streamId: string;
  readonly severityLevel: StreamHealthLevel;
  readonly recommendedScale: number;
  readonly warnings: readonly string[];
}

export const collectPolicyDecision = (
  output:
    | PolicyDecisionOutput
    | (Pick<PolicyDecisionOutput, 'streamId' | 'recommendedScale' | 'warnings'>
    & { severityLevel: StreamHealthLevel; healthState?: never })
    | (Pick<PolicyDecisionOutput, 'streamId' | 'recommendedScale' | 'warnings' | 'healthState'> & { severityLevel?: never }),
): StreamPolicyDecisionRecord => ({
  pluginName: 'policy-decider',
  streamId: output.streamId,
  severityLevel: 'healthState' in output
    ? (output as PolicyDecisionOutput).healthState
    : output.severityLevel,
  recommendedScale: output.recommendedScale,
  warnings: output.warnings,
});
