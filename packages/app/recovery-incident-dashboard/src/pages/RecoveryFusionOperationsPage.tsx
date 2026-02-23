import { useState } from 'react';
import { FusionCommandDeck } from '../components/fusion/FusionCommandDeck';
import { FusionReadinessPulse } from '../components/fusion/FusionReadinessPulse';
import { useRecoveryFusionWorkspace } from '../hooks/useRecoveryFusionWorkspace';
import type { FusionBundle } from '@domain/recovery-fusion-intelligence';
import { withBrand } from '@shared/core';

interface PageInput {
  readonly bundle: FusionBundle;
}

export const RecoveryFusionOperationsPage = ({ bundle }: PageInput) => {
  const [tenant, setTenant] = useState('tenant-a');
  const { state, actions, snapshot, diagnostics } = useRecoveryFusionWorkspace({ bundle, tenant });

  return (
    <main style={{ display: 'grid', gap: '1rem' }}>
      <header>
        <h1>Recovery Fusion Operations</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <label>
            Tenant
            <input
              value={tenant}
              onChange={(event) => setTenant(event.target.value)}
            />
          </label>
          <button type="button" onClick={() => void actions.refresh()}>
            Refresh
          </button>
          <button type="button" onClick={() => void actions.runFusion()}>
            Run Fusion Console
          </button>
        </div>
      </header>

      <section>
        <h2>Snapshot</h2>
        <p>{diagnostics.join(' | ')}</p>
        <p>Loading: {state.loading.toString()}</p>
      </section>

      <section>
        <h2>Workspace State</h2>
        <p>Selected wave: {state.selectedWaveId ?? 'none'}</p>
        <p>
          Readiness: {state.readinessState} ·
          commands: {state.summary?.commandCount ?? 0}
        </p>
      </section>

      <FusionReadinessPulse
        snapshot={snapshot}
        selectedWaveId={state.selectedWaveId}
        onWaveSelect={(waveId) => actions.selectWave(waveId)}
      />
      <FusionCommandDeck
        bundle={snapshot.waves.length ? bundle : ({
          id: 'empty-bundle',
          tenant,
          runId: withBrand(tenant, 'RecoveryRunId'),
          session: bundle.session,
          planId: withBrand('empty-plan', 'RunPlanId'),
          waves: [],
          signals: [],
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        } as FusionBundle)}
        onSelect={(waveId) => actions.selectWave(waveId)}
      />

      <section>
        <h2>Actions</h2>
        <p>Signal log messages: {state.commandLog.length}</p>
        <button
          type="button"
          onClick={() => void actions.acceptSignals([])}
        >
          Accept zero signals
        </button>
      </section>
    </main>
  );
};
