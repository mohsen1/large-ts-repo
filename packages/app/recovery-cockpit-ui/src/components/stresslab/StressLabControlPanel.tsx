import { FC, type ChangeEvent } from 'react';

export interface StressLabOption {
  readonly id: string;
  readonly title: string;
}

export interface StressLabControlPanelProps {
  readonly tenantId: string;
  readonly mode: 'plan' | 'simulate' | 'recommend' | 'report';
  readonly selectedRunbooks: readonly string[];
  readonly selectedSignals: readonly string[];
  readonly availableRunbooks: readonly StressLabOption[];
  readonly availableSignals: readonly StressLabOption[];
  readonly onChangeMode: (next: 'plan' | 'simulate' | 'recommend' | 'report') => void;
  readonly onToggleRunbook: (id: string) => void;
  readonly onToggleSignal: (id: string) => void;
  readonly onRun: () => void;
}

const buildModeButton = (value: 'plan' | 'simulate' | 'recommend' | 'report') => value;

export const StressLabControlPanel: FC<StressLabControlPanelProps> = ({
  tenantId,
  mode,
  selectedRunbooks,
  selectedSignals,
  availableRunbooks,
  availableSignals,
  onChangeMode,
  onToggleRunbook,
  onToggleSignal,
  onRun,
}) => {
  const selectedRunbookSet = new Set(selectedRunbooks);
  const selectedSignalSet = new Set(selectedSignals);

  return (
    <section style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 12, display: 'grid', gap: 10 }}>
      <header>
        <h3 style={{ margin: 0 }}>Control Plane</h3>
        <small>tenant: {tenantId}</small>
      </header>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {(['plan', 'simulate', 'recommend', 'report'] as const).map((next) => (
          <button key={next} type="button" onClick={() => onChangeMode(next)} style={{ opacity: mode === next ? 1 : 0.7 }}>
            {buildModeButton(next)}
          </button>
        ))}
      </div>

      <div>
        <h4>Runbooks</h4>
        <div style={{ display: 'grid', gap: 8 }}>
          {availableRunbooks.map((runbook) => {
            const checked = selectedRunbookSet.has(runbook.id);
            const onChange = (event: ChangeEvent<HTMLInputElement>) => {
              if (event.target.checked || !checked) {
                onToggleRunbook(runbook.id);
              }
            };
            return (
              <label key={runbook.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={checked} onChange={onChange} />
                <span>{runbook.title}</span>
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <h4>Signals</h4>
        <div style={{ display: 'grid', gap: 8 }}>
          {availableSignals.map((signal) => {
            const checked = selectedSignalSet.has(signal.id);
            return (
              <label key={signal.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleSignal(signal.id)}
                />
                <span>{signal.title}</span>
              </label>
            );
          })}
        </div>
      </div>

      <button type="button" onClick={onRun}>
        Run Stress Lab
      </button>
    </section>
  );
};
