import { ChangeEvent, FormEvent } from 'react';
import type { PluginStage } from '@domain/recovery-horizon-engine';

interface HorizonLabControlPanelProps {
  readonly tenantId: string;
  readonly selected: readonly PluginStage[];
  readonly available: readonly PluginStage[];
  readonly canRun: boolean;
  readonly busy: boolean;
  readonly refreshMs: number;
  readonly lastError: string | null;
  readonly onTenantChange: (value: string) => void;
  readonly onRefreshMsChange: (value: number) => void;
  readonly onToggleStage: (stage: PluginStage) => void;
  readonly onRun: () => void;
  readonly onRefresh: () => void;
}

export const HorizonLabControlPanel = ({
  tenantId,
  selected,
  available,
  canRun,
  busy,
  refreshMs,
  lastError,
  onTenantChange,
  onRefreshMsChange,
  onToggleStage,
  onRun,
  onRefresh,
}: HorizonLabControlPanelProps) => {
  const onTenantInput = (event: ChangeEvent<HTMLInputElement>) => {
    onTenantChange(event.target.value);
  };

  const onRefreshMs = (event: ChangeEvent<HTMLInputElement>) => {
    const next = Number(event.target.value);
    onRefreshMsChange(Number.isFinite(next) ? Math.max(200, Math.min(10_000, Math.floor(next))) : 500);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    onRefresh();
  };

  return (
    <section className="horizon-lab-control-panel">
      <h2>Horizon Lab Controls</h2>

      <form onSubmit={onSubmit} className="control-grid">
        <label>
          Tenant
          <input value={tenantId} onChange={onTenantInput} disabled={busy} placeholder="tenant id" />
        </label>

        <label>
          Refresh (ms)
          <input
            type="number"
            min={200}
            max={10_000}
            value={refreshMs}
            onChange={onRefreshMs}
            disabled={busy}
          />
        </label>
      </form>

      <section className="stage-toggles">
        <h3>Stage Selection</h3>
        <div>
          {available.map((stage) => {
            const active = selected.includes(stage);
            return (
              <label key={stage}>
                <input
                  type="checkbox"
                  checked={active}
                  disabled={busy}
                  onChange={() => {
                    onToggleStage(stage);
                  }}
                />
                {stage}
              </label>
            );
          })}
        </div>
      </section>

      {lastError ? <p className="error">{lastError}</p> : null}

      <div className="control-buttons">
        <button type="button" onClick={onRun} disabled={!canRun || busy}>
          {busy ? 'Running…' : 'Run Horizon Lab'}
        </button>
        <button type="button" onClick={onRefresh} disabled={busy}>
          Refresh
        </button>
      </div>
    </section>
  );
};
