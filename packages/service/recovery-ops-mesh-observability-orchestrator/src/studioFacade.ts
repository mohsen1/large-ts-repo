import { randomUUID } from 'node:crypto';
import { withBrand } from '@shared/core';
import {
  NoInfer,
  createPluginSession,
} from '@shared/type-level';
import {
  analyzeTopology,
} from './observabilityEngine';
import type { ObservabilityReport } from './types';
import { parseObservabilitySignals } from './types';
import {
  collectObservabilityCursor,
  collectSignals,
  InMemoryObservabilityStore,
  isObservationRecord,
  type RecordCursor,
  type ObservabilityEventRecord,
} from '@data/recovery-ops-mesh-observability-store';
import { runWithQueue } from '@service/recovery-ops-mesh-engine';
import {
  parseTopology,
  type MeshPayloadFor,
  type MeshPlanId,
  type MeshRunId,
  type MeshSignalKind,
  type MeshTopology,
} from '@domain/recovery-ops-mesh';
import { isAlertRecord } from '@data/recovery-ops-mesh-observability-store';
import type { Result } from '@shared/result';

interface StudioSignalSeed<TSignal extends MeshSignalKind = MeshSignalKind> {
  readonly kind: TSignal;
  readonly value: number;
}

const defaultSignals = ['pulse', 'snapshot', 'telemetry', 'alert'] as const satisfies readonly MeshSignalKind[];

type BuildPayload<TSignal extends MeshSignalKind> = TSignal extends 'pulse'
  ? { readonly value: number }
  : TSignal extends 'snapshot'
    ? MeshTopology
    : TSignal extends 'alert'
      ? { readonly severity: 'low' | 'normal' | 'high' | 'critical'; readonly reason: string }
      : { readonly metrics: Record<string, number> };

export interface StudioRunInput<TSignals extends readonly MeshSignalKind[] = readonly MeshSignalKind[]> {
  readonly topologySeed: Parameters<typeof parseTopology>[0];
  readonly signals: NoInfer<TSignals>;
  readonly namespace?: string;
  readonly namespaceSeed?: string;
}

interface StudioRunMeta {
  readonly namespace: string;
  readonly count: number;
  readonly startedAt: number;
}

interface StudioRunItem {
  readonly kind: MeshSignalKind;
  readonly signal: MeshPayloadFor<MeshSignalKind>;
  readonly runId: MeshRunId;
  readonly report: ObservabilityReport;
}

export interface StudioRunResult<TSignals extends readonly MeshSignalKind[] = readonly MeshSignalKind[]> {
  readonly id: string;
  readonly topology: MeshTopology;
  readonly planId: MeshPlanId;
  readonly reportKinds: readonly TSignals[number][];
  readonly items: readonly StudioRunItem[];
  readonly events: readonly ObservabilityEventRecord[];
  readonly history: readonly string[];
  readonly alerts: readonly string[];
  readonly createdAt: number;
  readonly snapshotToken: string;
  readonly meta: StudioRunMeta;
}

const buildSignal = (
  topology: MeshTopology,
  kind: MeshSignalKind,
  value: number,
): MeshPayloadFor<MeshSignalKind> => {
  if (kind === 'pulse') {
    return {
      kind,
      payload: { value },
    };
  }

  if (kind === 'snapshot') {
    const snapshotTopology = parseTopology({
      id: withBrand(`snapshot-${topology.id}-${value}`, 'MeshPlanId'),
      name: `snapshot-${topology.id}-${value}`,
      version: topology.version,
      nodes: topology.nodes,
      links: topology.links,
      createdAt: Date.now(),
    });

    return {
      kind,
      payload: snapshotTopology,
    };
  }

  if (kind === 'alert') {
    return {
      kind,
      payload: {
        severity: value > 6 ? 'critical' : 'normal',
        reason: `${topology.id}:${value}`,
      },
    };
  }

  return {
    kind,
    payload: {
      metrics: {
        [topology.id]: Math.max(0, value),
      },
    },
  };
};

const toSignals = <TSignals extends readonly MeshSignalKind[]>(
  signals: NoInfer<TSignals>,
): NoInfer<TSignals> =>
  signals.length === 0 ? (defaultSignals as unknown as NoInfer<TSignals>) : signals;

const splitSignals = <TSignals extends readonly MeshSignalKind[]>(
  signals: TSignals,
): readonly [readonly MeshSignalKind[], readonly MeshSignalKind[]] => {
  const normalized = signals.length === 0 ? defaultSignals : signals;
  if (normalized.length === 0) {
    return [[], []] as const;
  }
  const [first, ...rest] = normalized;
  return [[first, ...rest], rest] as const;
};

const buildRunInput = <TSignal extends MeshSignalKind>(
  kind: TSignal,
  topology: MeshTopology,
  value: number,
): StudioSignalSeed<TSignal> => ({
  kind,
  value: (value + topology.nodes.length) % 100,
});

const toSeedPayload = <TSignal extends MeshSignalKind>(
  topology: MeshTopology,
  seed: StudioSignalSeed<TSignal>,
): MeshPayloadFor<MeshSignalKind> => buildSignal(topology, seed.kind, seed.value);

