import { memo, type ReactElement } from 'react';
import type { WorkbenchControlState } from '../types';

interface WorkbenchRunSummaryProps {
  readonly snapshots: WorkbenchControlState['snapshots'];
  readonly results: WorkbenchControlState['results'];
  readonly selectedRoute: WorkbenchControlState['selectedRoute'];
  readonly loading: boolean;
}

export const WorkbenchRunSummary = memo(function WorkbenchRunSummary({
  snapshots,
  results,
  selectedRoute,
  loading,
}: WorkbenchRunSummaryProps): ReactElement {
  const latest = snapshots[snapshots.length - 1];
  const score = latest?.score ?? 0;
  const pluginCount = results.length;
  const lastLatency = results.reduce((acc, result) => acc + result.latencyMs, 0);
  const labels = snapshots.map((snapshot) => snapshot.status).filter((status, index, all) => all.indexOf(status) === index);

  return (
    <section>
      <h3>Run Summary</h3>
      <dl>
        <dt>selectedRoute</dt>
        <dd>{selectedRoute}</dd>

        <dt>status</dt>
        <dd>{latest?.status ?? 'idle'}</dd>

        <dt>score</dt>
        <dd>{score}</dd>

        <dt>plugins</dt>
        <dd>{pluginCount}</dd>

        <dt>lastLatency</dt>
        <dd>{`${lastLatency}ms`}</dd>

        <dt>runtimeState</dt>
        <dd>{loading ? 'running' : 'idle'}</dd>
      </dl>

      <p>{`observed states: ${labels.join(' | ')}`}</p>
    </section>
  );
});
