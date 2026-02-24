import { useMemo } from 'react';
import { SignalKind } from '@domain/adaptive-ops';

interface PlaybookControlPanelProps {
  tenantId: string;
  maxActions: number;
  preferredKinds: readonly SignalKind[];
  running: boolean;
  lastError: string | null;
  onTenantChange: (tenantId: string) => void;
  onMaxActionsChange: (maxActions: number) => void;
  onKindsChange: (kinds: readonly SignalKind[]) => void;
  onExecute: () => void;
}

const allKinds: readonly SignalKind[] = ['error-rate', 'latency', 'availability', 'cost-variance', 'manual-flag'];

export const PlaybookControlPanel = ({
  tenantId,
  maxActions,
  preferredKinds,
  running,
  lastError,
  onTenantChange,
  onMaxActionsChange,
  onKindsChange,
  onExecute,
}: PlaybookControlPanelProps) => {
  const orderedKinds = useMemo(
    () =>
      allKinds
        .map((kind) => ({
          kind,
          active: preferredKinds.includes(kind),
        }))
        .filter((entry) => entry.active),
    [preferredKinds],
  );

  const toggleKind = (kind: SignalKind) => {
    const next = preferredKinds.includes(kind)
      ? preferredKinds.filter((entry) => entry !== kind)
      : [...preferredKinds, kind];
    onKindsChange(next);
  };

  return (
    <section className="playbook-control-panel">
      <h3>Playbook Controls</h3>

      <label>
        Tenant
        <input
          value={tenantId}
          onChange={(event) => onTenantChange(event.target.value)}
          disabled={running}
        />
      </label>

      <label>
        Max actions
        <input
          type="range"
          min={1}
          max={24}
          value={maxActions}
          onChange={(event) => onMaxActionsChange(Number(event.target.value))}
          disabled={running}
        />
        <strong>{maxActions}</strong>
      </label>

      <fieldset>
        <legend>Signal kinds</legend>
        <div className="signal-kinds">
          {allKinds.map((kind) => (
            <label key={kind}>
              <input
                type="checkbox"
                checked={preferredKinds.includes(kind)}
                onChange={() => toggleKind(kind)}
                disabled={running}
              />
              {kind}
            </label>
          ))}
        </div>
      </fieldset>

      <button onClick={onExecute} disabled={running || orderedKinds.length === 0}>
        {running ? 'Running...' : 'Run playbook'}
      </button>

      {lastError ? <p className="playbook-error">{lastError}</p> : null}
    </section>
  );
};
