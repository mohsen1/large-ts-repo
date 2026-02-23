import { useState } from 'react';
import { IncidentFusionCommandConsole } from '../../components/incident-fusion/IncidentFusionCommandConsole';
import { startEngine } from '@service/incident-fusion-orchestrator';

const presets = ['acme-ops', 'nebula-grid', 'drill-team'];

export const IncidentFusionWorkspacePage = () => {
  const [tenant, setTenant] = useState('acme-ops');
  const [runState, setRunState] = useState('');

  const triggerEngine = async () => {
    const result = await startEngine(tenant);
    setRunState(result.ok ? `Engine completed: ${JSON.stringify(result.value)}` : `Engine failed: ${result.error}`);
  };

  return (
    <main style={{ padding: '1rem', color: '#d6e6f2', background: '#071321', minHeight: '100vh' }}>
      <section style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
        <label htmlFor="tenant-select" style={{ alignSelf: 'center' }}>
          Tenant
        </label>
        <select
          id="tenant-select"
          value={tenant}
          onChange={(event) => setTenant(event.target.value)}
          style={{ background: '#112740', color: '#d6e6f2', borderRadius: 8 }}
        >
          {presets.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </section>
      <IncidentFusionCommandConsole tenant={tenant} title={`Fusion operations for ${tenant}`} />
      <section style={{ marginTop: '1rem' }}>
        <button
          type="button"
          onClick={triggerEngine}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: 8,
            border: '1px solid #2b4260',
            background: '#11314f',
            color: '#d6e6f2',
          }}
        >
          Run fusion engine once
        </button>
        <p>{runState}</p>
      </section>
      <section style={{ marginTop: '1rem' }}>
        <article style={{ background: '#0f2235', border: '1px solid #22344b', borderRadius: 12, padding: '1rem' }}>
          <h3>Runbook notes</h3>
          <p>
            The command console aggregates signal entropy, scenario coupling, and actionability to orchestrate recovery fusion candidates.
          </p>
          <ul>
            <li>Signals are refreshed every 7.5 seconds and include stale resolution filters.</li>
            <li>Pulse history samples are collected from repository snapshot streams every 12 seconds.</li>
            <li>Automatic action suggestions are derived from deterministic schedule rules.</li>
            <li>Use a filtered tenant and scenario mix to isolate noisy data planes.</li>
          </ul>
        </article>
      </section>
    </main>
  );
};
