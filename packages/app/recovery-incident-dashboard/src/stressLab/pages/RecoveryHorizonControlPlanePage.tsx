import { useMemo, useState } from 'react';
import { useHorizonStudioWorkspace } from '../hooks/useHorizonStudioWorkspace';
import { HorizonStudioTopology } from '../components/HorizonStudioTopology';
import { HorizonStudioPluginDeck } from '../components/HorizonStudioPluginDeck';
import { HorizonStudioEventFeed } from '../components/HorizonStudioEventFeed';
import { HorizonStudioRunbookBoard } from '../components/HorizonStudioRunbookBoard';
import type { PluginStage } from '@domain/recovery-horizon-engine';

const initialStage = 'ingest';

export const RecoveryHorizonControlPlanePage = () => {
  const [stage, setStage] = useState<PluginStage>(initialStage);
  const [signalKind, setSignalKind] = useState<PluginStage | 'all'>('all');
  const { state, start, stop, refresh, setSelectedSignalKind } = useHorizonStudioWorkspace('tenant-001');

  const canRun = state.tenantId.length > 0 && !state.loading;
  const onStart = () => void start('tenant-001', 'operator');

  const actions = useMemo(
    () => ({
      start: onStart,
      stop,
      refresh,
      setStage,
      setSignalKind: (next: PluginStage | 'all') => {
        setSignalKind(next);
        setSelectedSignalKind(next);
      },
    }),
    [refresh, setSelectedSignalKind, stop],
  );

  return (
    <main className="horizon-control-plane">
      <header>
        <h1>Recovery Horizon Control Plane</h1>
        <p>Tenant: {state.tenantId}</p>
      </header>

      <section className="control-strip">
        <button type="button" onClick={() => void actions.start()} disabled={!canRun}>
          start
        </button>
        <button type="button" onClick={() => void actions.stop()}>
          stop
        </button>
        <button type="button" onClick={() => void actions.refresh()}>
          refresh
        </button>
        <small>{state.loading ? 'running' : 'idle'}</small>
      </section>

      <HorizonStudioTopology status={state.status} workspace={state.status.workspaceId} />

      <HorizonStudioRunbookBoard
        status={state.status}
        selected={signalKind}
        onSignalKind={actions.setSignalKind}
      />

      <HorizonStudioPluginDeck
        plans={state.status.plans}
        selectedStage={stage}
        onStageSelect={actions.setStage}
        onRun={(planId) => {
          void start('tenant-001', planId);
        }}
      />

      <HorizonStudioEventFeed
        status={state.status}
        eventKind={signalKind}
        onKindChange={actions.setSignalKind}
      />

      <section className="status-log">
        <h3>Message Log</h3>
        <ul>
          {state.messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
