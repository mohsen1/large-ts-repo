import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useChronicleWorkspace } from '../hooks/useChronicleWorkspace';
import { ChroniclePolicyPanel } from '../components/ChroniclePolicyPanel';
import { ChronicleTopologyPanel } from '../components/ChronicleTopologyPanel';
import type { HealthMetric, TimelinePoint } from '../types';
import { emptyMetric } from '../types';

const resolveStatus = (index: number): TimelinePoint['status'] =>
  index % 2 === 0 ? 'running' : 'succeeded';

export const ChroniclePolicyLabPage = (): ReactElement => {
  const [axisFilter, setAxisFilter] = useState('');
  const [state, viewModel, actions] = useChronicleWorkspace(
    'tenant:policy-lab',
    'chronicle://policy-lab',
    ['phase:bootstrap', 'phase:execution', 'phase:verification', 'phase:cleanup'],
  );

  const metrics = useMemo<readonly HealthMetric[]>(
    () =>
      [
        { ...emptyMetric, axis: 'throughput', score: 76, trend: 'up' },
        { ...emptyMetric, axis: 'cost', score: 34, trend: 'down' },
        { ...emptyMetric, axis: 'operational', score: 91, trend: 'flat' },
        { ...emptyMetric, axis: 'compliance', score: 88, trend: 'up' },
      ],
    [],
  );

  useEffect(() => {
    void actions.refresh();
  }, [actions]);

  const points = viewModel.timeline
    .map((entry, index): TimelinePoint => ({
      label: entry,
      score: Math.max(0, 100 - index * 8),
      status: resolveStatus(index),
    }))
    .toSorted((left, right) => left.score - right.score);

  return (
    <main>
      <h1>Chronicle Policy Lab</h1>
      <p>Route: {viewModel.route}</p>
      <section>
        <button type="button" onClick={() => void actions.run()}>
          Execute Policy Loop
        </button>
        <button type="button" onClick={() => void actions.reset()}>
          Reset
        </button>
      </section>
      <ChroniclePolicyPanel
        metrics={axisFilter ? metrics.filter((entry) => entry.axis.includes(axisFilter)) : metrics}
        onSelect={(axis) => setAxisFilter(axis)}
      />
      <ChronicleTopologyPanel title="Policy timeline" points={points} />
      <section>
        <h2>Context</h2>
        <pre>{JSON.stringify(
          {
            run: state.runId,
            route: state.route,
            status: state.status,
            score: state.score,
            count: points.length,
          },
          null,
          2,
        )}</pre>
      </section>
    </main>
  );
};
