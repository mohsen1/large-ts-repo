import { memo, useMemo } from 'react';
import { getAtlasRouteDiagnostics, type StressAtlasRoute } from '../hooks/useTypeStressAtlas';
import { RecoveryTscStressAtlasPanel } from '../components/RecoveryTscStressAtlasPanel';

const atlasRoutes: readonly StressAtlasRoute[] = [
  '/incident/inspect/regional/001',
  '/recovery/recover/core/002',
  '/policy/enforce/canary/011',
  '/signal/observe/edge/021',
  '/fabric/route/public/100',
  '/quantum/synthesize/lab/120',
  '/strategy/provision/edge/130',
  '/timeline/replay/global/140',
] as const;

const determineSeverity = (route: StressAtlasRoute) => {
  if (route.includes('synthesize')) return 'high' as const;
  if (route.includes('recover')) return 'medium' as const;
  if (route.includes('critical') || route.includes('mitigate')) return 'high' as const;
  return 'low' as const;
};

const RouteDiagnostics = memo(({
  route,
  severity,
  trace,
}: {
  route: StressAtlasRoute;
  severity: 'high' | 'medium' | 'low';
  trace: number;
}) => {
  const diagnostics = getAtlasRouteDiagnostics(route);
  return (
    <article>
      <h4>{route}</h4>
      <p>
        severity {severity} / traces {trace} / projection {String(Object.keys(diagnostics.projection).length)}
      </p>
      <p>decision trace {diagnostics.decision.length}</p>
    </article>
  );
});

export const RecoveryTscStressAtlasPage = () => {
  const diagnostics = useMemo(
    () =>
      atlasRoutes.map((route) => ({
        route,
        severity: determineSeverity(route),
        trace: getAtlasRouteDiagnostics(route).decision.length,
      })),
    [],
  );

  const grouped = useMemo(
    () =>
      diagnostics.reduce(
        (acc, item) => {
          acc[item.severity].push(item);
          return acc;
        },
        {
          low: [] as typeof diagnostics,
          medium: [] as typeof diagnostics,
          high: [] as typeof diagnostics,
        },
      ),
    [diagnostics],
  );

  return (
    <main>
      <h1>Recovery Console Type Stress Atlas</h1>
      <RecoveryTscStressAtlasPanel title="Atlas Stress Routes" options={{ includeAll: true }} />
      <section>
        <h2>Static diagnostics</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div>
            <h3>Low</h3>
            {grouped.low.map((item) => (
              <RouteDiagnostics key={item.route} route={item.route} severity={item.severity} trace={item.trace} />
            ))}
          </div>
          <div>
            <h3>Medium</h3>
            {grouped.medium.map((item) => (
              <RouteDiagnostics key={item.route} route={item.route} severity={item.severity} trace={item.trace} />
            ))}
          </div>
          <div>
            <h3>High</h3>
            {grouped.high.map((item) => (
              <RouteDiagnostics key={item.route} route={item.route} severity={item.severity} trace={item.trace} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
};

export default RecoveryTscStressAtlasPage;
