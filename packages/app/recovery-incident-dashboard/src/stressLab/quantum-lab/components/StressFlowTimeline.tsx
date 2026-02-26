import { type ReactElement, useMemo, useState } from 'react';
import { type RouteEnvelope, type OrbitRoute } from '@shared/type-level/stress-conditional-orbit';
import { type BranchRoutePlan, expandWorkspace, routeStateMachine, hydrateRouteWorkspace } from '@domain/recovery-lab-stress-lab-core';

interface TimelineRow {
  readonly route: OrbitRoute;
  readonly branch: string;
  readonly state: string;
  readonly elapsedMs: number;
}

interface TimelineProps {
  readonly routes: readonly OrbitRoute[];
}

export const StressFlowTimeline = ({ routes }: TimelineProps): ReactElement => {
  const snapshots = useMemo(() => expandWorkspace(routes), [routes]);
  const [selected, setSelected] = useState(routes[0] ?? null);
  const [running, setRunning] = useState(false);

  const timeline: TimelineRow[] = useMemo(() => {
    const rows: TimelineRow[] = [];
    for (const snapshot of snapshots) {
      let elapsed = 0;
      for (const event of snapshot.events) {
        const branch = deriveBranchFromEvent(event.kind);
        rows.push({
          route: event.route,
          branch: branch.branch,
          state: snapshot.state,
          elapsedMs: elapsed + event.id.length * 3,
        });
        elapsed += 11;
      }
    }
    return rows;
  }, [snapshots]);

  const stats = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of timeline) {
      map.set(item.state, (map.get(item.state) ?? 0) + 1);
    }
    return [...map.entries()];
  }, [timeline]);

  const sampleEnvelope = useMemo(() => {
    if (!selected) {
      return null;
    }
    const context = hydrateRouteWorkspace(selected);
    return context.envelope as RouteEnvelope<OrbitRoute>;
  }, [selected]);

  return (
    <section className="stress-flow-timeline">
      <header>
        <h2>Stress Flow Timeline</h2>
        <button type="button" onClick={() => setRunning((next) => !next)}>
          {running ? 'pause' : 'run'}
        </button>
      </header>

      <aside className="timeline-stats">
        {stats.map(([state, value]) => {
          return (
            <p key={state}>
              {state}: {value}
            </p>
          );
        })}
      </aside>

      <div className="timeline-events">
        <ul>
          {timeline.map((item) => (
            <li
              key={`${item.route}:${item.branch}:${item.elapsedMs}`}
              onClick={() => setSelected(item.route)}
              className={item.route === selected ? 'selected' : undefined}
            >
              <span>{item.route}</span>
              <strong>{item.branch}</strong>
              <em>{item.state}</em>
              <small>{item.elapsedMs}ms</small>
            </li>
          ))}
        </ul>
      </div>

      <footer>
        {sampleEnvelope ? <code>{sampleEnvelope.path}</code> : <code>no route selected</code>}
      </footer>
    </section>
  );
};

const deriveBranchFromEvent = (kind: BranchRoutePlan['branch'] | 'created' | 'validated' | 'scheduled' | 'dispatched' | 'observed' | 'reconciled' | 'stopped'): BranchRoutePlan => {
  if (kind === 'dispatched') {
    return { branch: 'beta', route: '/atlas/bootstrap/global' as OrbitRoute, code: 1 };
  }

  if (kind === 'observed') {
    return { branch: 'gamma', route: '/signal/observe/edge' as OrbitRoute, active: true };
  }

  if (kind === 'reconciled') {
    return { branch: 'delta', route: '/quantum/recover/runtime' as OrbitRoute, retries: 2 };
  }

  if (kind === 'created') {
    return { branch: 'alpha', route: '/fabric/plan/cluster' as OrbitRoute, reason: 'created' };
  }

  if (kind === 'validated') {
    return { branch: 'alpha', route: '/fabric/guard/cluster' as OrbitRoute, reason: 'validated' };
  }

  if (kind === 'scheduled') {
    return { branch: 'beta', route: '/control/plan/control-plane' as OrbitRoute, code: 0 };
  }

  return { branch: 'gamma', route: '/recovery/recover/lab' as OrbitRoute, active: false };
};
