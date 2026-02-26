import { useMemo } from 'react';
import { evaluateFlow, findBranchesAbove, flowBranches, type FlowBranch } from '@shared/type-level';

type StressTypeGridProps = {
  readonly filterMode: 'strict' | 'relaxed' | 'dry-run';
};

type CellRow = {
  readonly branch: FlowBranch;
  readonly eventTrace: string;
  readonly weight: number;
};

export const StressTypeGrid = ({ filterMode }: StressTypeGridProps) => {
  const rows = useMemo<CellRow[]>(() => {
    return flowBranches
      .filter((branch: FlowBranch) => {
        if (filterMode === 'strict') {
          return branch.length > 5;
        }
        return branch.length > 3;
      })
      .map((branch: FlowBranch) => {
        const context = {
          mode: filterMode,
          runId: `run-${branch}` as const,
          depth: branch.length % 6,
        };
        const event = evaluateFlow(branch, context);
        return {
          branch,
          eventTrace: `${branch}: ${event.trace.join(' -> ')}`,
          weight: event.trace.length + context.depth,
        };
      })
      .sort((a: CellRow, b: CellRow) => b.weight - a.weight)
      .slice(0, 30);
  }, [filterMode]);

  const activeBranches = useMemo(() => {
    const selected = findBranchesAbove(filterMode === 'strict' ? 10 : filterMode === 'relaxed' ? 8 : 6, filterMode);
    return new Set(selected);
  }, [filterMode]);

  return (
    <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
      <header>
        <h3>Branch Matrix ({filterMode})</h3>
      </header>
      <div style={{ display: 'grid', gap: 10 }}>
        {rows.map((row) => {
          const isHot = activeBranches.has(row.branch);
          return (
            <article
              key={row.branch}
              style={{
                border: '1px solid #f1f5f9',
                borderRadius: 8,
                padding: 8,
                background: isHot ? '#ecfeff' : '#ffffff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{row.branch}</strong>
                <span style={{ color: isHot ? '#0369a1' : '#334155' }}>w:{row.weight}</span>
              </div>
              <p style={{ fontFamily: 'monospace', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {row.eventTrace}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
};
