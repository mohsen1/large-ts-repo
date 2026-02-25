import { ResilienceCommandCenter } from '../components/ResilienceCommandCenter';
import { ResiliencePolicySummary } from '../components/ResiliencePolicySummary';
import { ResilienceTopologyChart } from '../components/ResilienceTopologyChart';
import { ResilienceSignalTimeline } from '../components/ResilienceSignalTimeline';
import { useResilienceOrchestration } from '../hooks/useResilienceOrchestration';

export interface ResilienceOrchestrationLabPageProps {
  readonly tenantId: string;
  readonly zone: 'zone-core' | 'zone-east' | 'zone-west';
}

export const ResilienceOrchestrationLabPage = ({ tenantId, zone }: ResilienceOrchestrationLabPageProps) => {
  const { state } = useResilienceOrchestration(tenantId, zone);

  const points = state.plan
    ? state.plan.steps.map((step, index) => ({
        id: step.stepId,
        score: step.expectedThroughput + step.risk * 10,
        zone: step.requiredZones[0] ?? 'zone-core',
      }))
    : [];

  return (
    <main style={{ display: 'grid', gap: '18px' }}>
      <h2>Resilience Orchestration Lab</h2>
      <ResilienceCommandCenter tenantId={tenantId} zone={zone} />
      <ResiliencePolicySummary result={state.result} />
      <ResilienceTopologyChart
        nodes={state.plan ? state.plan.steps.map((step) => ({ id: step.stepId, label: step.name, score: step.expectedThroughput })) : []}
      />
      <ResilienceSignalTimeline points={points} />
    </main>
  );
};
