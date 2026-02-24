import { type ReactElement, useMemo } from 'react';
import { useRecoveryIncidentLabPolicyInsights } from '../hooks/useRecoveryIncidentLabPolicyInsights';
import { ScenarioLabPolicyPanel } from '../components/ScenarioLabPolicyPanel';
import { ScenarioLabSignalsHeatmap } from '../components/ScenarioLabSignalsHeatmap';
import { useRecoveryIncidentLabWorkspace } from '../hooks/useRecoveryIncidentLabWorkspace';

export const RecoveryIncidentLabGovernancePage = (): ReactElement => {
  const { state, plan, launch, summary, statusText } = useRecoveryIncidentLabWorkspace();

  const insights = useRecoveryIncidentLabPolicyInsights({
    scenario: state.scenario,
    plan,
    run: state.output?.run,
    statusText,
    repository: {
      appendEnvelope: async () => ({ ok: true, value: undefined }),
      appendSignal: async () => ({ ok: true, value: undefined }),
      loadLatestRunByScenario: async () => ({ ok: false, error: { code: 'not_found', message: 'noop' } }),
      loadScenario: async () => ({ ok: false, error: { code: 'not_found', message: 'noop' } }),
      listPlansByScenario: async () => ({ items: [], total: 0 }),
      listRuns: async () => ({ items: [], total: 0 }),
      listScenarios: async () => ({ items: [], total: 0 }),
      savePlan: async () => ({ ok: true, value: undefined }),
      saveRun: async () => ({ ok: true, value: undefined }),
      saveScenario: async () => ({ ok: true, value: undefined }),
    },
  });

  const complianceState = useMemo(() => {
    if (insights.executionHealth === 'healthy') {
      return 'operational';
    }
    if (insights.executionHealth === 'degraded') {
      return 'watch';
    }
    if (insights.executionHealth === 'failed') {
      return 'blocked';
    }
    return 'idle';
  }, [insights.executionHealth]);

  const metrics = useMemo(() => {
    return {
      risk: insights.scenarioRiskScore,
      density: insights.policyDensity,
      coverage: insights.topologyCoverage,
      planReady: Boolean(plan),
      complianceState,
      summary,
    };
  }, [insights, complianceState, plan, summary]);

  return (
    <main className="recovery-incident-lab-governance-page">
      <header>
        <h1>Incident Lab Governance</h1>
        <p>{statusText}</p>
        <p>{state.mode}</p>
      </header>
      <section>
        <h2>Runtime metrics</h2>
        <ul>
          <li>risk score: {metrics.risk.toFixed(1)}</li>
          <li>policy density: {metrics.density.toFixed(1)}</li>
          <li>coverage: {metrics.coverage.toFixed(1)}</li>
          <li>summary: {metrics.summary}</li>
          <li>state: {metrics.complianceState}</li>
        </ul>
      </section>
      <ScenarioLabPolicyPanel
        output={state.output}
        planReady={Boolean(plan)}
        insights={insights}
        onRefresh={() => {
          void launch().then(() => {
            return undefined;
          });
        }}
      />
      <ScenarioLabSignalsHeatmap windows={insights.windows} />
      <section>
        <h2>Scenario snapshot</h2>
        <p>Selected runbook count: {plan?.selected.length ?? 0}</p>
        <ul>
          {state.notes.map((note, index) => (
            <li key={`${index}-${note}`}>{note}</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
