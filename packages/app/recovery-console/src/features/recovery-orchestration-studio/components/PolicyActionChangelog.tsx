import { useMemo } from 'react';
import type { EngineTick } from '@service/recovery-orchestration-studio-engine';
import type { StudioResultPanel } from '../types';

interface PolicyActionChangelogProps {
  readonly ticks: readonly EngineTick[];
  readonly panel?: StudioResultPanel;
}

type EventKind = 'started' | 'running' | 'finished' | 'blocked';
type EventBucket = `bucket/${EventKind}`;

interface BucketedTick {
  readonly kind: EventKind;
  readonly bucket: EventBucket;
  readonly count: number;
}

const mapEventKind = (status: EngineTick['status']): EventKind => {
  if (status === 'running') {
    return 'running';
  }
  if (status === 'blocked') {
    return 'blocked';
  }
  if (status === 'finished') {
    return 'finished';
  }
  return 'started';
};

const bucketTick = (tick: EngineTick): BucketedTick => {
  const kind = mapEventKind(tick.status);
  return {
    kind,
    bucket: `bucket/${kind}` as EventBucket,
    count: 1,
  };
};

const mergeBuckets = (items: readonly BucketedTick[]): readonly BucketedTick[] => {
  const totals = new Map<EventKind, number>();
  for (const item of items) {
    totals.set(item.kind, (totals.get(item.kind) ?? 0) + item.count);
  }
  return [...totals.entries()].map(([kind, count]) => ({ kind, bucket: `bucket/${kind}` as EventBucket, count }));
};

export const PolicyActionChangelog = ({ ticks, panel }: PolicyActionChangelogProps) => {
  const buckets = useMemo(() => mergeBuckets(ticks.map(bucketTick)), [ticks]);
  const statusSummary = panel?.status ?? 'idle';

  return (
    <aside>
      <h2>Policy Action Changelog</h2>
      <p>{`panel=${statusSummary}`}</p>
      {panel ? (
        <ul>
          <li>{`phaseCount=${panel.phaseCount}`}</li>
          <li>{`elapsed=${panel.elapsedMs}`}</li>
          {panel.result ? <li>{`tenant=${panel.result.tenant}`}</li> : null}
        </ul>
      ) : null}
      <div>
        {buckets.map((bucket) => (
          <p key={bucket.bucket}>
            {bucket.kind}: {bucket.count}
          </p>
        ))}
      </div>
    </aside>
  );
};
