import type { FabricCadenceWorkspaceUiState } from '../types';

type FabricCadenceControlSurfaceProps = {
  readonly state: FabricCadenceWorkspaceUiState;
  readonly onBuild: () => Promise<void>;
  readonly onExecute: (draftId: string) => Promise<void>;
  readonly onClose: () => Promise<void>;
  readonly onTab: (tab: FabricCadenceWorkspaceUiState['activeTab']) => void;
};

const tabClass = (active: boolean) => (active ? 'active' : '');

export const FabricCadenceControlSurface = ({
  state,
  onBuild,
  onExecute,
  onClose,
  onTab,
}: FabricCadenceControlSurfaceProps) => {
  const draftId = state.draft?.draftId;

  return (
    <section style={{ padding: 12, border: '1px solid #2b3648', borderRadius: 12, marginBottom: 12 }}>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <button onClick={() => onBuild()} disabled={state.status === 'running'}>
          Draft cadence plan
        </button>
        <button
          onClick={() => draftId && onExecute(draftId)}
          disabled={!draftId || state.status === 'running'}
        >
          Execute active draft
        </button>
        <button onClick={() => onClose()} disabled={state.status === 'idle' || state.status === 'loading'}>
          Close workspace
        </button>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
        <button className={tabClass(state.activeTab === 'signals')} onClick={() => onTab('signals')}>
          Signals
        </button>
        <button className={tabClass(state.activeTab === 'plans')} onClick={() => onTab('plans')}>
          Plans
        </button>
        <button className={tabClass(state.activeTab === 'telemetry')} onClick={() => onTab('telemetry')}>
          Telemetry
        </button>
      </div>

      <p style={{ marginBottom: 4 }}>
        {`status=${state.status} · workspace=${state.workspaceId}`}
      </p>
      <p>{state.warnings.join(' | ') || 'no warnings'}</p>
    </section>
  );
};
