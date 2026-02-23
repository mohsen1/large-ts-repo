import { usePlaybookLab } from '../hooks/usePlaybookLab';
import { PlaybookLabDashboard } from '../components/PlaybookLabDashboard';
import { PlaybookLabTimeline } from '../components/PlaybookLabTimeline';

export const RecoveryPlaybookLabPage = () => {
  const state = usePlaybookLab();
  return (
    <main style={{ padding: '1rem', background: '#020617', color: '#e2e8f0', minHeight: '100vh' }}>
      <PlaybookLabDashboard
        state={state}
        policy={state.policy}
        health={state.health}
        onSeed={state.onSeed}
        onRefresh={state.onRefresh}
        onQueue={state.onQueue}
      />
      <PlaybookLabTimeline rows={state.history} />
    </main>
  );
};
