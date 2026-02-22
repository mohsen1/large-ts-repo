import { fail, ok, type Result } from '@shared/result';
import { withBrand } from '@shared/core';
import type {
  CommandGraph,
  CommandGraphId,
  CommandSynthesisSnapshot,
  CommandSynthesisRecord,
  CommandExecutionSample,
  CommandGraphEvent,
} from './types';

export interface SnapshotCursorState {
  readonly cursor: string;
  readonly updatedAt: string;
}

export interface SnapshotLedger {
  readonly graphId: CommandGraphId;
  readonly graph: CommandGraph;
  readonly samples: readonly CommandExecutionSample[];
  readonly records: readonly CommandSynthesisRecord[];
}

export interface SnapshotWindow {
  readonly graphId: CommandGraphId;
  readonly since: string;
  readonly until: string;
  readonly limit: number;
}

export interface SnapshotBuildConfig {
  readonly tenant: string;
  readonly operator: string;
  readonly waveWindowMinutes: number;
  readonly sampleRateMs: number;
}

export interface GraphReadinessSignal {
  readonly resolved: number;
  readonly blocked: number;
  readonly warning: number;
  readonly critical: number;
}

const buildSignal = (graph: CommandGraph): GraphReadinessSignal => {
  const resolved = graph.nodes.filter((node) => node.state === 'resolved').length;
  const blocked = graph.nodes.filter((node) => node.state === 'blocked').length;
  const warning = graph.nodes.filter((node) => node.state === 'deferred').length;
  const critical = graph.nodes.filter((node) => node.metadata.labels.includes('critical')).length;
  return { resolved, blocked, warning, critical };
}

const toRiskScore = (signal: GraphReadinessSignal, nodeCount: number): number => {
  const blockedWeight = signal.blocked * 4 + signal.warning * 2 + signal.critical * 3;
  if (nodeCount <= 0) return 0;
  return Math.round((1 - blockedWeight / Math.max(nodeCount, 1)) * 100);
}

export const buildSynthesisSnapshot = (graph: CommandGraph): CommandSynthesisSnapshot => ({
  cursor: {
    graphId: graph.id,
    index: graph.nodes.length,
    windowStart: graph.createdAt,
    windowEnd: graph.updatedAt,
  },
  generatedAt: new Date().toISOString(),
  totalNodes: graph.nodes.length,
  blockedNodes: graph.nodes.filter((node) => node.state === 'blocked').length,
  riskScore: toRiskScore(
    buildSignal(graph),
    graph.nodes.length,
  ),
  criticalPathLength: Math.max(1, graph.waves.length),
  waveCoverage: Math.round(graph.waves.reduce((total, wave) => total + wave.commands.length, 0) / Math.max(graph.nodes.length, 1) * 100),
});

export const normalizeSnapshotCursor = (cursor: string): SnapshotCursorState => {
  return { cursor: cursor.trim(), updatedAt: new Date().toISOString() };
};

export const toWindow = (cursor: CommandGraphId, minutes: number): SnapshotWindow => {
  const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 15;
  const sinceDate = new Date(Date.now() - safeMinutes * 60_000);
  return {
    graphId: cursor,
    since: sinceDate.toISOString(),
    until: new Date().toISOString(),
    limit: 500,
  };
};

const createEventEnvelope = (
  graphId: CommandGraphId,
  type: CommandGraphEvent['eventType'],
  payload: Record<string, unknown>,
): CommandGraphEvent => ({
  id: withBrand(`${graphId}:${Date.now()}`, 'CommandGraphEventId'),
  graphId,
  traceId: withBrand(`${graphId}:${Date.now() + 7}`, 'CommandTraceId'),
  eventType: type,
  timestamp: new Date().toISOString(),
  payload,
});

const validateSampleWindow = (window: SnapshotWindow): Result<SnapshotWindow, Error> => {
  if (window.limit <= 0) return fail(new Error('invalid window limit'));
  if (window.until < window.since) return fail(new Error('invalid window order'));
  return ok(window);
};

export const buildLedger = (
  graph: CommandGraph,
  config: SnapshotBuildConfig,
  samples: readonly CommandExecutionSample[],
): Result<LedgerRecord, Error> => {
  const payload = buildSignal(graph);
  const snapshot = buildSynthesisSnapshot(graph);
  const window = validateWindow({
    graphId: graph.id,
    since: graph.createdAt,
    until: graph.updatedAt,
    limit: Math.max(1, Math.ceil(config.waveWindowMinutes * 2)),
  });
  if (!window.ok) return fail(window.error);

  const events: readonly CommandGraphEvent[] = [
    createEventEnvelope(graph.id, 'snapshot', {
      tenant: config.tenant,
      operator: config.operator,
      waveWindowMinutes: config.waveWindowMinutes,
      sampleRateMs: config.sampleRateMs,
      samples: samples.length,
      resolved: payload.resolved,
      blocked: payload.blocked,
      warning: payload.warning,
      critical: payload.critical,
    }),
  ];

  return ok({
    graphId: graph.id,
    graph,
    snapshot,
    events,
    records: [
      {
        id: withBrand(`${graph.id}:record:${Date.now()}`, 'CommandSynthesisRecordId'),
        graphId: graph.id,
        planId: withBrand(`${graph.id}:plan`, 'CommandPlanId'),
        runId: withBrand(`${graph.id}:run`, 'RecoveryRunId'),
        outcome: {
          graphId: graph.id,
          ready: payload.critical === 0 && payload.blocked === 0,
          conflicts: events.map((entry) => entry.eventType),
          criticalPaths: graph.waves.flatMap((wave) => wave.commands.map((command) => command.id)),
          readinessScore: toRiskScore(payload, graph.nodes.length),
          executionOrder: graph.nodes.map((node) => node.id),
          forecastMinutes: graph.waves.length * 3,
        },
        request: {
          tenant: config.tenant,
          operator: config.operator,
          reason: `window-${config.waveWindowMinutes}`,
        },
        createdAt: new Date().toISOString(),
      },
    ],
    samples,
    window: window.value,
  });
};

export const validateWindow = (window: SnapshotWindow): Result<SnapshotWindow, Error> => {
  if (window.limit <= 0) return fail(new Error('window limit must be positive'));
  if (window.until < window.since) return fail(new Error('window order is invalid'));
  return ok(window);
};

export const mergeWindows = (left: SnapshotWindow, right: SnapshotWindow): SnapshotWindow => ({
  graphId: left.graphId,
  since: left.since < right.since ? left.since : right.since,
  until: left.until > right.until ? left.until : right.until,
  limit: Math.min(2_000, Math.max(1, left.limit + right.limit)),
});

export interface SnapshotRecord extends SnapshotLedger {
  readonly events: readonly CommandGraphEvent[];
  readonly window: SnapshotWindow;
}

type LedgerRecord = SnapshotRecord;
