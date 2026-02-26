import { TypeStressOrchestraPanel } from '../components/stress/TypeStressOrchestraPanel';

export const RecoveryCockpitTypeStressOrchestratorPage = () => {
  return (
    <main style={{ padding: 20, color: '#edf2ff' }}>
      <h2>Recovery Cockpit Type Stress Orchestrator</h2>
      <p style={{ color: '#a4bbde' }}>Stress orchestration and checker amplification workspace.</p>
      <TypeStressOrchestraPanel />
    </main>
  );
};
