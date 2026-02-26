import { useMemo } from 'react';
import { useTypeLevelStressConductor } from '../../hooks/useTypeLevelStressConductor';

type ConductorPanelProps = {
  readonly defaultTenant: string;
  readonly onRefresh: () => void;
};

const parseRouteState = (state: string) =>
  state === 'recover' || state === 'dispatch' || state === 'observe' || state === 'simulate' || state === 'reconcile'
    ? state
    : 'recover';

export const TypeLevelConductorPanel = ({ defaultTenant, onRefresh }: ConductorPanelProps) => {
  const {
    seed,
    setSeed,
    snapshot,
    runCount,
    runConductor,
    clearHistory,
    routePairs,
    routeMap,
    isRunning,
  } = useTypeLevelStressConductor({
    domain: 'incident',
    tenant: defaultTenant,
    includeTelemetry: true,
    controlIterations: 9,
  });

  const branch = useMemo(() => parseRouteState(snapshot.branch), [snapshot.branch]);
  const routeCount = routePairs.length;
  const routeMapKeys = useMemo(() => Object.keys(routeMap ?? {}), [routeMap]);

  return (
    <section className="type-level-conductor-panel">
      <header>
        <h3>Type-Level Stress Conductor</h3>
        <p>
          Branch: <strong>{branch}</strong> · Runs: <strong>{runCount}</strong> · Pairs: <strong>{routeCount}</strong>
        </p>
      </header>

      <div className="conductor-controls">
        <label htmlFor="type-conductor-tenant">Tenant</label>
        <input
          id="type-conductor-tenant"
          value={seed.tenant}
          onChange={(event) =>
            setSeed({
              ...seed,
              tenant: event.target.value,
            })
          }
        />
        <label htmlFor="type-conductor-domain">Domain</label>
        <input
          id="type-conductor-domain"
          value={seed.domain}
          onChange={(event) =>
            setSeed({
              ...seed,
              domain: event.target.value,
            })
          }
        />
        <label htmlFor="type-conductor-iterations">Iterations</label>
        <input
          id="type-conductor-iterations"
          type="number"
          value={seed.controlIterations}
          onChange={(event) => {
            const value = Number.parseInt(event.target.value, 10);
            setSeed({
              ...seed,
              controlIterations: Number.isNaN(value) ? 0 : value,
            });
          }}
        />
      </div>

      <div className="conductor-flags">
        <label>
          <input
            type="checkbox"
            checked={seed.includeTelemetry}
            onChange={(event) =>
              setSeed({
                ...seed,
                includeTelemetry: event.target.checked,
              })
            }
          />
          Include Telemetry
        </label>
      </div>

      <div className="conductor-summary">
        <p>Running: {String(isRunning)}</p>
        <p>Route count: {snapshot.routeCount}</p>
        <p>Pair count: {snapshot.pairCount}</p>
        <p>Depth marker: {snapshot.profileDepth}</p>
        <p>Telemetry enabled: {String(snapshot.telemetryEnabled)}</p>
      </div>

      <div className="conductor-actions">
        <button type="button" onClick={() => void runConductor()} disabled={isRunning}>
          Run Conductor
        </button>
        <button type="button" onClick={() => onRefresh()}>
          Refresh
        </button>
        <button type="button" onClick={clearHistory}>
          Clear
        </button>
      </div>

      <section>
        <h4>Route Pair Mapping ({routeMapKeys.length})</h4>
        <ul>
          {routeMapKeys.slice(0, 6).map((key) => (
            <li key={key}>{key}</li>
          ))}
        </ul>
      </section>

      <section>
        <h4>Route Pair Samples</h4>
        <div>
          {routePairs.slice(0, 8).map((pair) => (
            <article key={`${pair.a}:${pair.b}`}>
              <span>{pair.a}</span>
              <span> / </span>
              <span>{pair.b}</span>
              <span> / </span>
              <span>{pair.merged}</span>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h4>Active Routes</h4>
        <ul>
          {snapshot.routeList.slice(0, 10).map((route) => (
            <li key={`${route}`}>{route}</li>
          ))}
        </ul>
      </section>
    </section>
  );
};
