import { useMemo, useState } from 'react';
import {
  useTypeLevelStressOrchestrator,
} from '../../hooks/useTypeLevelStressOrchestrator';

export const TypeStressOrchestraPanel = () => {
  const {
    rows,
    selectedRoute,
    selectedPolicy,
    search,
    setSearch,
    mode,
    setMode,
    next,
    previous,
    branchTrace,
    catalogRunbook,
    instantiations,
    routeTuple,
    branchToken,
    conflictDepth,
  } = useTypeLevelStressOrchestrator();
  const [modeLabel, setModeLabel] = useState(mode);
  const selectedLabel = selectedRoute.length ? selectedRoute : 'none';

  const manifest = useMemo(
    () => rows.slice(0, 12).map((row) => ({ route: row.route, score: row.branch.score, severity: row.severity })),
    [rows],
  );

  return (
    <section style={{ border: '1px solid #33476c', borderRadius: 10, padding: 12, background: '#05101f' }}>
      <h3 style={{ marginTop: 0 }}>Type-level stress orchestrator</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <input
            style={{ width: '100%', padding: 8, marginBottom: 8 }}
            value={search}
            placeholder="search route"
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={mode} onChange={(event) => setMode(event.currentTarget.value as 'all' | 'critical' | 'stable')}>
              <option value="all">all</option>
              <option value="critical">critical</option>
              <option value="stable">stable</option>
            </select>
            <button type="button" onClick={() => setModeLabel(mode)}>
              keep
            </button>
            <span>{modeLabel}</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <strong>selected: </strong>{selectedLabel}
          </div>
          <div>policy: {selectedPolicy}</div>
          <div>tuple: {routeTuple.domain}/{routeTuple.verb}/{routeTuple.entity}</div>
          <div>branch token: {branchToken}</div>
          <div>conflict depth: {String(conflictDepth)}</div>
          <div>solvers: {instantiations.length}</div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button type="button" onClick={previous}>
              previous
            </button>
            <button type="button" onClick={next}>
              next
            </button>
          </div>
        </div>
        <div>
          <h4>catalog</h4>
          {manifest.map((item) => (
            <div
              key={item.route}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontFamily: 'monospace',
                marginBottom: 4,
              }}
            >
              <span>{item.route}</span>
              <span>
                {item.severity} · {item.score}
              </span>
            </div>
          ))}
          <pre style={{ marginTop: 8, background: '#01070f', color: '#9dd0ff', padding: 8, maxHeight: 160, overflow: 'auto' }}>
            {JSON.stringify(catalogRunbook.configs, null, 2)}
          </pre>
          <pre style={{ marginTop: 8, background: '#020b17', color: '#a3f5ce', padding: 8, maxHeight: 120, overflow: 'auto' }}>
            {JSON.stringify(branchTrace, null, 2)}
          </pre>
        </div>
      </div>
    </section>
  );
};
