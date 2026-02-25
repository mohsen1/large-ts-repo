import {
  NoInfer,
  type AsyncMapper,
} from '@shared/type-level';
import {
  isAlertRecord,
  isObservationRecord,
  type ObservabilityEventRecord,
} from '@data/recovery-ops-mesh-observability-store';
import {
  withBrand,
} from '@shared/core';
import {
  collectSignals,
  type RecordCursor,
} from '@data/recovery-ops-mesh-observability-store';
import type { StudioRunResult } from './studioFacade';
import type {
  MeshSignalKind,
  MeshPlanId,
  MeshRunId,
} from '@domain/recovery-ops-mesh';

type ReportSignalUnion<TSignals extends readonly MeshSignalKind[]> = TSignals[number];

export interface StudioReportSnapshot {
  readonly signalCount: number;
  readonly alertCount: number;
  readonly historySignature: string;
  readonly bySignalKind: Readonly<Record<MeshSignalKind, number>>;
}

export interface StudioReportEnvelope<TSignals extends readonly MeshSignalKind[] = readonly MeshSignalKind[]> {
  readonly run: StudioRunResult<TSignals>;
  readonly snapshot: StudioReportSnapshot;
  readonly cursor?: RecordCursor;
  readonly windowed: readonly string[];
}

type SignalCounter = Readonly<Record<MeshSignalKind, number>>;

const emptyCounter = <TSignals extends readonly MeshSignalKind[]>(
  signals: TSignals,
): SignalCounter =>
  signals.reduce((acc, signal) => {
    (acc as Record<MeshSignalKind, number>)[signal] = 0;
    return acc;
  }, { pulse: 0, snapshot: 0, alert: 0, telemetry: 0 } as SignalCounter);

const isKnownKind = <TSignals extends readonly MeshSignalKind[]>(
  signal: MeshSignalKind,
  kinds: TSignals,
): signal is ReportSignalUnion<TSignals> => kinds.includes(signal as ReportSignalUnion<TSignals>);

const eventToSignalKind = <TSignals extends readonly MeshSignalKind[]>(
  event: ObservabilityEventRecord,
  kinds: TSignals,
): ReportSignalUnion<TSignals> | undefined => {
  if (!isObservationRecord(event)) {
    return undefined;
  }
  return isKnownKind(event.signal.kind, kinds) ? event.signal.kind : undefined;
};

export const snapshotStudioReport = <TSignals extends readonly MeshSignalKind[]>(
  run: StudioRunResult<TSignals>,
): StudioReportEnvelope<TSignals> => {
  const signatures = run.history.map((entry, index) => `${index}:${entry}`);
  const bySignalKind = emptyCounter(run.reportKinds);
  let alertCount = 0;

  for (const event of run.events) {
    const kind = eventToSignalKind(event, run.reportKinds);
    if (kind) {
      (bySignalKind as Record<MeshSignalKind, number>)[kind] += 1;
    }
    if (isAlertRecord(event)) {
      alertCount += 1;
    }
  }

  return {
    run,
    snapshot: {
      signalCount: run.items.length,
      alertCount,
      historySignature: withBrand(`sig:${run.items.map((entry) => entry.kind).join(',')}`, 'mesh-observability-report' as const),
      bySignalKind,
    },
    windowed: signatures.toSorted((left, right) => right.localeCompare(left)),
  };
};

export const compileStudioReport = async <TSignals extends readonly MeshSignalKind[]>(
  store: {
    getSnapshot: (planId: MeshPlanId) => Promise<{ records: readonly ObservabilityEventRecord[] }>;
  },
  run: StudioRunResult<TSignals>,
): Promise<StudioReportEnvelope<TSignals>> => {
  const snapshot = await store.getSnapshot(run.planId);
  const sourceWindow = snapshot.records
    .filter(isObservationRecord)
    .map((event) => `signal:${event.signal.kind}:${event.id}`);
  const cursor = await Promise.resolve({
    token: withBrand(`cursor-${run.id}-${Date.now()}`, 'obs-store-cursor'),
    records: snapshot.records,
    hasMore: snapshot.records.length > 0,
  } as RecordCursor);

  return {
    ...snapshotStudioReport(run),
    cursor,
    windowed: sourceWindow.toSorted(),
  };
};

export interface StudioRunRanking {
  readonly runId: MeshRunId;
  readonly planId: MeshPlanId;
  readonly score: number;
  readonly topKind: MeshSignalKind;
}

export const rankStudioRuns = <TRuns extends readonly StudioRunResult[]>(
  runs: NoInfer<TRuns>,
): readonly StudioRunRanking[] => {
  const scored = runs.map((run) => {
    const snapshot = snapshotStudioReport(run);
    const topKind = (Object.entries(snapshot.snapshot.bySignalKind)
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
      .toSorted((left, right) => right[1] - left[1])[0]?.[0] ?? 'pulse') as MeshSignalKind;
    const score = Math.max(0, 100 - snapshot.snapshot.alertCount - snapshot.snapshot.signalCount);

    return {
      runId: run.items.at(-1)?.runId ?? withBrand('run-missing', 'MeshRunId'),
      planId: run.planId,
      score,
      topKind,
    };
  });

  return scored.toSorted((left, right) => right.score - left.score);
};

export const hydrateReportWindow = <TSignals extends readonly MeshSignalKind[]>(
  mapper: AsyncMapper<StudioRunResult<TSignals>, StudioReportEnvelope<TSignals>>,
  runs: readonly StudioRunResult<TSignals>[],
): Promise<readonly StudioReportEnvelope<TSignals>[]> => Promise.all(runs.map(mapper));
