import { useMemo } from 'react';
import type { ArcaneCatalogKind, ArcanePlugin, ArcanePluginKind } from '../types';

interface ArcanePluginConsoleProps {
  readonly catalog: {
    [kind in ArcaneCatalogKind<readonly ArcanePlugin[]>]: readonly ArcanePlugin[];
  };
  readonly selectedKinds: readonly ArcanePluginKind[];
  readonly onToggleKind: (kind: ArcanePluginKind) => void;
}

interface PluginRow {
  readonly pluginId: string;
  readonly name: string;
  readonly kind: ArcanePluginKind;
  readonly route: string;
  readonly priority: number;
  readonly tags: string;
}

const describePriority = (priority: number): string => {
  return priority >= 4 ? 'high' : priority >= 2 ? 'medium' : 'low';
};

const renderRoute = (route: string): string =>
  route
    .split('/')
    .filter((segment) => segment.length > 0)
    .join(' / ');

export const ArcanePluginConsole = ({ catalog, selectedKinds, onToggleKind }: ArcanePluginConsoleProps) => {
  const rows = useMemo(() => {
    const list: PluginRow[] = [];
    for (const [kind, plugins] of Object.entries(catalog)) {
      for (const plugin of plugins as readonly ArcanePlugin[]) {
        list.push({
          pluginId: String(plugin.manifest.pluginId),
          name: plugin.manifest.name,
          kind: plugin.manifest.kind,
          route: plugin.manifest.route,
          priority: plugin.manifest.priority,
          tags: Object.keys(plugin.manifest.tags).join(', '),
        });
      }
    }

    return list.sort((left, right) => right.priority - left.priority);
  }, [catalog]);

  return (
    <section className="arcane-plugin-console">
      <header>
        <h3>Arcane Plugin Catalog</h3>
        <small>{rows.length} plugins</small>
      </header>
      <div className="arcane-kind-buttons">
        {Object.keys(catalog).map((kind) => {
          const typedKind = kind as ArcanePluginKind;
          const active = selectedKinds.includes(typedKind);
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={active}
              onClick={() => {
                onToggleKind(typedKind);
              }}
            >
              {kind}
            </button>
          );
        })}
      </div>
      <ul>
        {rows.map((row) => {
          const isActive = selectedKinds.includes(row.kind);
          return (
            <li key={row.pluginId} className={isActive ? 'active' : 'idle'}>
              <h4>{row.name}</h4>
              <p>
                <strong>{row.kind}</strong> · {renderRoute(row.route)}
              </p>
              <p>
                {row.tags || 'untagged'} · score {describePriority(row.priority)}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
