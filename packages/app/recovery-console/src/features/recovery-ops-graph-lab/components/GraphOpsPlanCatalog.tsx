import { type ChangeEvent } from 'react';
import type { GraphLabWorkspaceState } from '../types';

interface GraphOpsPlanCatalogProps {
  readonly workspace: GraphLabWorkspaceState;
  readonly onTogglePlugin: (pluginId: string) => void;
  readonly onProfileChange: (event: ChangeEvent<HTMLSelectElement>) => void;
}

const profiles = ['tenant-primary:v1', 'ops-latency:v1', 'global-observability:v2'] as const;

export const GraphOpsPlanCatalog = ({ workspace, onTogglePlugin, onProfileChange }: GraphOpsPlanCatalogProps) => {
  return (
    <section style={{ border: '1px solid #2a2e3f', borderRadius: 12, padding: '0.85rem', background: '#0b1220' }}>
      <h2>Plugin catalog</h2>
      <label style={{ display: 'grid', gap: '0.45rem', marginBottom: '0.75rem' }}>
        Active profile
        <select onChange={onProfileChange} value={workspace.profileId} style={{ width: 280 }}>
          {profiles.map((profile) => (
            <option key={profile} value={profile}>
              {profile}
            </option>
          ))}
        </select>
      </label>
      <ul style={{ display: 'grid', gap: '0.5rem', listStyle: 'none', margin: 0, padding: 0 }}>
        {workspace.selectedPluginIds.map((pluginId) => {
          const active = workspace.selectedPluginIds.includes(pluginId);
          return (
            <li key={pluginId} style={{ border: '1px solid #243041', padding: '0.55rem', borderRadius: 8 }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', gap: '0.7rem', alignItems: 'center' }}>
                <span>{pluginId}</span>
                <input
                  type='checkbox'
                  checked={active}
                  onChange={() => onTogglePlugin(pluginId)}
                />
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
