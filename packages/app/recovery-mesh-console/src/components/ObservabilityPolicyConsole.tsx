import { useMemo } from 'react';
import type { MeshSignalKind } from '@domain/recovery-ops-mesh';
import type { StudioRunResult } from '@service/recovery-ops-mesh-observability-orchestrator';
import { isAlertRecord, isObservationRecord } from '@data/recovery-ops-mesh-observability-store';

export interface ObservabilityPolicyConsoleProps<TSignals extends readonly MeshSignalKind[] = readonly MeshSignalKind[]> {
  readonly runs: readonly StudioRunResult<TSignals>[];
  readonly onSelect?: (run: StudioRunResult<TSignals>) => void;
}

const scoreFromRun = <TSignals extends readonly MeshSignalKind[]>(run: StudioRunResult<TSignals>): number => {
  const eventCount = run.items.length;
  const alerts = run.events.filter(isAlertRecord).length;
  return Math.max(0, 100 - eventCount - alerts * 3);
};

const buildSignalCounts = <TSignals extends readonly MeshSignalKind[]>(run: StudioRunResult<TSignals>) => {
  const bucket: Record<MeshSignalKind, number> = {
    pulse: 0,
    snapshot: 0,
    alert: 0,
    telemetry: 0,
  };
  for (const item of run.items) {
    bucket[item.kind] += 1;
  }

  return bucket as {
    [K in MeshSignalKind]: number;
  };
};

const trend = (values: readonly number[]): 'up' | 'down' | 'flat' => {
  if (values.length < 2) {
    return 'flat';
  }
  const last = values.at(-1) ?? 0;
  const prev = values.at(-2) ?? 0;
  if (last > prev) {
    return 'up';
  }
  if (last < prev) {
    return 'down';
  }
  return 'flat';
};

const trendTrace = <TSignals extends readonly MeshSignalKind[]>(runs: readonly StudioRunResult<TSignals>[]) =>
  runs.map((run) => scoreFromRun(run)).toSorted((left, right) => right - left);

const countByNamespace = <TSignals extends readonly MeshSignalKind[]>(runs: readonly StudioRunResult<TSignals>[]) => {
  const buckets = runs.reduce<Record<string, number>>((acc, run) => {
    acc[run.id] = (acc[run.id] ?? 0) + run.items.length;
    return acc;
  }, {});

  return Object.entries(buckets)
    .map(([namespace, count]) => `${namespace}:${count}`)
    .toSorted((left, right) => right.localeCompare(left));
};

const labelForKind = (kind: MeshSignalKind): MeshSignalKind =>
  kind === 'telemetry' || kind === 'snapshot' || kind === 'alert' || kind === 'pulse' ? kind : 'pulse';

export const ObservabilityPolicyConsole = <TSignals extends readonly MeshSignalKind[]>({
  runs,
  onSelect,
}: ObservabilityPolicyConsoleProps<TSignals>) => {
  const sortedRuns = useMemo(() => runs.toSorted((left, right) => right.createdAt - left.createdAt), [runs]);
  const scores = useMemo(() => sortedRuns.map((run) => scoreFromRun(run)), [sortedRuns]);
  const trendDirection = useMemo(() => trend(scores), [scores]);

  const top = useMemo(() => {
    return sortedRuns
      .map((run) => {
        const counts = buildSignalCounts(run);
        return {
          run,
          score: scoreFromRun(run),
          counts,
        };
      })
      .toSorted((left, right) => {
        const runCountDiff = right.run.items.length - left.run.items.length;
        return right.score - left.score + (runCountDiff === 0 ? 0 : Math.sign(runCountDiff));
      });
  }, [sortedRuns]);

  const namespaceCounts = useMemo(() => countByNamespace(sortedRuns), [sortedRuns]);

  return (
    <section>
      <h3>Policy Console</h3>
      <p>{`run count: ${runs.length}, trend: ${trendDirection}`}</p>
      <ul>
        {top.map((entry, index) => {
          const alertCount = entry.counts.alert;
          const eventCount = entry.run.events.filter(isObservationRecord).length;
          return (
            <li key={entry.run.id}>
              <button
                type="button"
                onClick={() => onSelect?.(entry.run)}
              >
                {index + 1}. {entry.run.id}
              </button>
              <span>{` score=${entry.score} alerts=${alertCount} events=${eventCount}`}</span>
              <small>{` [${labelForKind(entry.run.reportKinds[0] ?? 'pulse')}]`}</small>
              <div>
                {Object.entries(entry.counts)
                  .map(([kind, count]) => `${kind}:${count}`)
                  .join(' | ')}
              </div>
            </li>
          );
        })}
      </ul>
      <h4>Namespaces</h4>
      <ol>
        {namespaceCounts.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ol>
      <h4>Event summary</h4>
      <ul>
        {trendTrace(sortedRuns).slice(0, 8).map((entry, index) => (
          <li key={`${entry}-${index}`}>{entry}</li>
        ))}
      </ul>
    </section>
  );
};
