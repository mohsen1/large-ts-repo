import { memo, useMemo } from 'react';
import type { OrchestrationMode, OrchestrationLane } from '@domain/recovery-lab-intelligence-core';
import { strategyModeLabels, strategyLaneLabels } from '../services/intelligenceService';

interface IntelligenceCommandPanelProps {
  readonly tenant: string;
  readonly scenario: string;
  readonly mode: OrchestrationMode;
  readonly lane: OrchestrationLane;
  readonly loading: boolean;
  readonly disabled: boolean;
  readonly onModeChange: (mode: OrchestrationMode) => void;
  readonly onLaneChange: (lane: OrchestrationLane) => void;
  readonly onTenantChange: (tenant: string) => void;
  readonly onScenarioChange: (scenario: string) => void;
  readonly onStart: () => Promise<void>;
}

const modes = Object.entries(strategyModeLabels) as readonly [OrchestrationMode, string][];
const lanes = Object.entries(strategyLaneLabels) as readonly [OrchestrationLane, string][];

export const IntelligenceCommandPanel = memo((props: IntelligenceCommandPanelProps): React.JSX.Element => {
  const {
    tenant,
    scenario,
    mode,
    lane,
    loading,
    disabled,
    onModeChange,
    onLaneChange,
    onTenantChange,
    onScenarioChange,
    onStart,
  } = props;

  const canRun = useMemo(() => Boolean(tenant && scenario && !loading && !disabled), [tenant, scenario, loading, disabled]);

  return (
    <section style={{ border: '1px solid #d0d7de', borderRadius: 10, padding: 12 }}>
      <h3>Intelligence command panel</h3>
      <div style={{ display: 'grid', gap: 8, maxWidth: 680 }}>
        <label>
          Tenant
          <input
            type="text"
            value={tenant}
            onChange={(event) => onTenantChange(event.currentTarget.value)}
            style={{ display: 'block', width: '100%' }}
          />
        </label>

        <label>
          Scenario
          <input
            type="text"
            value={scenario}
            onChange={(event) => onScenarioChange(event.currentTarget.value)}
            style={{ display: 'block', width: '100%' }}
          />
        </label>

        <label>
          Mode
          <select
            value={mode}
            onChange={(event) => onModeChange(event.currentTarget.value as OrchestrationMode)}
          >
            {modes.map(([modeKey, label]) => (
              <option key={modeKey} value={modeKey}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Lane
          <select
            value={lane}
            onChange={(event) => onLaneChange(event.currentTarget.value as OrchestrationLane)}
          >
            {lanes.map(([laneKey, label]) => (
              <option key={laneKey} value={laneKey}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          disabled={!canRun}
          onClick={() => {
            void onStart();
          }}
        >
          {loading ? 'running…' : 'run intelligence'}
        </button>

        <p>{`mode=${mode}, lane=${lane}`}</p>
      </div>
    </section>
  );
});

IntelligenceCommandPanel.displayName = 'IntelligenceCommandPanel';
