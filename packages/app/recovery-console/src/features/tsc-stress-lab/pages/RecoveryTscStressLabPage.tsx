import { useMemo } from 'react';
import { TscStressLabControlPanel } from '../components/TscStressLabControlPanel';
import { TscStressTopologyGraph } from '../components/TscStressTopologyGraph';
import { TscStressPolicyMatrix } from '../components/TscStressPolicyMatrix';
import { useTscStressLabWorkspace } from '../hooks/useTscStressLabWorkspace';
import { routeTemplateCatalog, parseEventRoute } from '@shared/type-level/stress-template-grammar';
import { broadConditionalPipeline } from '@shared/type-level/stress-broad-conditional';

const riskCells = [
  { axis: 'latency', value: 72, threshold: 80 },
  { axis: 'error-rate', value: 12, threshold: 25 },
  { axis: 'throughput', value: 91, threshold: 70 },
  { axis: 'cost', value: 43, threshold: 60 },
  { axis: 'availability', value: 99, threshold: 99 },
  { axis: 'entropy', value: 31, threshold: 50 },
] as const;

const nodesFromCatalog = Object.values(routeTemplateCatalog).map((route) => {
  const parsed = parseEventRoute(route);
  return `${parsed.domain}/${parsed.verb}/${parsed.status}/${parsed.context}`;
});

const topLevelCatalog = [
  'recovery/run/running/reco-12345-abcdef12',
  'signal/dispatch/created/sigx-12345-abcd1234',
  'policy/validate/new/poli-12345-abcd9999',
  'fleet/simulate/enqueued/fleet-12345-11112222',
] as const;

export const RecoveryTscStressLabPage = ({ tenantId = 'tenant-1' }: { tenantId?: string }) => {
  const workspace = useTscStressLabWorkspace(tenantId, 'run');

  const diagnostics = useMemo(() => {
    const out: Array<typeof workspace.state.diagnostics[number]> = [];
    for (const route of topLevelCatalog) {
      const evaluation = broadConditionalPipeline(route);
      out.push(
        evaluation.resolved
          ? {
              accepted: true,
              phase: 'phase_01_boot',
              next: 'phase_02_seed',
              latencyMs: route.length,
            }
          : {
              accepted: false,
              phase: 'phase_01_boot',
              reason: 'unresolved',
              retryAfterMs: 250,
            },
      );
    }
    return out;
  }, []);

  const links = nodesFromCatalog.map((node, index) => [node, nodesFromCatalog[index + 1] ?? node] as [string, string]);

  return (
    <main style={{ padding: '1rem', display: 'grid', gap: '1rem', color: '#ebefff' }}>
      <h1>Recovery TSC Stress Lab</h1>
      <TscStressLabControlPanel tenantId={tenantId} mode={workspace.mode} />
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
        <TscStressTopologyGraph
          nodes={nodesFromCatalog}
          links={links}
          diagnostics={diagnostics}
        />
        <TscStressPolicyMatrix cells={riskCells} mode={workspace.mode} />
      </div>
      <section
        style={{
          border: '1px solid #2f3450',
          borderRadius: 8,
          background: '#0e1626',
          padding: '0.85rem',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Workspace Snapshot</h2>
        <pre>{JSON.stringify(workspace.state, null, 2)}</pre>
      </section>
    </main>
  );
};

export default RecoveryTscStressLabPage;
