import { useMemo, useState } from 'react';
import { stressSeedRoutes, buildStressEnvelope } from '@domain/recovery-lab-synthetic-orchestration';
import { mapTemplateWithTemplateLiteral, rawRouteTemplateSource } from '@shared/type-level';
import type { HyperRoute } from '@shared/type-level/stress-hyper-union';

type OrbitMode = 'preview' | 'probe' | 'recover' | 'audit';

type OrbitRow = Readonly<{
  readonly route: HyperRoute;
  readonly token: string;
  readonly severity: string;
  readonly isCritical: boolean;
}>;

type OrbitWorkbenchProps = {
  readonly seed: readonly HyperRoute[];
  readonly initialMode: OrbitMode;
};

export const StressOrbitWorkbench = ({
  seed = stressSeedRoutes,
  initialMode,
}: OrbitWorkbenchProps): React.JSX.Element => {
  const [mode, setMode] = useState<OrbitMode>(initialMode);
  const [routes, setRoutes] = useState<readonly HyperRoute[]>(seed);

  const templateRows = useMemo(() => mapTemplateWithTemplateLiteral(rawRouteTemplateSource as never), []);

  const envelope = useMemo(
    () =>
      buildStressEnvelope(routes as never, mode) as {
        readonly templateRows: readonly string[];
        readonly score: number;
      },
    [routes, mode],
  );

  const grid = useMemo(() => {
    const records = routes.map((route) => {
      const [, , severity] = route.split(':');
      return {
        route,
        token: `${route}`,
        severity,
        isCritical: severity === 'critical' || severity === 'emergency' || severity === 'extreme',
      } satisfies OrbitRow;
    });
    const critical = records.filter((entry) => entry.isCritical);
    return {
      rows: records,
      critical,
      score: critical.length + records.length,
    };
  }, [routes]);

  const loadSeed = (next: OrbitMode) => {
    setMode(next);
  };

  const randomize = () => {
    setRoutes((current) => [...current].toSorted((left, right) => right.length - left.length) as readonly HyperRoute[]);
  };

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h3>Stress Orbit Workbench</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => loadSeed('preview')}>
            Preview
          </button>
          <button type="button" onClick={() => loadSeed('probe')}>
            Probe
          </button>
          <button type="button" onClick={() => loadSeed('recover')}>
            Recover
          </button>
          <button type="button" onClick={() => loadSeed('audit')}>
            Audit
          </button>
          <button type="button" onClick={randomize}>
            Sort Routes
          </button>
        </div>
      </header>
      <p style={{ color: '#334155' }}>
        route count {routes.length}, template routes {templateRows.length}, score {grid.score}
      </p>
      <p style={{ color: '#475569' }}>
        envelopes {envelope.score ?? 0}, critical count {grid.critical.length}
      </p>
      <div style={{ display: 'grid', gap: 6 }}>
        {grid.rows.map((row, index) => (
          <article
            key={`${row.route}-${index}`}
            style={{
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: 8,
              color: row.isCritical ? '#b91c1c' : '#0f172a',
              background: row.isCritical ? '#fef2f2' : '#f8fafc',
            }}
          >
            <strong>{row.route}</strong> — {row.token} — severity {row.severity}
          </article>
        ))}
      </div>
    </section>
  );
};
