import { useMemo } from 'react';

import type { DrillRunRecord } from '@data/recovery-drill-store/src';

interface HeatEntry {
  readonly bucket: string;
  readonly value: number;
}

interface RecoveryDrillTimelineHeatmapProps {
  readonly tenant: string;
  readonly runs: readonly DrillRunRecord[];
}

const statusPalette: Readonly<Record<DrillRunRecord['status'], string>> = {
  planned: '#2f2',
  queued: '#48f',
  running: '#f90',
  paused: '#888',
  succeeded: '#0a0',
  degraded: '#b90',
  failed: '#d00',
  cancelled: '#777',
};

const bucketByHour = (run: DrillRunRecord): string => {
  const at = new Date(run.startedAt ?? new Date().toISOString());
  const key = `${run.status}:${at.getUTCDate()}-${at.getUTCHours()}`;
  return key;
};

export const RecoveryDrillTimelineHeatmap = ({ tenant, runs }: RecoveryDrillTimelineHeatmapProps) => {
  const groups = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const run of runs) {
      const bucket = bucketByHour(run);
      const value = grouped.get(bucket) ?? 0;
      grouped.set(bucket, value + 1);
    }
    return Array.from(grouped.entries())
      .map(([bucket, value]) => ({ bucket, value }))
      .sort((left, right) => right.value - left.value);
  }, [runs]);

  const total = groups.reduce((acc, item) => acc + item.value, 0);

  return (
    <section>
      <h4>Drill timeline heatmap</h4>
      <p>Tenant: {tenant} total: {total}</p>
      <ul>
        {groups.map((item) => {
          const [status, bucket] = item.bucket.split(':');
          const percent = total === 0 ? 0 : Math.round((item.value / total) * 100);
          const fill = statusPalette[(status as DrillRunRecord['status'])] ?? '#555';
          return (
            <li key={item.bucket}>
              <span style={{ color: fill }}>{bucket}</span> · {item.value} ({percent}%)
            </li>
          );
        })}
      </ul>
      {groups.length === 0 ? <p>No run activity</p> : null}
    </section>
  );
};
