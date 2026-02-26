import { useMemo, useState } from 'react';

import { StressControlPanel } from '../components/StressControlPanel';
import { StressRouteMatrix } from '../components/StressRouteMatrix';
import { StressFlowTimeline } from '../components/StressFlowTimeline';
import { useTypeLevelStressHarness, type StressHarnessState } from '../hooks/useTypeLevelStressHarness';
import { evaluate } from '@shared/type-level/stress-binary-expression-galaxy';

interface RecoveryStressStudioPageProps {
  readonly tenantId: string;
}

export const RecoveryStressStudioPage = ({ tenantId }: RecoveryStressStudioPageProps) => {
  const [selectedBranch, setSelectedBranch] = useState<'north' | 'south' | 'east' | 'west' | 'diag' | 'ring' | 'fallback'>('north');
  const [selectedMode, setSelectedMode] = useState<'normal' | 'compact'>('normal');

  const harness = useTypeLevelStressHarness({ tenantId, branch: selectedBranch, mode: 'ready', maxBranches: 16 });

  const branchSummary = useMemo(() => {
    return harness.flowStates.reduce<Record<string, number>>((acc, state) => {
      acc[state.kind] = (acc[state.kind] ?? 0) + 1;
      return acc;
    }, {});
  }, [harness.flowStates]);

  const diagnostics = useMemo(() => {
    return {
      hasBinary: harness.binarySamples.some(Boolean),
      bool: evaluate(harness.matrixSignals.includes('route') ? '1||0' : '0||0'),
      routes: Object.keys(harness.routeCatalog).length,
      profile: Object.keys(harness.profile.payloads ?? {}).length,
      branches: Object.values(branchSummary).reduce((acc, count) => acc + count, 0),
    };
  }, [harness]);

  const labels = useMemo(
    () => harness.flowStates.map((state, index) => `${state.kind}:${state.event.attempt}:${index}`),
    [harness.flowStates],
  );

  const renderMode = (state: StressHarnessState) => (
    <section>
      <h1>Recovery stress studio</h1>
      <p>{`tenant ${state.tenantLabel}`}</p>
      <p>{`mode ${state.mode}`}</p>
      <p>{`binary active: ${diagnostics.hasBinary}`}</p>
      <p>{`diagnostic: ${JSON.stringify(diagnostics)}`}</p>
      <ul>
        {Object.entries(branchSummary).map(([key, count]) => (
          <li key={key}>{`${key}: ${count}`}</li>
        ))}
      </ul>
      <label>
        Branch selector
        <select
          value={selectedBranch}
          onChange={(event) => {
            setSelectedBranch(event.currentTarget.value as typeof selectedBranch);
          }}
        >
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
        <select
          value={selectedMode}
          onChange={(event) => {
            setSelectedMode(event.currentTarget.value as typeof selectedMode);
          }}
        >
          <option value="normal">normal</option>
          <option value="compact">compact</option>
        </select>
      </label>
      <p>{`labels: ${labels.join(', ')}`}</p>
    </section>
  );

  return (
    <main>
      {renderMode(harness)}
      <StressControlPanel tenantId={tenantId} initialMode="ready" />
      <StressRouteMatrix tenantId={tenantId} branch={selectedBranch} compact={selectedMode === 'compact'} />
      <StressFlowTimeline tenantId={tenantId} mode={selectedMode} branch={selectedBranch} />
      <section>
        <h3>Dispatch snapshots</h3>
        {harness.dispatchResults.map((item, index) => {
          const key = `${item.scope}-${item.parsed.verb}`;
          return <pre key={`${key}-${index}`}>{JSON.stringify(item, null, 2)}</pre>;
        })}
      </section>
    </main>
  );
};
