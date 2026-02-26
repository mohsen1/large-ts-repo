import { memo, useMemo } from 'react';
import { useTypeTemplateSolver } from '../hooks/useTypeTemplateSolver';
import type { StressTypeLabMode } from '../types/stressTypeLabSchema';

interface ConstraintTableProps {
  readonly mode: StressTypeLabMode;
}

const ValueCell = memo(({ value }: { readonly value: string }) => <td>{value}</td>);

export const TypeTemplateConstraintTable = ({ mode }: ConstraintTableProps) => {
  const solver = useTypeTemplateSolver([mode, 'simulate', 'audit', 'graph']);
  const projected = useMemo(() => solver.modeFilters[mode], [mode, solver.modeFilters]);
  const groupedKeys = useMemo(() => Object.keys(solver.grouped), [solver.grouped]);

  const rows = useMemo(() => {
    const modeEntries = projected.map((entry, index) => {
      const route = `${entry}:${mode}-${index}`;
      return {
        route,
        domain: route.split(':')[0] ?? 'unknown',
        resolved: solver.routeTransforms[route],
      };
    });
    return modeEntries;
  }, [mode, projected, solver.routeTransforms]);

  return (
    <section>
      <h3>Constraint Table</h3>
      <p>Mode: {mode}</p>
      <p>Candidate rows: {rows.length}</p>
      <p>Known domains: {groupedKeys.length}</p>
      <table>
        <thead>
          <tr>
            <th>route</th>
            <th>domain</th>
            <th>metadata</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => (
            <tr key={entry.route}>
              <ValueCell value={entry.route} />
              <ValueCell value={entry.domain} />
              <td>
                {typeof entry.resolved === 'object' && entry.resolved !== null
                  ? JSON.stringify(entry.resolved)
                  : 'n/a'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul>
        {solver.modeSet.has(mode) ? <li>mode active</li> : <li>mode inactive</li>}
        {Object.entries(solver.modeFilters).map(([modeEntry, values]) => (
          <li key={modeEntry}>
            {modeEntry}: {values.length}
          </li>
        ))}
      </ul>
    </section>
  );
};
