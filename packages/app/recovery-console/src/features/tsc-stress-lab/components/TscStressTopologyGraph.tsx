import { useMemo } from 'react';
import { type GraphStepResult } from '@shared/type-level/stress-huge-controlflow';

type TscStressTopologyGraphProps = {
  readonly nodes: readonly string[];
  readonly links: readonly [string, string][];
  readonly diagnostics: readonly GraphStepResult[];
};

const toPath = (from: string, to: string): string => `${from}->${to}`;

const splitLog = (row: GraphStepResult): string => {
  if (row.accepted) {
    return `ok:${row.phase}${row.next ? `:${row.next}` : ''}`;
  }
  return `fail:${row.phase}:${row.reason}`;
};

export const TscStressTopologyGraph = ({ nodes, links, diagnostics }: TscStressTopologyGraphProps) => {
  const map = useMemo(() => {
    const buckets = new Map<string, string[]>();
    for (const [from, to] of links) {
      const path = toPath(from, to);
      buckets.set(path, [path, ...(buckets.get(path) ?? [])]);
    }
    return buckets;
  }, [links]);

  const diagnosticsText = useMemo(() => diagnostics.map(splitLog).join('\n'), [diagnostics]);

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <section>
        <h3 style={{ margin: 0 }}>Topology</h3>
        <div
          style={{
            display: 'grid',
            gap: '0.4rem',
            border: '1px solid #2f3450',
            borderRadius: 8,
            padding: 10,
            background: '#11182b',
          }}
        >
          {nodes.map((node) => (
            <article
              key={node}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: '0.75rem',
                borderBottom: '1px solid #29314a',
                paddingBottom: 6,
              }}
            >
              <span>{node}</span>
              <span style={{ color: '#7de0ff' }}>{(map.get(toPath(node, node)) ?? []).length}</span>
            </article>
          ))}
        </div>
      </section>
      <section>
        <h3 style={{ margin: 0 }}>Path Heatmap</h3>
        <pre
          style={{
            margin: 0,
            maxHeight: 170,
            overflow: 'auto',
            background: '#121c30',
            border: '1px solid #2f3450',
            borderRadius: 8,
            padding: 10,
          }}
        >
          {diagnosticsText}
        </pre>
      </section>
    </div>
  );
};
