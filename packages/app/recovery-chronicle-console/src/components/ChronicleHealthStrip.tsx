import type { ReactElement } from 'react';
import type { PluginCardState } from '../types';

export interface ChronicleHealthStripProps {
  readonly plugins: readonly PluginCardState[];
  readonly warnings: readonly string[];
}

const statusText = (status: PluginCardState['status']): string => {
  switch (status) {
    case 'active':
      return 'active';
    case 'ready':
      return 'ready';
    case 'failed':
      return 'failed';
    default:
      return 'unknown';
  }
};

export const ChronicleHealthStrip = ({ plugins, warnings }: ChronicleHealthStripProps): ReactElement => {
  const hasWarnings = warnings.length > 0;

  return (
    <aside className="chronicle-health-strip">
      <div className={hasWarnings ? 'warning' : 'ok'}>{hasWarnings ? 'Warnings' : 'Healthy'}</div>
      <ul>
        {plugins.map((plugin) => (
          <li key={plugin.id} className={plugin.status}>
            <span>{plugin.name}</span>
            <span>{statusText(plugin.status)}</span>
          </li>
        ))}
      </ul>
      {warnings.length > 0 && (
        <pre>
          {warnings.map((warning) => (`- ${warning}`)).join('\n')}
        </pre>
      )}
    </aside>
  );
};
