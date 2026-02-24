import { type ReactElement, useCallback, useMemo, useState } from 'react';
import { RecoveryLabAdaptiveDashboard } from '../components/RecoveryLabAdaptiveDashboard';
import { RecoveryLabAdaptiveTimeline } from '../components/RecoveryLabAdaptiveTimeline';
import { RecoveryLabAdaptivePolicyGrid } from '../components/RecoveryLabAdaptivePolicyGrid';
import { useRecoveryLabAdaptiveOrchestration } from '../hooks/useRecoveryLabAdaptiveOrchestration';
import { calculateSignalHealth, calculateSignalHealth as computeHealth } from '../services/recoveryLabAdaptiveAutomationService';

export const RecoveryLabAdaptiveAutomationPage = (): ReactElement => {
  const {
    state,
    run,
    clear,
    cancel,
    latestSnapshot,
    eventText,
    updateSeed,
    hasDiagnostics,
  } = useRecoveryLabAdaptiveOrchestration();

  const [seedKey, setSeedKey] = useState('default');

  const diagnostics = useMemo(() => state.diagnostics, [state.diagnostics]);
  const snapshots = useMemo(() => state.response?.snapshots ?? [], [state.response?.snapshots]);
  const events = useMemo(() => state.eventFeed, [state.eventFeed]);
  const response = state.response;
  const plan = response?.outcome?.plan;
  const outcomeRun = response?.outcome?.output;

  const health = useMemo(() => {
    if (!outcomeRun) {
      return 0;
    }
    return computeHealth(outcomeRun);
  }, [outcomeRun]);

  const runModes: Array<'simulate' | 'validate' | 'execute'> = useMemo(() => ['simulate', 'validate', 'execute'], []);

  const seedPreset = useMemo(() => {
    if (seedKey === 'default') {
      return {
        region: 'us-east-1',
        service: 'recovery-orchestrator',
        priority: 'critical',
        mode: 'adaptive',
      } satisfies Record<string, unknown>;
    }

    if (seedKey === 'chaos') {
      return {
        region: 'eu-west-1',
        service: 'chaos-lab',
        intensity: 8,
        constraints: ['latency', 'capacity'],
      };
    }

    return {
      region: 'ap-southeast-2',
      service: 'observability',
      drift: 0.8,
      constraints: ['slo', 'cost'],
    };
  }, [seedKey]);

  const onScenarioChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.value.length > 0) {
      updateSeed(seedPreset);
    }
  }, [seedPreset, updateSeed]);

  return (
    <article className="recovery-lab-adaptive-automation-page">
      <header>
        <h1>Adaptive Automation Lab</h1>
        <p>{state.summary}</p>
      </header>

      <section className="adaptive-controls">
        <label htmlFor="scenario">Scenario</label>
        <input
          id="scenario"
          value={state.scenario}
          onChange={onScenarioChange}
        />

        <label htmlFor="seed-preset">Seed preset</label>
        <select id="seed-preset" value={seedKey} onChange={(event) => setSeedKey(event.target.value)}>
          <option value="default">default</option>
          <option value="chaos">chaos</option>
          <option value="observe">observe</option>
        </select>

        <label htmlFor="tenant">Tenant</label>
        <input
          id="tenant"
          value={state.tenantId}
          onChange={(event) => updateSeed({ ...seedPreset, tenant: event.target.value })}
        />

        <div className="actions">
          {runModes.map((mode) => (
            <button key={mode} type="button" onClick={() => run(mode)}>
              {mode}
            </button>
          ))}
          <button type="button" onClick={clear}>
            clear
          </button>
          <button type="button" onClick={cancel}>
            cancel
          </button>
        </div>
      </section>

      <section className="adaptive-summary-strip">
        <p>state: {state.mode}</p>
        <p>tenant: {state.tenantId}</p>
        <p>active run: {state.runningSince ?? 'n/a'}</p>
        <p>seed keys: {Object.keys(state.seed).length}</p>
        <p>events: {eventText.length}</p>
        <p>diagnostics: {diagnostics.length}</p>
        <p>health: {health}</p>
      </section>

      <RecoveryLabAdaptiveDashboard
        response={response as any}
        plan={plan}
        run={outcomeRun as any}
        snapshots={snapshots as any}
        diagnostics={diagnostics as any}
      />

      <RecoveryLabAdaptiveTimeline diagnostics={diagnostics} events={events} />

      {hasDiagnostics && <RecoveryLabAdaptivePolicyGrid />}

      <section className="adaptive-footer">
        <p>latest snapshot: {latestSnapshot ? `${latestSnapshot.key}` : 'none'}</p>
      </section>
    </article>
  );
};
