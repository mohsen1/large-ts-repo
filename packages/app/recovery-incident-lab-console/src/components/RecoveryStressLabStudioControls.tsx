import { type ReactElement, useMemo } from 'react';

export interface RecoveryStressLabStudioControlsProps {
  readonly canRun: boolean;
  readonly disabled: boolean;
  readonly onReset: () => void;
  readonly onRun: () => void;
  readonly onTenant: (tenantId: string) => void;
  readonly onAddSignal: (severity: 'low' | 'medium' | 'high' | 'critical') => void;
}

export const RecoveryStressLabStudioControls = ({
  canRun,
  disabled,
  onReset,
  onRun,
  onTenant,
  onAddSignal,
}: RecoveryStressLabStudioControlsProps): ReactElement => {
  const severities = useMemo(() => ['low', 'medium', 'high', 'critical'] as const, []);

  return (
    <section className="recovery-stress-lab-studio-controls">
      <header>
        <h2>Studio controls</h2>
      </header>
      <div>
        <label htmlFor="tenant-input">tenant</label>
        <input
          id="tenant-input"
          type="text"
          defaultValue="studio-tenant-default"
          onBlur={(event) => {
            onTenant(event.currentTarget.value);
          }}
        />
      </div>
      <div className="studio-actions">
        <button type="button" onClick={onRun} disabled={!canRun || disabled}>
          Run studio
        </button>
        <button type="button" onClick={onReset} disabled={disabled}>
          Reset
        </button>
      </div>
      <div className="signal-actions">
        {severities.map((severity) => (
          <button key={severity} type="button" onClick={() => onAddSignal(severity)}>
            Add {severity} signal
          </button>
        ))}
      </div>
    </section>
  );
};
