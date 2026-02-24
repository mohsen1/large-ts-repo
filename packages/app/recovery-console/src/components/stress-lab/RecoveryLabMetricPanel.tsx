import { useMemo } from 'react';
import { collectByLane, summarizeByLaneCount } from '@domain/recovery-stress-lab-intelligence/flow-graph';
import { buildFleetPlan, parseFleetInput } from '@service/recovery-stress-lab-orchestrator/stress-lab-fleet';

interface RecoveryLabMetricPanelProps {
  readonly tenantId: string;
  readonly zone: string;
}

export const RecoveryLabMetricPanel = ({ tenantId, zone }: RecoveryLabMetricPanelProps) => {
  const payload = useMemo(() => {
    const normalizedGraph = parseFleetInput({
      region: zone,
      nodes: [
        { id: 'seed', lane: 'observe', kind: 'seed', outputs: ['simulate'] },
        { id: 'simulate', lane: 'simulate', kind: 'simulate', outputs: ['recommend'] },
        { id: 'recommend', lane: 'recommend', kind: 'recommend', outputs: ['restore'] },
        { id: 'restore', lane: 'restore', kind: 'restore', outputs: [] },
      ],
      edges: [
        { id: 'seed->simulate', from: 'seed', to: ['simulate'], direction: 'northbound', channel: 'seed-channel' },
        { id: 'simulate->recommend', from: 'simulate', to: ['recommend'], direction: 'interlane', channel: 'simulate-channel' },
        { id: 'recommend->restore', from: 'recommend', to: ['restore'], direction: 'southbound', channel: 'restore-channel' },
      ],
    });

    const plan = buildFleetPlan(tenantId, zone, normalizedGraph);

    const laneSummary = collectByLane(plan.graph, ['observe', 'simulate', 'recommend', 'restore']);
    const laneMap = laneSummary;
    return {
      nodes: plan.graph.nodes.length,
      edges: plan.graph.edges.length,
      laneMap,
      edgeSignature: plan.id,
    };
  }, [tenantId, zone]);

  return (
    <section>
      <h2>Metric Panel</h2>
      <dl>
        <div>
          <dt>Nodes</dt>
          <dd>{payload.nodes}</dd>
        </div>
        <div>
          <dt>Edges</dt>
          <dd>{payload.edges}</dd>
        </div>
        <div>
          <dt>Plan</dt>
          <dd>{payload.edgeSignature}</dd>
        </div>
      </dl>
      <ul>
        <li>Observe: {payload.laneMap.observe}</li>
        <li>Simulate: {payload.laneMap.simulate}</li>
        <li>Recommend: {payload.laneMap.recommend}</li>
        <li>Restore: {payload.laneMap.restore}</li>
      </ul>
    </section>
  );
};
