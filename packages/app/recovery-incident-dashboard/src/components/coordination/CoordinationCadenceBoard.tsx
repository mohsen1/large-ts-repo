import type { CoordinationAttemptReport } from '@service/recovery-coordination-orchestrator';
import { useMemo } from 'react';

export interface CadenceRoute {
  readonly tenant: string;
  readonly runId: string;
  readonly stage: 'plan' | 'select' | 'execute' | 'observe';
  readonly queuedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
}

export interface CadenceBoardProps {
  readonly history: readonly CoordinationAttemptReport[];
  readonly routeStates: readonly CadenceRoute[];
}

export const CoordinationCadenceBoard = ({ history, routeStates }: CadenceBoardProps) => {
  const routeByRunId = useMemo(() => {
    const grouped = new Map<string, CadenceRoute[]>();
    for (const route of routeStates) {
      const entries = grouped.get(route.runId) ?? [];
      grouped.set(route.runId, [...entries, route]);
    }
    return grouped;
  }, [routeStates]);

  return (
    <section>
      <h3>Cadence Board</h3>
      <p>history={history.length} routes={routeStates.length}</p>
      <ol>
        {[...history].map((record) => {
          const routes = routeByRunId.get(record.runId) ?? [];
          return (
            <li key={`${record.runId}:${record.state.startedAt}`}>
              <strong>{record.runId}</strong> decision={record.selection.decision} reports={record.selection.alternatives.length}
              <ul>
                {routes.map((route) => (
                  <li key={`${route.queuedAt}:${route.stage}`}>
                    {route.stage} {route.startedAt ? `started=${route.startedAt}` : 'queued'}
                    {route.completedAt ? ` completed=${route.completedAt}` : ''}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
};
