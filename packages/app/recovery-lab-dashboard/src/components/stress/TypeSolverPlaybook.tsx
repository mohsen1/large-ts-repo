import { useMemo } from 'react';
import type { SolverResult, ChainResult } from '@domain/recovery-lab-synthetic-orchestration/compiler-instantiation-matrix';
import type { BranchSolver } from '@domain/recovery-lab-synthetic-orchestration/compiler-branching-lattice';

type SolverPlaybookProps = {
  readonly title: string;
  readonly solver: SolverResult;
  readonly chain: ChainResult;
  readonly nodes: BranchSolver<string, string>[];
  readonly active: boolean;
};

export const TypeSolverPlaybook = ({ title, solver, chain, nodes, active }: SolverPlaybookProps): React.JSX.Element => {
  const chainEntries = useMemo(() => {
    const flat = Object.entries(chain as Record<string, unknown>).map(([key, value]) => `${key}=${String(value)}`);
    return flat.toSorted();
  }, [chain]);

  const scoreboard = useMemo(() => {
    const head = solver.tuple.map((entry, index) => `${index}:${entry.kind}:${entry.meta}`);
    const nodeRows = nodes.map((node, index) => `${index}:${node.input.length}:${node.output.length}:${node.score}`);
    return { head, nodeRows, active };
  }, [solver, nodes, active]);

  return (
    <section style={{ border: '1px solid #9ca3af', borderRadius: 12, padding: 12 }}>
      <h2>{title}</h2>
      <p>Total tuple: {solver.tuple.length}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <article>
          <h4>chain</h4>
          <ul style={{ maxHeight: 180, overflowY: 'auto', margin: 0, paddingLeft: 16 }}>
            {chainEntries.slice(0, 12).map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </article>
        <article>
          <h4>solver tuple</h4>
          <ul style={{ maxHeight: 180, overflowY: 'auto', margin: 0, paddingLeft: 16 }}>
            {scoreboard.head.slice(0, 12).map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </article>
        <article>
          <h4>nodes</h4>
          <ul style={{ maxHeight: 180, overflowY: 'auto', margin: 0, paddingLeft: 16 }}>
            {scoreboard.nodeRows.slice(0, 12).map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </article>
      </div>
      <p>Status: {active ? 'active' : 'idle'}</p>
    </section>
  );
};
