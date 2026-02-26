import { memo, useMemo } from 'react';

interface SignalCell {
  readonly route: `/${string}`;
  readonly id: string;
  readonly severity: 'critical' | 'error' | 'warning' | 'notice' | 'info';
}

type GridAxis = 'critical' | 'error' | 'warning' | 'notice' | 'info';

type SignalGrid = Record<GridAxis, SignalCell[]>;
type ViewMode = 'table' | 'card';

interface OrionRouteSignalGridProps {
  readonly signals: readonly string[];
  readonly mode: ViewMode;
  readonly onFocus: (route: `/${string}`) => void;
}

const splitSeverity = (route: string): SignalCell['severity'] => {
  if (route.includes('/critical')) {
    return 'critical';
  }
  if (route.includes('/error')) {
    return 'error';
  }
  if (route.includes('/warning')) {
    return 'warning';
  }
  if (route.includes('/notice')) {
    return 'notice';
  }
  return 'info';
};

const toSignalCell = (route: string, index: number): SignalCell => {
  const safeRoute = route as `/${string}`;
  const [prefix, id] = safeRoute.split('/').slice(-2);
  return {
    route: safeRoute,
    id: `${prefix}-${id ?? index}`,
    severity: splitSeverity(route),
  };
};

export const OrionRouteSignalGrid = memo(({ signals, mode, onFocus }: OrionRouteSignalGridProps) => {
  const grouped = useMemo(() => {
    const buckets: SignalGrid = {
      critical: [],
      error: [],
      warning: [],
      notice: [],
      info: [],
    };

    signals.forEach((route, index) => {
      const cell = toSignalCell(route, index);
      buckets[cell.severity].push(cell);
    });

    return buckets;
  }, [signals]);

  const totals = useMemo(() => {
    const all = [...grouped.critical, ...grouped.error, ...grouped.warning, ...grouped.notice, ...grouped.info];
    const critical = grouped.critical.length * 100;
    const error = grouped.error.length * 10;
    const warning = grouped.warning.length * 1;
    return { all, score: critical + error + warning };
  }, [grouped]);

  return (
    <section>
      <header>
        <h4>Route Signal Grid</h4>
        <p>
          Signals: {totals.all.length}, Score: {totals.score}
        </p>
      </header>
      <div style={{ display: mode === 'table' ? 'block' : 'grid', gap: '6px' }}>
        {(Object.entries(grouped) as Array<[GridAxis, SignalCell[]]>).map(([severity, rows]) => (
          <article key={severity}>
            <h5>{severity.toUpperCase()} ({rows.length})</h5>
            {rows.length === 0 ? (
              <p>No rows</p>
            ) : (
              rows.map((cell) => (
                <button
                  key={cell.id}
                  style={{ display: 'block', marginBottom: 4 }}
                  onClick={() => onFocus(cell.route)}
                >
                  {cell.route}
                </button>
              ))
            )}
          </article>
        ))}
      </div>
      <p>
        Health score bands: {(totals.score % 2 === 0) ? 'stable' : 'active'}
      </p>
    </section>
  );
});

export default OrionRouteSignalGrid;
