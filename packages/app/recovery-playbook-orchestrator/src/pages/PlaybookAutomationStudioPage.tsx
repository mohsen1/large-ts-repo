import { useMemo } from 'react';
import { usePlaybookAutomationDashboard, summarizeAutomation } from '../hooks/usePlaybookAutomationDashboard';
import { usePlaybookPlugins } from '../hooks/usePlaybookPlugins';
import { PlaybookAutomationPanel } from '../components/playbook-automation/PlaybookAutomationPanel';
import { useAdaptiveOpsDashboard, type AdaptiveOpsRunFilter } from '../hooks/useAdaptiveOpsDashboard';
import { type BlueprintTemplate } from '@domain/recovery-playbook-orchestration-core';
import { withBrand } from '@shared/core';

export interface PlaybookAutomationStudioPageProps {
  tenantId: string;
}

const defaultRunFilter = {
  tenantId: 'tenant-default',
  windowMs: 240000,
  maxActions: 8,
  dryRun: true,
  policySearch: 'automation',
} satisfies AdaptiveOpsRunFilter;

export const PlaybookAutomationStudioPage = ({ tenantId }: PlaybookAutomationStudioPageProps) => {
  const { state: adaptiveState, filter: adaptiveFilter } = useAdaptiveOpsDashboard(defaultRunFilter);

  const template = useMemo<BlueprintTemplate>(() => ({
      id: withBrand('template', 'PlaybookAutomationArtifactId'),
      title: 'Automation baseline',
      region: adaptiveFilter?.tenantId ?? 'global',
      playbook: 'standard',
      tags: ['playbook', 'automation', 'safety'],
      owner: 'adaptive-console',
      labels: ['automated', 'recovery'],
      context: {
        tenantId,
        serviceId: adaptiveFilter.tenantId,
        incidentType: 'incident',
        affectedRegions: ['region-1'],
        triggeredBy: 'automation-dashboard',
      },
      constraints: [],
      steps: [],
      createdAt: new Date().toISOString(),
      version: '1.0.0',
  }),
    [tenantId, adaptiveState],
  );

  const dashboard = usePlaybookAutomationDashboard({ tenantId, template });
  const { records: pluginRecords } = usePlaybookPlugins([] as const);

  const snapshot = summarizeAutomation({
    tenantId,
    loading: dashboard.hydration.loading,
    plans: dashboard.hydration.plans,
    sessionId: dashboard.hydration.sessionId,
    errors: dashboard.hydration.errors,
    history: dashboard.hydration.history,
    isHydrated: dashboard.hydration.isHydrated,
  });

  return (
    <main className="playbook-automation-studio-page">
      <h1>Playbook Automation Studio</h1>
      <section>
        <h2>Execution snapshot</h2>
        <dl>
          <dt>Session</dt>
          <dd>{snapshot.sessionId ?? 'not started'}</dd>
          <dt>Plan count</dt>
          <dd>{snapshot.planCount}</dd>
          <dt>Phases</dt>
          <dd>{snapshot.phaseTrail.join(' → ')}</dd>
          <dt>Plugins available</dt>
          <dd>{pluginRecords.length}</dd>
        </dl>
      </section>
      <PlaybookAutomationPanel
        sessionId={dashboard.hydration.sessionId}
        runs={dashboard.hydration.plans}
        loading={dashboard.hydration.loading}
        history={dashboard.hydration.history}
        onHydrate={dashboard.actions.hydratePlan}
        onRun={dashboard.actions.runPlan}
      />
      {dashboard.hydration.errors.length > 0 ? (
        <section>
          <h3>Errors</h3>
          <ul>
            {dashboard.hydration.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <section>
        <h3>Plugin activity</h3>
        <ul>
          {pluginRecords.map((entry) => (
            <li key={entry.id}>{entry.name}: {entry.enabled ? 'enabled' : 'disabled'}</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
