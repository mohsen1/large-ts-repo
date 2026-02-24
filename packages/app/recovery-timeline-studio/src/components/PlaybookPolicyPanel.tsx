import { FormEvent } from 'react';
import type { PolicyFormState } from '../hooks/usePlaybookPolicyControls';

interface PlaybookPolicyPanelProps {
  readonly state: PolicyFormState;
  readonly onChangeRegion: (value: string) => void;
  readonly onChangeTenantPriority: (value: number) => void;
  readonly onChangeRetryLimit: (value: number) => void;
  readonly onToggleFinalization: (value: boolean) => void;
  readonly onTogglePersist: (value: boolean) => void;
  readonly onReset: () => void;
}

export function PlaybookPolicyPanel({
  state,
  onChangeRegion,
  onChangeTenantPriority,
  onChangeRetryLimit,
  onToggleFinalization,
  onTogglePersist,
  onReset,
}: PlaybookPolicyPanelProps) {
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
  };

  const regions = ['global', 'us-east', 'eu-west', 'ap-south'] as const;

  return (
    <section>
      <h3>Policy Controls</h3>
      <form onSubmit={submit}>
        <label>
          Region
          <select
            value={state.region}
            onChange={(event) => onChangeRegion(event.currentTarget.value)}
          >
            {regions.map((region) => (
              <option key={region} value={region}>
                {region}
              </option>
            ))}
          </select>
        </label>

        <label>
          Tenant Priority
          <input
            type="range"
            min={1}
            max={10}
            value={state.tenantPriority}
            onChange={(event) => onChangeTenantPriority(Number(event.currentTarget.value))}
          />
          <output>{state.tenantPriority}</output>
        </label>

        <label>
          Retry Limit
          <input
            type="number"
            min={0}
            max={8}
            value={state.retryLimit}
            onChange={(event) => onChangeRetryLimit(Number(event.currentTarget.value))}
          />
        </label>

        <label>
          <input
            type="checkbox"
            checked={state.includeFinalization}
            onChange={(event) => onToggleFinalization(event.currentTarget.checked)}
          />
          Include Finalization Stage
        </label>

        <label>
          <input
            type="checkbox"
            checked={state.autoPersist}
            onChange={(event) => onTogglePersist(event.currentTarget.checked)}
          />
          Enable Auto Persist
        </label>

        <div>
          <button type="button" onClick={onReset}>Reset</button>
          <button type="submit">Save</button>
        </div>
      </form>

      <details>
        <summary>Summary</summary>
        <pre>{JSON.stringify(state, null, 2)}</pre>
      </details>
    </section>
  );
}
