import { useMemo, useState } from 'react';
import { useStreamLabOrchestrator } from '../hooks/useStreamLabOrchestrator';
import { useStreamLabTimeline } from '../hooks/useStreamLabTimeline';
import { buildDefaultStreamLabRequest } from '../stress-lab/orchestrator';
import { TopologyHeatmapPanel } from '../components/stress-lab/TopologyHeatmapPanel';
import { PolicyEnginePanel } from '../components/stress-lab/PolicyEnginePanel';
import { PluginCatalogPanel } from '../components/stress-lab/PluginCatalogPanel';
import { type StreamLabExecutionReport, type StreamLabRequest } from '../stress-lab/types';

type ProfileMode = 'adaptive' | 'balanced' | 'agile' | 'conservative';

const runbookSet = ['adaptive', 'balanced', 'agile', 'conservative'] as const;

const nextSet = (value: string, list: readonly ProfileMode[]) =>
  (list as readonly string[]).includes(value) ? (value as ProfileMode) : list[0];

const pluginOrderForMode = (mode: ProfileMode): readonly ['ingest-plugin' | 'policy-plugin' | 'topology-plugin', ...('ingest-plugin' | 'policy-plugin' | 'topology-plugin')[]] => {
  if (mode === 'agile') {
    return ['topology-plugin', 'policy-plugin'];
  }
  const scale = mode === 'conservative' ? 'topology-plugin' : 'ingest-plugin';
  return [scale, 'policy-plugin', 'topology-plugin'];
};

export const StreamLabPolicyPlaygroundPage = () => {
  const [mode, setMode] = useState<ProfileMode>('adaptive');
  const request: StreamLabRequest = buildDefaultStreamLabRequest('tenant-play', 'stream-policy');
  const [selectedRunbook, setSelectedRunbook] = useState('policy-reco');
  const { execute, report, loading, reset, traces, error } = useStreamLabOrchestrator({
    ...request,
    options: {
      ...request.options,
      useAdaptiveScale: mode !== 'conservative',
      pluginOrder: pluginOrderForMode(mode),
    },
  });

  const selected = useMemo(() => report?.result ?? null, [report]);
  const { timeline } = useStreamLabTimeline(report as StreamLabExecutionReport | null);

  return (
    <main>
      <h1>Policy Playground</h1>
      <p>Runbooks: {runbookSet.join(', ')}</p>
      {error ? <p style={{ color: 'maroon' }}>Error: {error}</p> : null}

      <label>
        Policy profile:
        <select
          value={mode}
          onChange={(event) => {
            const next = nextSet(event.currentTarget.value, runbookSet);
            setMode(next as ProfileMode);
          }}
        >
          {runbookSet.map((entry) => (
            <option key={entry} value={entry}>{entry}</option>
          ))}
        </select>
      </label>

      <div>
        <button type="button" onClick={() => void execute()} disabled={loading}>
          Execute Policy Plan
        </button>
        <button type="button" onClick={reset}>Reset Policy Session</button>
      </div>

      <section>
        <h2>Policy controls</h2>
        <p>Adaptive scale: {mode !== 'conservative' ? 'on' : 'off'}</p>
        <p>Plugin runbook: {selectedRunbook}</p>
        <button
          type="button"
          onClick={() => setSelectedRunbook(selectedRunbook === 'policy-reco' ? 'seed-normalizer' : 'policy-reco')}
        >
          Toggle runbook marker
        </button>
      </section>

      <PluginCatalogPanel
        catalog={['seed-normalizer', 'score-normalizer', 'policy-reco']}
        traces={selected?.trace ?? []}
        selected={selectedRunbook}
        onSelect={setSelectedRunbook}
      />

      {selected ? (
        <>
          <PolicyEnginePanel
            result={selected}
            selected={0}
            onSelectRunbook={(runbook) => setSelectedRunbook(runbook)}
          />
          <TopologyHeatmapPanel
            result={selected}
            onCellSelect={(cell) => {
              setSelectedRunbook(`${cell.plugin}-${cell.row}-${cell.col}`);
            }}
          />
          <section>
            <h3>Timeline</h3>
            <ul>
              {timeline.map((entry) => (
                <li key={`${entry.order}-${entry.label}`}>
                  {entry.order}. {entry.label} ({entry.status}) {entry.elapsedMs}ms
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      <p>Raw trace entries: {traces.length}</p>
    </main>
  );
};
