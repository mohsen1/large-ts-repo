import { useMemo } from 'react';
import type { ChangeEvent } from 'react';
import {
  type UseTypeStressAtlasOptions,
  useTypeStressAtlas,
  getAtlasRouteDiagnostics,
} from '../hooks/useTypeStressAtlas';

interface StressAtlasPanelProps {
  readonly title: string;
  readonly options?: UseTypeStressAtlasOptions;
}

export const RecoveryTscStressAtlasPanel = ({
  title,
  options,
}: StressAtlasPanelProps) => {
  const {
    query,
    setQuery,
    payloads,
    filtered,
    selection,
    toggle,
    clear,
    hydrate,
    traces,
    routeTemplateCount,
    lookupByType,
  } = useTypeStressAtlas(options);

  const metrics = useMemo(() => {
    const severities = payloads.reduce(
      (acc, payload) => {
        acc[payload.severity] += 1;
        return acc;
      },
      { low: 0, medium: 0, high: 0 },
    );

    return {
      total: payloads.length,
      filtered: filtered.length,
      selected: selection.size,
      ...severities,
    };
  }, [payloads, filtered, selection]);

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value);
  };

  return (
    <section>
      <h2>{title}</h2>
      <p>routes {routeTemplateCount}</p>
      <p>
        total {metrics.total} / filtered {metrics.filtered} / selected {metrics.selected}
      </p>
      <div>
        <p>
          severity low {metrics.low} medium {metrics.medium} high {metrics.high}
        </p>
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input value={query} onChange={onChange} placeholder="route fragment" />
        <button type="button" onClick={hydrate}>
          hydrate-all
        </button>
        <button type="button" onClick={clear}>
          clear
        </button>
      </div>
      <ul>
        {filtered.map((payload) => {
          const isSelected = selection.has(payload.route);
          const diagnostics = getAtlasRouteDiagnostics(payload.route);
          const envelope = lookupByType[payload.route];
          return (
            <li key={payload.route}>
              <button type="button" onClick={() => toggle(payload.route)}>
                {isSelected ? 'unselect' : 'select'}
              </button>
              <strong>{payload.route}</strong>
              <span> severity {payload.severity}</span>
              <div>
                {diagnostics.decision.map((item) => (
                  <span key={`${payload.route}-${item.kind}-${String(item.route)}`}>{item.kind}</span>
                ))}
              </div>
              <pre>{JSON.stringify(envelope ?? diagnostics.projection, null, 2)}</pre>
            </li>
          );
        })}
      </ul>
      <div>
        <h3>Trace</h3>
        <ul>
          {traces.map((trace, index) => (
            <li key={`${trace.kind}-${trace.route}-${index}`}>
              {trace.route}: {trace.kind} {trace.kind === 'trace' ? trace.trace : trace.kind === 'error' ? trace.message : trace.route}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
