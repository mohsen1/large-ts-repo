import { useMemo } from 'react';
import { useAdvancedScenarioPlan } from '../hooks/useAdvancedScenarioPlan';
import { useOrchestrationDiagnostics } from '../hooks/useOrchestrationDiagnostics';
import {
  timelineForEnvelope,
  splitTimelineByLane,
  summarizeTimeline,
  toTimelineLines,
  type TimelineSequence,
} from '@shared/stress-lab-runtime/orchestration-timeline';
import {
  buildWorkspaceEnvelope,
  canonicalRuntimeNamespace,
  buildPlanId,
  type WorkspaceEnvelope,
} from '@shared/stress-lab-runtime/advanced-lab-core';
import { withWorkspaceScope } from '../services/advancedStudioService';
import { buildBlueprintInput } from '../services/advancedTemplateService';

interface ScenarioDiagnosticsPageProps {
  readonly tenantId: string;
}

export const ScenarioDiagnosticsPage = ({ tenantId }: ScenarioDiagnosticsPageProps) => {
  const scenarioPlan = useAdvancedScenarioPlan(tenantId, 5);
  const diagnostics = useOrchestrationDiagnostics(tenantId);

  const planInput = useMemo(() => buildBlueprintInput(tenantId, 'diagnostics-page', 4), [tenantId]);

  const signalLanes = useMemo(
    () => splitTimelineByLane(diagnostics.sequence, 'signal'),
    [diagnostics.sequence],
  );

  const planPreview = useMemo(() => scenarioPlan.templateTags.join(','), [scenarioPlan.templateTags]);

  const runDiagnosticsProbe = async () => {
    await diagnostics.runDiagnostics();
    await withWorkspaceScope(tenantId, `${tenantId}-diagnostics`, async () => {
      const namespace = canonicalRuntimeNamespace('prod:interactive:console');
      const envelope = buildWorkspaceEnvelope(
        tenantId,
        namespace,
        buildPlanId(tenantId, namespace, 'probe'),
        {},
        {
          timeoutMs: 10_000,
          maxConcurrency: 1,
          retryWindowMs: 200,
          featureFlags: { diagnostics: true, tracing: true },
        },
      );

      const timeline = await timelineForEnvelope(
        envelope as unknown as WorkspaceEnvelope<Record<string, unknown>, Record<string, never>>,
      );
      const grouped = summarizeTimeline(timeline);
      const lines = toTimelineLines(timeline);
      void grouped;
      void lines;
    });
  };

  return (
    <main style={{ padding: 20, display: 'grid', gap: 12 }}>
      <header>
        <h1>Scenario Diagnostics</h1>
        <p>Tenant {tenantId}</p>
      </header>
      <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
        <button type="button" onClick={() => void scenarioPlan.runPlan()}>
          execute scenario plan
        </button>
        <button type="button" onClick={runDiagnosticsProbe} style={{ marginLeft: 8 }}>
          run diagnostics probe
        </button>
        <button type="button" onClick={() => diagnostics.clearDiagnostics()} style={{ marginLeft: 8 }}>
          clear diagnostics
        </button>
      </section>
      <section style={{ border: '1px solid #bfdbfe', borderRadius: 8, padding: 12 }}>
        <h2>State</h2>
        <p>status={scenarioPlan.status}</p>
        <p>template tags={planPreview || 'none'}</p>
        <p>summary lanes={diagnostics.summary.lanes.length}</p>
        <p>signal lane count={signalLanes.length}</p>
      </section>
      <section style={{ border: '1px solid #fecaca', borderRadius: 8, padding: 12 }}>
        <h2>Inputs</h2>
        <pre>{planInput.scenarioId}</pre>
        <pre>{planInput.graphSteps.slice(0, 4).map((step) => step.id).join('\n')}</pre>
      </section>
      <section style={{ border: '1px solid #bbf7d0', borderRadius: 8, padding: 12 }}>
        <h2>Error</h2>
        <p>{diagnostics.error ?? 'none'}</p>
      </section>
    </main>
  );
};
