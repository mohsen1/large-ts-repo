import { useMemo } from 'react';
import { StressControlFlowPanel } from '../components/stress/StressControlFlowPanel';
import { StressTypeGrid } from '../components/stress/StressTypeGrid';
import { routeHandlers, parseRoute, type NetworkRoutePattern, type NetworkRouteParts } from '@shared/type-level';
import { mapSolverRoutes } from '@shared/type-level';

type PlaygroundMode = 'strict' | 'relaxed' | 'dry-run';

type PageState = {
  readonly activeMode: PlaygroundMode;
  readonly count: number;
  readonly routeCount: number;
};

export const StressCompilerPlaygroundPage = () => {
  const state: PageState = {
    activeMode: 'strict',
    count: 3,
    routeCount: 0,
  };

  const routeSamples = useMemo<readonly NetworkRoutePattern[]>(() => {
    const keys = Object.keys(routeHandlers) as NetworkRoutePattern[];
    return keys.slice(0, 18);
  }, []);

  const routeOutput = useMemo(() => {
    const rows: Array<{ route: NetworkRoutePattern; parsed: NetworkRouteParts<NetworkRoutePattern> } | undefined> = [];
    for (const route of routeSamples) {
      rows.push({
        route,
        parsed: parseRoute(route) as NetworkRouteParts<NetworkRoutePattern>,
      });
    }
    return rows;
  }, [routeSamples]);

  const routeMap = useMemo(() => {
    return mapSolverRoutes(routeSamples.map((route) => route.substring(1) as string));
  }, [routeSamples]);

  return (
    <main style={{ display: 'grid', gap: 16, padding: 16 }}>
      <h1>Stress Compiler Playground</h1>
      <p>
        active mode: <strong>{state.activeMode}</strong>, runs: <strong>{routeSamples.length}</strong>, selected:{' '}
        <strong>{routeOutput.filter(Boolean).length}</strong>
      </p>
      <section style={{ display: 'grid', gap: 10, gridTemplateColumns: '2fr 1fr' }}>
        <StressControlFlowPanel title="Controlflow Diagnostics" />
        <StressTypeGrid filterMode={state.activeMode} />
      </section>
      <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
        <h2>Route Matrix</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {routeOutput.map((entry) =>
            entry ? (
              <article key={entry.route} style={{ border: '1px dashed #d1d5db', borderRadius: 8, padding: 8 }}>
                <pre style={{ margin: 0 }}>{`${entry.route} :: ${entry.parsed.entity} / ${entry.parsed.action}`}</pre>
              </article>
            ) : null,
          )}
        </div>
      </section>
      <section style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
        <h2>Mapped Routes</h2>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(routeMap.slice(0, state.count), null, 2)}</pre>
      </section>
    </main>
  );
};
