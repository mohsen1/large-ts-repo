import { useMemo } from 'react';
import type { HorizonStudioStatus } from '../services/horizonStudioService';

type TopologyNode = {
  readonly id: string;
  readonly stage: string;
  readonly weight: number;
};

type TopologyProps = {
  readonly status: HorizonStudioStatus;
  readonly workspace: string;
};

const deriveNodes = (status: HorizonStudioStatus): readonly TopologyNode[] => {
  const nodes = status.plans
    .map((plan) => ({
      id: `${plan.id}`,
      stage: `${plan.pluginSpan.stage}`,
      weight: Number(plan.startedAt) % 1_000,
    }))
    .toSorted((left, right) => right.weight - left.weight);

  return nodes.toSorted((left, right) => left.stage.localeCompare(right.stage));
};

export const HorizonStudioTopology = ({ status, workspace }: TopologyProps) => {
  const nodes = useMemo(() => deriveNodes(status), [status]);

  return (
    <section className="horizon-studio-topology">
      <header>
        <h3>Topology</h3>
        <p>{workspace}</p>
      </header>

      <p>Total plans: {nodes.length}</p>
      <ol>
        {nodes.map((node) => (
          <li key={node.id}>
            <span>{node.stage}</span>
            <strong>{node.weight}</strong>
          </li>
        ))}
      </ol>
    </section>
  );
};
