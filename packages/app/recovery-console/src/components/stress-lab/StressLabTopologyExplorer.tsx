import { useMemo } from 'react';
import { type WorkflowNode, type WorkflowEdge } from '@domain/recovery-stress-lab-intelligence/flow-graph';
import { buildGraphByLane } from '@domain/recovery-stress-lab-intelligence/flow-graph';
import { buildFleetPlan, parseFleetInput } from '@service/recovery-stress-lab-orchestrator/stress-lab-fleet';
import { parsePath } from '@shared/stress-lab-runtime';

export interface StressLabTopologyExplorerProps {
  readonly tenantId: string;
  readonly zone: string;
}

type LaneGroups = ReturnType<typeof buildGraphByLane>;

const formatLaneNode = (node: WorkflowNode): string => `${node.kind}#${node.id}`;

const formatEdge = (edge: WorkflowEdge): string => {
  const destinations = edge.to.join(',');
  return `${edge.from} -> ${destinations} (${edge.direction})`;
};

const pathSignature = (route: string): string => {
  const segments = parsePath(route);
  return segments.join(' / ');
};

const reduceEdgeGroups = (edges: readonly WorkflowEdge[]): string[] => {
  return edges.map((edge) => formatEdge(edge));
};

const reduceNodeGroups = (nodes: readonly WorkflowNode[]): string[] => {
  return nodes.map(formatLaneNode);
};

export function StressLabTopologyExplorer({ tenantId, zone }: StressLabTopologyExplorerProps) {
  const plan = useMemo(() => {
    const fixture = {
      region: zone,
      nodes: [
        { id: 'seed', lane: 'observe', kind: 'seed', outputs: ['simulate'] },
        { id: 'simulate', lane: 'simulate', kind: 'simulate', outputs: ['recommend'] },
        { id: 'recommend', lane: 'recommend', kind: 'recommend', outputs: ['restore'] },
        { id: 'restore', lane: 'restore', kind: 'restore', outputs: [] },
      ],
      edges: [
        { id: 'seed->simulate', from: 'seed', to: ['simulate'], direction: 'northbound', channel: 'simulate-channel' },
        { id: 'simulate->recommend', from: 'simulate', to: ['recommend'], direction: 'interlane', channel: 'recommend-channel' },
        { id: 'recommend->restore', from: 'recommend', to: ['restore'], direction: 'southbound', channel: 'restore-channel' },
      ],
    } as const;

    const normalized = parseFleetInput(fixture);
    return buildFleetPlan(tenantId, zone, normalized);
  }, [tenantId, zone]);

  const laneGroups = buildGraphByLane(plan.graph) as LaneGroups;

  const summary = (Object.entries(laneGroups) as [keyof LaneGroups, LaneGroups[keyof LaneGroups]][]).map(
    ([lane, info]) => {
      return {
        lane,
        nodes: reduceNodeGroups(info.nodes),
        edges: reduceEdgeGroups(info.edges),
      };
    },
  );

  const sampleRoute = pathSignature(`${tenantId}/${zone}/stress/plan`);

  return (
    <section aria-label="Stress Lab Topology" className="stress-lab-topology">
      <h2>Stress Lab Topology</h2>
      <p>
        Tenant: <strong>{tenantId}</strong> · Zone: <strong>{zone}</strong>
      </p>
      <p>{sampleRoute}</p>
      <ul>
        {summary.map((entry) => (
          <li key={entry.lane}>
            <div>{String(entry.lane)}</div>
            <div>
              {entry.nodes.length > 0 ? (
                <ul>
                  {entry.nodes.map((node) => (
                    <li key={node}>{node}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <div>
              {entry.edges.length > 0 ? (
                <ul>
                  {entry.edges.map((edge) => (
                    <li key={edge}>{edge}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