const collectHistoryLines = async (
  signals: Result<readonly ObservabilityEventRecord[], Error>,
  planId: MeshPlanId,
  cursor: RecordCursor,
): Promise<readonly string[]> => {
  if (!signals.ok) {
    return [`history:${planId}:missing:${signals.error.message}`];
  }

  const entries = signals.value.map((event) => {
    const at = isObservationRecord(event) ? event.at : event.emittedAt;
    return isObservationRecord(event)
      ? `signal:${event.signal.kind}:${at}:${event.id}`
      : `alert:${event.alert}:${at}:${event.id}`;
  });

  return [...entries, cursor.token].toSorted((left, right) => right.localeCompare(left));
};

export const withObservabilityStudio = async <TReturn>(
  namespace: string,
  handler: (store: InMemoryObservabilityStore) => Promise<TReturn>,
): Promise<TReturn> => {
  const store = new InMemoryObservabilityStore();
  const lease = createPluginSession([], { name: namespace, capacity: 64 });

  await using stack = new AsyncDisposableStack();
  stack.defer(() => {
    lease[Symbol.dispose]();
  });
  stack.defer(async () => {
    await store[Symbol.asyncDispose]();
  });

  return await handler(store);
};

export const runStudioBatch = async <TSignals extends readonly MeshSignalKind[]>(
  input: StudioRunInput<TSignals>,
): Promise<StudioRunResult<TSignals>> => {
  const runSignals = toSignals(input.signals);
  const topology = parseTopology(input.topologySeed);
  const namespace = input.namespace ?? `mesh-studio-${topology.id}`;
  const namespaceSeed = input.namespaceSeed ?? randomUUID();
  const session = createPluginSession([], { name: `${namespace}-workspace`, capacity: 16 });

  return withObservabilityStudio(namespace, async (store) => {
    const [orderedSignals] = splitSignals(runSignals);
    const ordered = orderedSignals.length > 0 ? orderedSignals : defaultSignals;
    const reportKinds = parseObservabilitySignals(ordered);
    const batchItems: StudioRunItem[] = [];
    const alerts: string[] = [];
    const startedAt = Date.now();

    for (const [index, kind] of ordered.entries()) {
      const seed = buildRunInput(kind, topology, index + 1);
      const signal = toSeedPayload(topology, seed);
      const runId = withBrand(`${namespaceSeed}-${seed.kind}-${index}-${randomUUID()}`, 'MeshRunId');
  const source = withBrand(`${namespace}-source-${topology.id}`, 'obs-store-record');
      const report = await analyzeTopology({
        planId: topology.id,
        runId,
        topologySeed: topology,
        signal,
      });
      const envelopes = await runWithQueue(topology.id, withBrand(`queue-${index}`, 'engine-run-token'), signal);
      const firstEnvelope = envelopes.at(0);
      const observed = store.appendRecord({
        runId,
        planId: topology.id,
        topology,
        signal,
        source,
      });
      const normalizedKinds = report.policySignals.length > 0 ? report.policySignals : [kind];

      batchItems.push({
        kind: signal.kind,
        signal,
        runId,
        report: {
          ...report,
          policySignals: normalizedKinds,
        },
      });

      if (firstEnvelope?.payload.kind === 'alert') {
        alerts.push(`queue:${firstEnvelope.id}:${firstEnvelope.payload.payload.reason}`);
      }
      if (isAlertRecord(observed)) {
        alerts.push(`record:${observed.id}`);
      }
    }

    session[Symbol.dispose]();

    const history = await collectSignals(store, topology.id);
    const cursor = await collectObservabilityCursor(store, topology.id, withBrand(`${namespaceSeed}-cursor`, 'obs-store-cursor'));
    const resolvedHistory = await collectHistoryLines(history, topology.id, cursor);

    return {
      id: withBrand(`studio-${namespaceSeed}`, 'mesh-observability-report'),
      topology,
      planId: topology.id,
      reportKinds: reportKinds as NoInfer<TSignals>,
      items: batchItems,
      events: history.ok ? history.value : [],
      history: resolvedHistory.slice(0, 24),
      alerts,
      createdAt: startedAt,
      snapshotToken: cursor.token,
      meta: {
        namespace,
        count: batchItems.length,
        startedAt,
      },
    };
  });
};

export const runObservabilityWorkspace = async <TSignals extends readonly MeshSignalKind[]>(
  options: StudioRunInput<TSignals>,
): Promise<StudioRunResult<TSignals>> => {
  return runStudioBatch<TSignals>({
    ...options,
    namespace: options.namespace ?? 'mesh-observability-workspace',
    namespaceSeed: options.namespaceSeed ?? `${topologySeedId(options.topologySeed)}-${Date.now()}`,
  });
};

const topologySeedId = (seed: Parameters<typeof parseTopology>[0]): string => {
  if (typeof seed === 'string') {
    return seed;
  }
  if (seed && typeof seed === 'object' && 'id' in seed && typeof seed.id === 'string') {
    return seed.id;
  }
  return 'workspace';
};

export const normalizeSignalPayload = <TSignal extends MeshSignalKind>(
  signal: MeshPayloadFor<TSignal>,
): BuildPayload<TSignal> => signal.payload as BuildPayload<TSignal>;
