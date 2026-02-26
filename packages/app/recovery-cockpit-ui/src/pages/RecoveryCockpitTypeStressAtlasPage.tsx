import { useMemo } from 'react';
import { TypeStressAtlasBoard } from '../components/stress/TypeStressAtlasBoard';
import { useTypeStressAtlas } from '../hooks/useTypeStressAtlas';
import { useRecoveryCockpitAutomation } from '../hooks/useRecoveryCockpitAutomation';

export type AtlasRow = {
  readonly route: string;
  readonly tenant: string;
  readonly confidence: number;
  readonly score: number;
};

const line = (row: AtlasRow): string => `${row.tenant}:${row.route}:${row.score.toFixed(2)}`;

export const RecoveryCockpitTypeStressAtlasPage = () => {
  const {
    filtered,
    status,
    history,
    baseline,
    templateMap,
  } = useTypeStressAtlas();
  const automation = useRecoveryCockpitAutomation();

  const rows = useMemo<readonly AtlasRow[]>(
    () =>
      filtered.map((entry) => ({
        route: entry.route,
        tenant: entry.tenant,
        confidence: entry.confidence,
        score: entry.route.length + entry.confidence,
      })),
    [filtered],
  );

  const score = useMemo(() => rows.reduce((acc, row) => acc + row.score, 0), [rows]);

  return (
    <main style={{ padding: 16, color: '#e2e8f0', background: '#020617', minHeight: '100vh' }}>
      <h1>Type-stress atlas matrix</h1>
      <p>{status}</p>
      <TypeStressAtlasBoard title="Atlas orchestration" />
      <section style={{ marginTop: 8, border: '1px solid #334155', borderRadius: 8, padding: 12 }}>
        <h2>rows</h2>
        <div style={{ marginBottom: 8 }}>
          baseline={baseline}
          {' · '}
          score={score}
          {' · '}
          automationMode={automation.mode}
          {' · '}
          running={automation.loading ? 'loading' : 'idle'}
        </div>
        <ul>
          {rows.map((row) => (
            <li key={row.route}>
              {line(row)}
            </li>
          ))}
        </ul>
      </section>
      <section style={{ marginTop: 8, border: '1px solid #334155', borderRadius: 8, padding: 12 }}>
        <h2>template projection</h2>
        <ul>
          {Object.entries(templateMap).map(([route, template]) => (
            <li key={route}>
              <code>{route}</code>
              {' -> '}
              <span>{template}</span>
            </li>
          ))}
        </ul>
      </section>
      <section style={{ marginTop: 8, border: '1px solid #334155', borderRadius: 8, padding: 12 }}>
        <h2>trace</h2>
        <ol>
          {history.map((event, index) => (
            <li key={`${event.kind}-${index}`}>
              {event.kind}: {JSON.stringify(event)}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
};
