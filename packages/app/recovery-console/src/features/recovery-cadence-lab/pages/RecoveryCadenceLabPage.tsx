import { CadenceLabOverview } from '../components/CadenceLabOverview';
import { CadenceRunboard } from '../components/CadenceRunboard';
import { CadenceTimeline } from '../components/CadenceTimeline';
import { useRecoveryCadenceLab } from '../hooks/useRecoveryCadenceLab';

export const RecoveryCadenceLabPage = () => {
  const { state, summaries, actions, loading, error } = useRecoveryCadenceLab();

  const activePlan = state.plans.find((candidate) => candidate.id === state.selectedPlanId);

  return (
    <main style={{ padding: 16, color: '#e7edf7' }}>
      <header style={{ marginBottom: 12 }}>
        <h1>Recovery Cadence Lab</h1>
        <p>Coordinate adaptive cadence windows and view forecasts with intent-aware workflows.</p>
      </header>
      <CadenceLabOverview state={state} summaries={summaries} />
      <CadenceTimeline title="Forecast timelines" plans={state.forecasts} />
      <CadenceRunboard state={state} />

      {error && (
        <section style={{ marginTop: 12, border: '1px solid #623131', borderRadius: 12, padding: 12, background: '#2a1414' }}>
          <h4 style={{ margin: '0 0 8px 0' }}>Error</h4>
          <p style={{ margin: 0 }}>{error.code}: {error.message}</p>
        </section>
      )}

      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        <button disabled={loading || !activePlan} onClick={() => activePlan && void actions.startPlan(activePlan.id)}>
          Start selected plan
        </button>
        <button disabled={loading || !activePlan} onClick={() => activePlan && void actions.stopPlan(activePlan.id)}>
          Stop selected plan
        </button>
        <button onClick={() => void actions.refresh()} disabled={loading}>
          Refresh
        </button>
      </div>
    </main>
  );
};
