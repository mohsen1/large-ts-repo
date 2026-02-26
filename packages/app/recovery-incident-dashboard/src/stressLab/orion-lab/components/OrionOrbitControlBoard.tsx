import { memo, useMemo, useState } from 'react';
import type { EventRoute } from '@shared/type-level/stress-orion-template-math';
import { buildEventEnvelope, routeUnionBuilder } from '@shared/type-level/stress-orion-template-math';

interface OrbitEvent {
  readonly id: string;
  readonly route: EventRoute;
  readonly enabled: boolean;
}

type BoardMode = 'compact' | 'expanded' | 'audit' | 'simulate';
type BoardAction =
  | { readonly type: 'start'; readonly mode: BoardMode }
  | { readonly type: 'stop'; readonly reason: string }
  | { readonly type: 'toggle'; readonly eventId: string };

interface OrionOrbitControlBoardProps {
  readonly events: readonly OrbitEvent[];
  readonly onDispatch: (action: BoardAction) => void;
}

const classifyRoute = (route: EventRoute): 'warning' | 'error' | 'normal' => {
  if (route.includes('/warning')) {
    return 'warning';
  }
  if (route.includes('/error') || route.includes('/critical')) {
    return 'error';
  }
  return 'normal';
}

export const OrionOrbitControlBoard = memo(({ events, onDispatch }: OrionOrbitControlBoardProps) => {
  const [mode, setMode] = useState<BoardMode>('compact');
  const [active, setActive] = useState<Record<string, boolean>>({});

  const bySeverity = useMemo(() => {
    const warning: OrbitEvent[] = [];
    const error: OrbitEvent[] = [];
    const normal: OrbitEvent[] = [];

    for (const event of events) {
      const cls = classifyRoute(event.route);
      if (cls === 'error') {
        error.push(event);
      } else if (cls === 'warning') {
        warning.push(event);
      } else {
        normal.push(event);
      }
    }

    return { warning, error, normal };
  }, [events]);

  const counts = useMemo(
    () => ({
      warning: bySeverity.warning.length,
      error: bySeverity.error.length,
      normal: bySeverity.normal.length,
      active: Object.values(active).filter(Boolean).length,
      mode,
      union: routeUnionBuilder(),
    }),
    [bySeverity.warning.length, bySeverity.error.length, bySeverity.normal.length, active, mode],
  );

  return (
    <section>
      <header>
        <h3>Orion Orbit Control Board</h3>
      </header>
      <p>
        Severity: {counts.warning} warning, {counts.error} error, {counts.normal} normal
      </p>
      <p>
        Active: {counts.active} | Mode: {counts.mode}
      </p>
      <p>
        Route union sample: {counts.union}
      </p>
      <div style={{ display: 'grid', gap: '8px' }}>
        <button onClick={() => {
          const nextMode = mode === 'compact' ? 'expanded' : mode === 'expanded' ? 'audit' : 'compact';
          setMode(nextMode);
          onDispatch({ type: 'start', mode: nextMode });
        }}>
          Toggle Mode
        </button>
        <button onClick={() => {
          onDispatch({ type: 'stop', reason: 'manual' });
          setActive({});
        }}>
          Reset
        </button>
      </div>
      {[...bySeverity.error, ...bySeverity.warning, ...bySeverity.normal].map((entry) => {
        const detail = buildEventEnvelope(entry.route);
        const isOn = active[entry.id] ?? false;
        return (
          <article key={entry.id}>
            <strong>{detail.span}</strong>
            <span> / {detail.sector}</span>
            <span> / {detail.action}</span>
            <span> / {detail.status}</span>
            <button
              onClick={() => {
                const next = { ...active, [entry.id]: !isOn };
                setActive(next);
                onDispatch({ type: 'toggle', eventId: entry.id });
              }}
            >
              {isOn ? 'disable' : 'enable'}
            </button>
          </article>
        );
      })}
    </section>
  );
});

export default OrionOrbitControlBoard;
