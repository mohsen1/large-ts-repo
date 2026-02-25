import type { ReactElement } from 'react';
import { useChronicleLabSession } from '../hooks/useChronicleLabSession';
import { useChronicleLabCatalog } from '../hooks/useChronicleLabCatalog';
import type { ChroniclePluginDescriptor } from '@shared/chronicle-orchestration-protocol';

export interface ChronicleLabControlProps {
  readonly tenant: string;
  readonly route: string;
  readonly plugins: readonly ChroniclePluginDescriptor[];
  readonly onStatus?: (status: string) => void;
}

export const ChronicleLabControl = ({ tenant, route, plugins, onStatus }: ChronicleLabControlProps): ReactElement => {
  const session = useChronicleLabSession(tenant, route, plugins);
  const catalog = useChronicleLabCatalog(tenant, plugins);

  const canStart = !session.running && plugins.length > 0;

  return (
    <section>
      <h2>Lab Control Surface</h2>
      <p>
        Route: <strong>{session.route}</strong>
      </p>
      <p>
        Plugins in catalog: <strong>{catalog.totalPlugins}</strong>
      </p>
      <div>
        <button type="button" disabled={!canStart} onClick={() => void session.start().then(() => onStatus?.(session.status))}>
          Start Simulation
        </button>
        <button type="button" onClick={session.stop}>
          Stop
        </button>
        <button type="button" onClick={session.reset}>
          Reset
        </button>
      </div>
      <div>
        <p>
          Status: <code>{session.status}</code>
        </p>
        <p>
          Score: <code>{session.score}</code>
        </p>
      </div>
      <details>
        <summary>Session labels</summary>
        <ul>
          {session.labels.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </details>
    </section>
  );
};
