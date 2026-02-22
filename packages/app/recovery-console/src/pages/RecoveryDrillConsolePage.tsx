import { useState } from 'react';

import { RecoveryDrillCatalogPanel } from '../components/RecoveryDrillCatalogPanel';
import { RecoveryDrillTelemetryPanel } from '../components/RecoveryDrillTelemetryPanel';
import { RecoveryDrillRunBoard } from '../components/RecoveryDrillRunBoard';

interface RecoveryDrillConsolePageProps {
  readonly tenant?: string;
}

export const RecoveryDrillConsolePage = ({ tenant = 'global' }: RecoveryDrillConsolePageProps) => {
  const [mode, setMode] = useState<'catalog' | 'telemetry' | 'runs'>('catalog');

  return (
    <main className="recovery-drill-console-page">
      <header>
        <h1>Recovery Drill Console</h1>
        <p>Tenant: {tenant}</p>
        <nav>
          <button type="button" onClick={() => setMode('catalog')}>
            Catalog
          </button>
          <button type="button" onClick={() => setMode('telemetry')}>
            Telemetry
          </button>
          <button type="button" onClick={() => setMode('runs')}>
            Runs
          </button>
        </nav>
      </header>
      {mode === 'catalog' ? (
        <RecoveryDrillCatalogPanel
          tenant={tenant}
          onRunTemplate={() => {
            return;
          }}
        />
      ) : mode === 'telemetry' ? (
        <RecoveryDrillTelemetryPanel tenant={tenant} />
      ) : (
        <RecoveryDrillRunBoard tenant={tenant} />
      )}
    </main>
  );
};
