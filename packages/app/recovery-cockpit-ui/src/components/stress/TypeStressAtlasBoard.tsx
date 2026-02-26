import { useMemo } from 'react';
import { useTypeStressAtlas, type AtlasDispatchResult } from '../../hooks/useTypeStressAtlas';
import type { AtlasRoute } from '@shared/type-level-hub';

export type BoardProps = {
  readonly title: string;
  readonly onDispatch?: (result: AtlasDispatchResult) => void;
};

type TraceItem = {
  readonly kind: 'route' | 'dispatch' | 'status';
  readonly label: string;
};

const modeColor = (status: string): string => {
  if (status.includes('Reviewing')) return '#16a34a';
  if (status.includes('Running')) return '#2563eb';
  if (status.includes('Preparing')) return '#f59e0b';
  if (status.includes('failed') || status.includes('Failed')) return '#dc2626';
  return '#6b7280';
};

const mapTrace = (trace: ReturnType<typeof useTypeStressAtlas>['history']): TraceItem[] =>
  trace.map((entry) => {
    if (entry.kind === 'route') {
      return { kind: 'route', label: `${entry.route} ${entry.template}` };
    }
    if (entry.kind === 'dispatch') {
      return { kind: 'dispatch', label: `dispatch ok=${entry.ok} len=${entry.resultLength}` };
    }
    return { kind: 'status', label: `status:${entry.mode ?? 'idle'}` };
  });

const normalizeTemplate = (value: string): string => String(value);

export const TypeStressAtlasBoard = ({ title, onDispatch }: BoardProps) => {
  const {
    status,
    mode,
    activeRoute,
    setActiveRoute,
    filtered,
    templateMap,
    history,
    selectedTenant,
    setSelectedTenant,
    baseline,
    bootstrap,
    dispatch,
  } = useTypeStressAtlas();

  const list = useMemo(
    () => filtered.map((entry) => ({ route: entry.route, tenant: entry.tenant, confidence: entry.confidence })),
    [filtered],
  );

  const traces = useMemo(() => mapTrace(history), [history]);

  return (
    <section style={{ padding: 12, border: '1px solid #334155', borderRadius: 10 }}>
      <h3>{title}</h3>
      <p style={{ color: modeColor(status) }}>{status}</p>
      <p>
        mode={mode}
        {' · '}
        baseline={baseline}
      </p>
      <div style={{ marginBottom: 8 }}>
        <label htmlFor="atlas-tenant">Tenant</label>
        <input
          id="atlas-tenant"
          value={selectedTenant}
          onChange={(event) => setSelectedTenant(event.target.value)}
          style={{ marginLeft: 8 }}
        />
      </div>
      <div style={{ marginBottom: 8, display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => bootstrap()}>
          bootstrap
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!filtered[0]) {
              return;
            }
            const result = await dispatch({
              tenant: filtered[0].tenant,
              action: 'bootstrap',
              target: filtered[0].tenant,
              confidence: 100,
            });
            onDispatch?.(result);
          }}
        >
          dispatch first
        </button>
      </div>
      <div style={{ marginBottom: 8 }}>
        <strong>active:</strong>
        {' '}
        {activeRoute}
      </div>
      <div style={{ marginBottom: 8 }}>
        <select
          value={activeRoute}
          onChange={(event) => setActiveRoute(event.target.value as AtlasRoute)}
          style={{ minWidth: 240 }}
        >
          {list.map((entry) => (
            <option value={entry.route} key={entry.route}>
              {entry.route}
            </option>
          ))}
        </select>
      </div>
      <section>
        <h4>Envelope table</h4>
        <ul>
          {list.map((entry) => {
        const candidate = entry.route as AtlasRoute;
            const template = templateMap[candidate];
            return (
              <li key={entry.route}>
                <span>{entry.tenant}</span>
                {' · '}
                <strong>{entry.route}</strong>
                {' · '}
                <em>{entry.confidence}</em>
                {' · '}
                <code>{template ? normalizeTemplate(template) : 'missing'}</code>
              </li>
            );
          })}
        </ul>
      </section>
      <section style={{ marginTop: 8 }}>
        <h4>dispatch traces</h4>
        <ul>
          {traces.map((entry, index) => (
            <li key={`${entry.kind}-${index}`}>
              {entry.label}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
};
