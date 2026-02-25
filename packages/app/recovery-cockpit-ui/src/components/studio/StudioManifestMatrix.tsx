import { type PluginId, type StudioManifestCatalog } from '@shared/cockpit-studio-core';
import { useStudioRegistry, summarizePluginRegistry } from '../../hooks/useStudioRegistry';

export type StudioManifestMatrixProps = {
  readonly manifest?: StudioManifestCatalog;
  readonly selectedPlugin?: PluginId;
  readonly onSelectPlugin?: (pluginId: PluginId) => void;
};

export const StudioManifestMatrix = ({
  manifest,
  selectedPlugin,
  onSelectPlugin,
}: StudioManifestMatrixProps) => {
  const plugins = manifest?.pluginCatalog ?? [];
  const registry = summarizePluginRegistry(plugins);
  const { byDomain } = useStudioRegistry(plugins);

  return (
    <section style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 12, background: '#f8fafc' }}>
      <h3 style={{ marginTop: 0 }}>Studio manifest matrix</h3>
      <div style={{ display: 'grid', gap: 8 }}>
        <div>
          <strong>Tenant:</strong> {manifest ? manifest.tenantId : 'unloaded'}
        </div>
        <div>
          <strong>Workspace:</strong> {manifest ? manifest.workspaceId : 'unloaded'}
        </div>
        <div>
          <strong>Plugins:</strong> {registry.total}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))' }}>
          <div>
            <strong>Domain buckets</strong>
            {Object.keys(byDomain).length === 0 ? <p>No buckets</p> : null}
            {Object.entries(byDomain).map(([domain, ids]) => (
              <p key={domain}>
                {domain}: {ids.length}
              </p>
            ))}
          </div>
          <div>
            <strong>Top plugins</strong>
            {registry.topPlugins.map((entry) => (
              <button
                type="button"
                key={entry}
                onClick={() => onSelectPlugin?.(entry)}
                style={{
                  display: 'block',
                  marginBottom: 4,
                  background: selectedPlugin === entry ? '#0284c7' : undefined,
                  color: selectedPlugin === entry ? '#fff' : '#0f172a',
                }}
              >
                {entry}
              </button>
            ))}
          </div>
          <div>
            <strong>Stage count</strong>
            {Object.entries(registry.byStage).map(([stage, count]) => (
              <p key={stage}>
                {stage}: {count}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
