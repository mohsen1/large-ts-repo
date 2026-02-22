import { useMemo } from 'react';
import type { CommandSurfaceSnapshot } from '@domain/recovery-operations-models/command-surface';

interface RecoveryCommandSurfacePanelProps {
  readonly snapshots: readonly CommandSurfaceSnapshot[];
  readonly title: string;
}

const bucketCount = (snapshot: CommandSurfaceSnapshot, bucket: CommandSurfaceSnapshot['entries'][number]['bucket']) =>
  snapshot.entries.filter((entry) => entry.bucket === bucket).length;

const formatMs = (value: number): string => `${Math.max(0, Math.round(value / 1000))}s`;

export const RecoveryCommandSurfacePanel = ({ snapshots, title }: RecoveryCommandSurfacePanelProps) => {
  const ordered = useMemo(() => [...snapshots].sort((left, right) => right.generatedAt.localeCompare(left.generatedAt)), [snapshots]);

  return (
    <section>
      <h2>{title}</h2>
      {ordered.length === 0 ? (
        <p>No snapshots</p>
      ) : (
        ordered.map((snapshot) => (
          <article key={snapshot.sessionId} className="surface-item">
            <p>Session: {snapshot.sessionId}</p>
            <p>Plan: {snapshot.entries[0]?.planId ?? 'n/a'}</p>
            <p>Generated: {snapshot.generatedAt}</p>
            <p>
              Critical: {bucketCount(snapshot, 'critical')} · High: {bucketCount(snapshot, 'high')} · Medium:{' '}
              {bucketCount(snapshot, 'medium')} · Low: {bucketCount(snapshot, 'low')} · Idle:{' '}
              {bucketCount(snapshot, 'idle')}
            </p>
            <ul>
              {snapshot.entries.slice(0, 5).map((entry) => (
                <li key={entry.id}>
                  {entry.stepId} ({entry.bucket}) score={entry.score.toFixed(2)} window={formatMs(entry.actionWindowMs)}
                </li>
              ))}
            </ul>
            <p>{snapshot.recommendation}</p>
          </article>
        ))
      )}
    </section>
  );
};
