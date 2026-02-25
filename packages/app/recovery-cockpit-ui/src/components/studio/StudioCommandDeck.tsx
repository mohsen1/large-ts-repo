import { ChangeEvent, FormEvent, useMemo, useState } from 'react';
import { type PluginId, type StudioRunOutput } from '@shared/cockpit-studio-core';

export type CommandDeckProps = {
  readonly pluginIds: readonly PluginId[];
  readonly selectedPlugin?: PluginId;
  readonly running: boolean;
  readonly onRun: (scenario: string, payload: Record<string, unknown>) => Promise<void>;
  readonly onSelectPlugin: (pluginId: PluginId | undefined) => void;
};

type PresetKey = 'balanced' | 'chaotic' | 'audit';

export const StudioCommandDeck = ({
  pluginIds,
  selectedPlugin,
  running,
  onRun,
  onSelectPlugin,
}: CommandDeckProps) => {
  const [scenario, setScenario] = useState('baseline');
  const [customPayload, setCustomPayload] = useState('{"note":"initial"}');
  const [preset, setPreset] = useState<PresetKey>('balanced');
  const presets = useMemo(
    () =>
      new Map<PresetKey, Record<string, unknown>>([
        ['balanced', { laneCount: 3, noise: 0.22, target: 'steady' }],
        ['chaotic', { laneCount: 12, noise: 0.78, target: 'aggressive' }],
        ['audit', { laneCount: 1, noise: 0.04, target: 'validated' }],
      ]),
    [],
  );

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(customPayload) as Record<string, unknown>;
    } catch {
      payload = { note: 'invalid-json-fallback', preset };
    }
    await onRun(`${scenario}-${preset}-${selectedPlugin ?? 'all'}`, {
      ...payload,
      ...presets.get(preset),
      selectedPlugin: selectedPlugin ?? 'all',
      pluginCount: pluginIds.length,
    });
  };

  const onScenario = (event: ChangeEvent<HTMLInputElement>) => {
    setScenario(event.target.value);
  };

  const onPayload = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setCustomPayload(event.target.value);
  };

  const onPreset = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value as PresetKey;
    setPreset(value);
  };

  return (
    <section style={{ display: 'grid', gap: 10, border: '1px solid #d1d5db', borderRadius: 8, padding: 12, background: '#f8fafc' }}>
      <h3 style={{ margin: 0 }}>Studio command deck</h3>
      <p style={{ margin: 0 }}>Plugin entries: {pluginIds.length}</p>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 10 }}>
        <label>
          Scenario label
          <input
            value={scenario}
            onChange={onScenario}
            style={{ display: 'block', width: '100%', marginTop: 4 }}
            placeholder="Scenario"
          />
        </label>
        <label>
          Preset
          <select value={preset} onChange={onPreset}>
            {(['balanced', 'chaotic', 'audit'] as const).map((option) => (
              <option value={option} key={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          Plugin
          <select
            value={selectedPlugin ?? 'all'}
            onChange={(event) =>
              onSelectPlugin((event.target.value === 'all' ? undefined : (event.target.value as PluginId)) || undefined)
            }
          >
            <option value="all">All plugins</option>
            {pluginIds.map((pluginId) => (
              <option key={pluginId} value={pluginId}>
                {pluginId}
              </option>
            ))}
          </select>
        </label>
        <label>
          Payload JSON
          <textarea value={customPayload} onChange={onPayload} rows={8} style={{ width: '100%' }} />
        </label>
        <button type="submit" disabled={running}>
          {running ? 'Executing...' : 'Run scenario'}
        </button>
      </form>
      <small style={{ color: '#475569' }}>JSON payload merged with scenario preset at submit time.</small>
    </section>
  );
};

export const formatRunResult = (run?: StudioRunOutput): string => {
  if (!run) return 'No run';
  return [
    `runId=${run.runId}`,
    `ok=${run.ok}`,
    `events=${run.events.length}`,
    `score=${run.result.score}`,
    `plugins=${run.graph.length}`,
  ].join(' · ');
};
