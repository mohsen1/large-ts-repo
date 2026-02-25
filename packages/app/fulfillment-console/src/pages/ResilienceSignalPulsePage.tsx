import { ResilienceTopologyChart } from '../components/ResilienceTopologyChart';
import { ResilienceSignalTimeline } from '../components/ResilienceSignalTimeline';

export const ResilienceSignalPulsePage = ({ tenantId }: { tenantId: string }) => {
  const zones = ['zone-core', 'zone-east', 'zone-west'] as const;
  const nodes = zones.map((zone, index) => ({ id: zone, label: `${zone}:node-${index}`, score: index + 1 }));
  const points = zones.map((zone, index) => ({ id: zone, score: index * 0.8 + 1, zone }));

  return (
    <main style={{ display: 'grid', gap: '18px' }}>
      <h2>Resilience Signal Pulse</h2>
      <p style={{ color: '#666' }}>Tenant {tenantId}</p>
      <ResilienceTopologyChart nodes={nodes} />
      <ResilienceSignalTimeline points={points} />
    </main>
  );
};
