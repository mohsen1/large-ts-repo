import { useMemo } from 'react';

interface CommandControlStripProps {
  windowMinutes: number;
  tenantId: string;
  includeBlocked: boolean;
  loading: boolean;
  onWindowChange(value: number): void;
  onTenantChange(value: string): void;
  onIncludeBlocked(toggle: boolean): void;
  onDraft(): void;
  onExecute(): void;
}

export const CommandControlStrip = ({
  windowMinutes,
  tenantId,
  includeBlocked,
  loading,
  onWindowChange,
  onTenantChange,
  onIncludeBlocked,
  onDraft,
  onExecute,
}: CommandControlStripProps) => {
  const windowHints = useMemo(() => [15, 30, 45, 60, 120], []);

  return (
    <section className="command-control-strip">
      <label>
        Tenant
        <input
          value={tenantId}
          onChange={(event) => onTenantChange(event.target.value)}
          placeholder="tenant id"
        />
      </label>
      <label>
        Window (minutes)
        <select
          value={windowMinutes}
          onChange={(event) => onWindowChange(Number(event.target.value))}
        >
          {windowHints.map((hint) => (
            <option value={hint} key={hint}>
              {hint}
            </option>
          ))}
        </select>
      </label>
      <label>
        Include blocked
        <input
          type="checkbox"
          checked={includeBlocked}
          onChange={(event) => onIncludeBlocked(event.currentTarget.checked)}
        />
      </label>
      <div className="command-actions">
        <button onClick={onDraft} disabled={loading}>
          {loading ? 'Planning...' : 'Plan'}
        </button>
        <button onClick={onExecute} disabled={loading}>
          Execute
        </button>
      </div>
    </section>
  );
};
