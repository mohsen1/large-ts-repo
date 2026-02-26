import { useMemo } from 'react';

import type { RouteDispatchMatrix } from '@shared/type-level/stress-template-route-matrix';
import { useTypeLevelStressHarness } from '../hooks/useTypeLevelStressHarness';

interface StressRouteMatrixProps {
  readonly tenantId: string;
  readonly branch: 'north' | 'south' | 'east' | 'west' | 'diag' | 'ring' | 'fallback';
  readonly compact?: boolean;
}

export const StressRouteMatrix = ({ tenantId, branch, compact = false }: StressRouteMatrixProps) => {
  const state = useTypeLevelStressHarness({ tenantId, branch, mode: 'ready', maxBranches: 20 });

  const entries = useMemo(() => {
    return state.matrix.list
      .map((route, index) => ({
        key: `${route.envelope.domain}::${route.envelope.action}-${index}`,
        route,
      }))
      .slice(0, 40);
  }, [state.matrix]);

  return (
    <section>
      <h3>Route matrix</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ border: '1px solid #bbb' }}>Key</th>
            <th style={{ border: '1px solid #bbb' }}>Domain</th>
            <th style={{ border: '1px solid #bbb' }}>Action</th>
            <th style={{ border: '1px solid #bbb' }}>Signature</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr key={`${entry.key}-${index}`}>
              <td style={{ border: '1px solid #ddd' }}>{entry.key}</td>
              <td style={{ border: '1px solid #ddd' }}>
                {entry.route.envelope.domain}
              </td>
              <td style={{ border: '1px solid #ddd' }}>
                {entry.route.envelope.action}
              </td>
              <td style={{ border: '1px solid #ddd' }}>{entry.route.envelope.trace}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {compact ? null : <p>{`entries: ${entries.length}`}</p>}
    </section>
  );
};
