import { useMemo, type ReactElement } from 'react';
import { useRecoveryLensRuns } from '../hooks/useRecoveryLensRuns';
import { formatRoute } from '@domain/recovery-lens-observability-models';
import type { Severity } from '@domain/recovery-lens-observability-models';

const severityPriority: Record<Severity, number> = {
  critical: 5,
  error: 4,
  warn: 3,
  info: 2,
  trace: 1,
};

export const FabricRunInspector = ({ namespace }: { readonly namespace: string }): ReactElement => {
  const runs = useRecoveryLensRuns(namespace);

  const bySeverity = useMemo(() => {
    const map = new Map<Severity, number>();
    for (const run of runs) {
      const next = map.get(run.severity) ?? 0;
      map.set(run.severity, next + 1);
    }
    return map;
  }, [runs]);

  const ordered = useMemo(() => {
    return [...runs].toSorted((left, right) => severityPriority[right.severity] - severityPriority[left.severity]);
  }, [runs]);

  return (
    <section>
      <h3>Run inspector</h3>
      <p>Namespace: {namespace}</p>
      <p>Route: {formatRoute(namespace, 'metrics', 'recent')}</p>
      <table>
        <thead>
          <tr>
            <th>Run</th>
            <th>Timestamp</th>
            <th>Severity</th>
          </tr>
        </thead>
        <tbody>
          {ordered.map((run) => (
            <tr key={run.runId}>
              <td>{run.name}</td>
              <td>{run.at}</td>
              <td>{run.severity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul>
        {(['critical', 'error', 'warn', 'info', 'trace'] as const).map((severity) => (
          <li key={severity}>
            {severity}: {bySeverity.get(severity) ?? 0}
          </li>
        ))}
      </ul>
    </section>
  );
};
