import { useMemo } from 'react';
import { type ControlPlaneResult } from '../services/chaosControlPlane';
import type { ChaosRunState } from '@service/recovery-chaos-orchestrator';

export interface ChaosControlPlaneOverviewProps {
  readonly namespace: string;
  readonly windowMs: number;
  readonly running: boolean;
  readonly state: ChaosRunState | null;
  readonly result: ControlPlaneResult | null;
  readonly onRefresh: () => void;
}

function formatBucketCount(value: number): string {
  return value.toLocaleString();
}

function resolveHealth(result: ControlPlaneResult | null): string {
  if (!result) {
    return 'not-started';
  }
  const { report } = result;
  if (report.status === 'complete') {
    return 'completed';
  }
  if (report.status === 'failed') {
    return 'failed';
  }
  return 'running';
}

export function ChaosControlPlaneOverview({ namespace, windowMs, running, state, result, onRefresh }: ChaosControlPlaneOverviewProps) {
  const health = resolveHealth(result);
  const timeline = useMemo(
    () => [state?.status, result?.report.status, running ? 'running' : 'idle', health],
    [result, running, state?.status, health]
  );
  const eventCount = useMemo(() => result?.events.length ?? 0, [result?.events.length]);
  const bucketCount = useMemo(() => result?.buckets.length ?? 0, [result?.buckets.length]);

  return (
    <section className="chaos-control-overview">
      <header>
        <h2>Control Plane Overview</h2>
        <p>Namespace: {namespace}</p>
      </header>
      <div>
        <button onClick={onRefresh} type="button">
          Refresh
        </button>
      </div>
      <dl>
        <dt>Window</dt>
        <dd>{formatBucketCount(windowMs)}ms</dd>
        <dt>Status</dt>
        <dd>{health}</dd>
        <dt>Events</dt>
        <dd>{formatBucketCount(eventCount)}</dd>
        <dt>Signal buckets</dt>
        <dd>{formatBucketCount(bucketCount)}</dd>
      </dl>
      <ul>
        {timeline.map((segment, index) => (
          <li key={`${segment}-${index}`}>
            {segment ?? 'idle'}
          </li>
        ))}
      </ul>
      {state && (
        <p>
          Progress: {state.progress}% · Stage: {state.status}
        </p>
      )}
    </section>
  );
}
