import { useMemo } from 'react';
import { useRecoveryOrchestrationStudio } from '../hooks/useRecoveryOrchestrationStudio';
import { useRecoveryOrchestrationStudioDiagnostics } from '../hooks/useRecoveryOrchestrationStudioDiagnostics';
import { RuntimeHealthPanel } from '../components/RuntimeHealthPanel';
import { PolicyActionChangelog } from '../components/PolicyActionChangelog';
import { StudioHeader } from '../components/StudioHeader';
import { PolicyTimeline } from '../components/PolicyTimeline';
import { RunbookWorkloadPanel } from '../components/RunbookWorkloadPanel';
import { TopologyDigestCard } from '../components/TopologyDigestCard';
import { PluginRegistryPanel } from '../components/PluginRegistryPanel';
import type { RecoveryRun, RecoveryRunbook, RecoveryScenarioTemplate } from '@domain/recovery-orchestration-design';
import { makeCommandId, makeScenarioId, makeTenantId, makeWorkspaceId } from '@domain/recovery-orchestration-design';
import { studioDefaultConfig } from '../types';

interface RecoveryOrchestrationStudioWorkspacePageProps {
  readonly tenant: string;
  readonly workspace: string;
}

const defaultRunbook = {
  tenant: makeTenantId(studioDefaultConfig.tenant),
  workspace: makeWorkspaceId(studioDefaultConfig.workspace),
  scenarioId: makeScenarioId(makeTenantId(studioDefaultConfig.tenant), 'studio.workspace'),
  title: 'Workspace orchestrated recovery runbook',
  nodes: [
    { id: 'preflight', title: 'Pre-flight', phase: 'discover', severity: 'low', status: 'complete', metrics: { slo: 0.88, capacity: 0.78, compliance: 0.91, security: 0.86 }, prerequisites: [] },
    { id: 'staging', title: 'Staging', phase: 'validate', severity: 'medium', status: 'active', metrics: { slo: 0.55, capacity: 0.49, compliance: 0.7, security: 0.72 }, prerequisites: ['preflight'] },
    { id: 'rehearsal', title: 'Rehearsal', phase: 'stabilize', severity: 'critical', status: 'pending', metrics: { slo: 0.31, capacity: 0.16, compliance: 0.52, security: 0.63 }, prerequisites: ['staging'] },
  ],
  edges: [
    { from: 'preflight', to: 'staging', latencyMs: 20 },
    { from: 'staging', to: 'rehearsal', latencyMs: 50 },
  ],
  directives: [
    { code: 'policy:stability', command: 'audit', scope: 'workspace', requiredCapabilities: ['read-only'], metadata: { mode: 'workspace' } },
    { code: 'policy:recovery', command: 'runbook-validate', scope: 'tenant', requiredCapabilities: ['policy'], metadata: { confidence: 'high' } },
  ],
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T01:00:00.000Z',
} satisfies RecoveryRunbook;

const fallbackTemplate = {
  phases: ['discover', 'validate', 'stabilize', 'mitigate', 'document'],
  tags: ['workspace', 'stress-lab'],
  policy: {
    code: 'policy:workspace-template',
    command: 'apply-template',
    scope: 'tenant',
    requiredCapabilities: ['policy'],
    metadata: { origin: 'workspace' },
  },
} as RecoveryScenarioTemplate;

const extractTemplate = (template?: RecoveryScenarioTemplate): RecoveryScenarioTemplate => ({
  phases: ['discover', 'validate', 'stabilize', 'mitigate', 'document'],
  tags: ['generated', 'runbook'],
  policy: template?.policy ?? defaultRunbook.directives[0],
});

export const RecoveryOrchestrationStudioWorkspacePage = ({
  tenant,
  workspace,
}: RecoveryOrchestrationStudioWorkspacePageProps) => {
  const initialTemplate = useMemo(
    () => extractTemplate({
      ...fallbackTemplate,
      phases: [...fallbackTemplate.phases],
      tags: [...fallbackTemplate.tags],
      policy: fallbackTemplate.policy,
    } as RecoveryScenarioTemplate),
    [],
  );
  const { state, start, refresh, config, setConfig, stop } = useRecoveryOrchestrationStudio({
    tenant,
    workspace,
    initialRunbook: defaultRunbook as RecoveryRunbook,
    template: initialTemplate,
  });
  const diagnostics = useRecoveryOrchestrationStudioDiagnostics({
    runbook: state.runbook,
    run: state.runbook
      ? ({
          runId: makeCommandId(state.runbook.scenarioId, state.ticks.length),
          scenario: state.runbook.scenarioId,
          startedAt: new Date().toISOString(),
          status: 'active',
          observedNodes: state.runbook.nodes.map((node) => node.id),
          commandCount: state.ticks.length,
        } as RecoveryRun)
      : undefined,
    ticks: state.ticks,
    result: undefined,
  });

  return (
    <article>
      <StudioHeader tenant={tenant} workspace={workspace} config={config} />
      <section>
        <button onClick={start} type="button">
          Start workspace run
        </button>
        <button onClick={stop} type="button">
          Halt workspace run
        </button>
        <button onClick={refresh} type="button">
          Reload workspace
        </button>
      </section>
      <section>
        <RuntimeHealthPanel
          runbook={state.runbook}
          ticks={state.ticks}
          diagnostics={diagnostics.summary}
          windows={diagnostics.windows}
          hotspots={diagnostics.hotspots}
          phase={state.actions.length > 8 ? 'report' : 'run'}
        />
      </section>
      <section>
        <h2>Workspace Snapshot</h2>
        {state.runbook ? (
          <>
            <TopologyDigestCard runbook={state.runbook} />
            <RunbookWorkloadPanel result={undefined} ticks={state.ticks} />
            <PolicyTimeline result={undefined} ticks={state.ticks} />
            <PluginRegistryPanel ticks={state.ticks} />
          </>
        ) : null}
      </section>
      <section>
        <PolicyActionChangelog ticks={state.ticks} panel={undefined} />
      </section>
    </article>
  );
};
