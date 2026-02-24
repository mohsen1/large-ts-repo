import { useMemo, type ReactElement } from 'react';
import { buildControlEventName } from '@domain/recovery-incident-lab-core';

interface TopologyProps {
  readonly title: string;
  readonly events: readonly string[];
}

interface Edge {
  readonly from: string;
  readonly to: string;
  readonly weight: number;
}

const toMatrix = (items: readonly string[]): readonly Edge[] => {
  if (items.length <= 1) {
    return [];
  }

  const output: Edge[] = [];
  for (let index = 0; index < items.length - 1; index += 1) {
    output.push({
      from: items[index],
      to: items[index + 1],
      weight: index + 1,
    });
  }
  return output.toSorted((left, right) => left.from.localeCompare(right.from));
};

export const RecoveryLabTopologyMatrix = ({ title, events }: TopologyProps): ReactElement => {
  const matrix = useMemo(() => {
    const namedEdges = toMatrix(events).map((edge) => ({
      ...edge,
      from: buildControlEventName('topology', 'simulate', Number(edge.from.length)),
      to: buildControlEventName('topology', 'simulate', Number(edge.to.length)),
    }));

    const matrixRows = namedEdges.reduce<Record<string, number[]>>((acc, edge) => {
      const bucket = edge.from;
      const next = acc[bucket] ?? [];
      acc[bucket] = [...next, edge.weight];
      return acc;
    }, {});

    return {
      rows: namedEdges,
      buckets: matrixRows,
    };
  }, [events]);

  return (
    <section className="recovery-lab-topology-matrix">
      <h3>{title}</h3>
      <table>
        <thead>
          <tr>
            <th>from</th>
            <th>to</th>
            <th>weight</th>
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((edge, index) => (
            <tr key={`${edge.from}-${edge.to}-${index}`}>
              <td>{edge.from}</td>
              <td>{edge.to}</td>
              <td>{edge.weight}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <section>
        <h4>Buckets</h4>
        <ul>
          {Object.entries(matrix.buckets).map(([bucket, weights]) => (
            <li key={bucket}>
              {bucket}: {weights.join(',')}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
};
