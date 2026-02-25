import { FC, useMemo } from 'react';
import { useRecoveryStudioDiagnostics } from '../../hooks/useRecoveryStudioDiagnostics';

export type StudioPluginRailProps = {
  readonly pluginIds: readonly string[];
  readonly selectedPlugin?: string;
  readonly onChange: (plugin: string) => void;
  readonly compact?: boolean;
};

const normalize = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, '-');

export const StudioPluginRail: FC<StudioPluginRailProps> = ({ pluginIds, selectedPlugin, onChange, compact = false }) => {
  const normalized = useMemo(() => pluginIds.map((plugin) => normalize(plugin)), [pluginIds]);
  const diagnostics = useRecoveryStudioDiagnostics({ runs: [] });

  return (
    <section style={{ border: '1px solid #2f384f', borderRadius: 8, padding: compact ? 8 : 16 }}>
      <header>
        <h4 style={{ marginTop: 0 }}>Plugin rail</h4>
        <p>{diagnostics.uniquePlugins.length} unique</p>
      </header>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
        {normalized.map((plugin) => {
          const active = plugin === (selectedPlugin ?? '').toLowerCase();
          return (
            <li key={plugin}>
              <button
                type="button"
                onClick={() => onChange(plugin)}
                style={{
                  width: '100%',
                  justifyContent: 'space-between',
                  display: 'flex',
                  padding: 8,
                  borderRadius: 6,
                  border: active ? '2px solid #00b4ff' : '1px solid transparent',
                  background: active ? '#13223f' : '#12253b',
                  color: '#f7f9ff',
                }}
              >
                <span>{plugin}</span>
                <span>{active ? 'active' : 'idle'}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

