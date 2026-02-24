import { type ChangeEvent, useCallback, useMemo, useState } from 'react';
import {
  IncidentIntentPolicy,
  IncidentIntentStepOutput,
  type OrchestrationOutput,
} from '@domain/recovery-incident-intent';
import { useIncidentIntentOrchestrator } from '../hooks/useIncidentIntentOrchestrator';
import { IntentIntentPanel } from '../components/incident-intent/IntentIntentPanel';
import { IntentDecisionGrid } from '../components/incident-intent/IntentDecisionGrid';
import { IntentTimeline } from '../components/incident-intent/IntentTimeline';

const defaultPolicies: readonly IncidentIntentPolicy[] = [
  {
    policyId: 'policy-a' as IncidentIntentPolicy['policyId'],
    title: 'default-priority',
    minimumConfidence: 0.6,
    weight: {
      severity: 1.2,
      freshness: 0.8,
      confidence: 1.7,
      cost: 0.2,
    },
    tags: ['bootstrap', 'incident-intent'],
  },
];

export const IncidentIntentOrchestrationPage = () => {
  const [tenantId, setTenantId] = useState('tenant-a');
  const { execute, clearErrors, bootstrap, sortedSignals, state, hasHistory, tenant } = useIncidentIntentOrchestrator(tenantId);

  const history: readonly OrchestrationOutput[] = useMemo(() => (state.lastOutput ? [state.lastOutput] : []), [state.lastOutput]);

  const outputSignals = useMemo(
    () =>
      sortedSignals
        .map((signal) => `${signal.source}:${signal.kind}:${signal.value}:${signal.observedAt}`)
        .toSpliced(0, 2),
    [sortedSignals],
  );

  const outputPolicies = useMemo(
    () =>
      hasHistory
        ? [
          {
            policyId: `policy-${tenantId}` as IncidentIntentPolicy['policyId'],
            title: `tenant ${tenantId} runtime`,
            minimumConfidence: 0.7,
            weight: {
              severity: 1,
              freshness: 1,
              confidence: 1,
              cost: 1,
            },
            tags: ['runtime'],
          },
          ...defaultPolicies,
        ]
        : defaultPolicies,
    [hasHistory, tenantId],
  );

  const outputResults = useMemo<readonly IncidentIntentStepOutput[]>(
    () => state.lastOutput?.topPlan.phases.map((phase) => phase.output ?? ({} as IncidentIntentStepOutput)) ?? [],
    [state.lastOutput],
  );

  const onTenant = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setTenantId(event.target.value);
  }, []);

  const onRun = useCallback(() => {
    void execute();
  }, [execute]);

  const onBootstrap = useCallback(() => {
    void bootstrap();
  }, [bootstrap]);

  const onClear = useCallback(() => {
    clearErrors();
  }, [clearErrors]);

  return (
    <main className="incident-intent-orchestration-page">
      <h1>Incident Intent Orchestration</h1>
      <p>Tenant: {tenant}</p>
      <label>
        Tenant id
        <input value={tenantId} onChange={onTenant} />
      </label>
      <div>
        <button type="button" onClick={onRun} disabled={state.loading}>
          Execute orchestration
        </button>
        <button type="button" onClick={onBootstrap}>
          Bootstrap intent
        </button>
        <button type="button" onClick={onClear}>
          Clear errors
        </button>
      </div>
      <p>Signals:{' '}{outputSignals.join(', ')}</p>

      <IntentIntentPanel output={state.lastOutput} state={state} />

      <IntentDecisionGrid policies={outputPolicies} outputs={outputResults} />
      <IntentTimeline outputs={history} />

      <section>
        <h3>Errors</h3>
        <ul>
          {state.errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
