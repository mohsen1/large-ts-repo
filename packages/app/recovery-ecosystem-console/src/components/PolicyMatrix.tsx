import { useMemo, type ReactElement } from 'react';
import type { PolicyMatrixCell } from '../hooks/useEcosystemPolicyMatrix';

interface PolicyMatrixProps {
  readonly matrix: readonly PolicyMatrixCell[];
  readonly onToggle: (policy: string) => void;
}

const cellClass = (active: boolean): string => (active ? 'policy-cell policy-active' : 'policy-cell policy-dormant');

export const PolicyMatrix = ({ matrix, onToggle }: PolicyMatrixProps): ReactElement => {
  const sorted = useMemo(() => matrix.toSorted((left, right) => right.score - left.score), [matrix]);
  const digest = useMemo(
    () => sorted.map((entry) => `${entry.policy}:${entry.score}`).join('|'),
    [sorted],
  );

  return (
    <section>
      <h3>Policy Matrix</h3>
      <p>Digest: {digest}</p>
      <table>
        <thead>
          <tr>
            <th>Policy</th>
            <th>Enabled</th>
            <th>Score</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry) => (
            <tr key={entry.policy} className={cellClass(entry.active)}>
              <td>{entry.policy}</td>
              <td>{entry.active ? 'active' : 'inactive'}</td>
              <td>{entry.score}</td>
              <td>
                <button type="button" onClick={() => onToggle(entry.policy)}>
                  {entry.active ? 'disable' : 'enable'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

