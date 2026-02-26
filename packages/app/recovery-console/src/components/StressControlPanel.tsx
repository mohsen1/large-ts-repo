import { useState } from 'react';

import { useTypeLevelStressHarness, type StressHarnessInput, type StressHarnessState } from '../hooks/useTypeLevelStressHarness';
import type { FlowBranch } from '@shared/type-level/stress-controlflow-switchyard';

interface StressControlPanelProps {
  readonly tenantId: string;
  readonly initialMode: StressHarnessInput['mode'];
  readonly onStateChange?: (state: StressHarnessState) => void;
}

export const StressControlPanel = ({ tenantId, initialMode, onStateChange }: StressControlPanelProps) => {
  const [branch, setBranch] = useState<FlowBranch>('north');
  const [mode, setMode] = useState<StressHarnessInput['mode']>(initialMode);

  const harness = useTypeLevelStressHarness({
    tenantId,
    branch,
    mode,
    maxBranches: 24,
  });

  onStateChange?.(harness);

  const binarySignature = harness.matrixSignals;
  const routeCount = Object.keys(harness.routeCatalog).length;
  const dispatchCount = harness.dispatchResults.length;
  const hasCritical = harness.flowStates.some((state) => state.event.severity === 'critical');
  const flowRunning = harness.flowStates.filter((state) => state.kind === 'running').length;

  return (
    <section>
      <header>
        <h2>Type-level stress control</h2>
        <p>{`tenant ${harness.tenantLabel}`}</p>
      </header>

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        <label>
          Branch
          <select value={branch} onChange={(event) => setBranch(event.currentTarget.value as FlowBranch)}>
            <option value="north">north</option>
            <option value="south">south</option>
            <option value="east">east</option>
            <option value="west">west</option>
            <option value="diag">diag</option>
            <option value="ring">ring</option>
            <option value="fallback">fallback</option>
          </select>
        </label>

        <label>
          Mode
          <select value={mode} onChange={(event) => setMode(event.currentTarget.value as StressHarnessInput['mode'])}>
            <option value="idle">idle</option>
            <option value="loading">loading</option>
            <option value="ready">ready</option>
            <option value="error">error</option>
          </select>
        </label>

        <p>{`matrix signature: ${binarySignature}`}</p>
        <p>{`routes: ${routeCount}`}</p>
        <p>{`dispatch: ${dispatchCount}`}</p>
        <p>{`flow running states: ${flowRunning}`}</p>
        <p>{`critical stages: ${hasCritical ? 'yes' : 'no'}`}</p>

        <p>{`carrier label: ${harness.carrierLabel}`}</p>
        <p>{`binary sample true count: ${harness.binarySamples.filter(Boolean).length}`}</p>
      </div>
    </section>
  );
};
