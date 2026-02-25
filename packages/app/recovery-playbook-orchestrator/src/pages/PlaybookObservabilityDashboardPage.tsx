import { useMemo } from 'react';
import { usePlaybookObservabilityDashboard } from '../hooks/usePlaybookObservabilityDashboard';
import { usePlaybookPolicyFilters } from '../hooks/usePlaybookPolicyFilters';
import { ObservabilityOverviewPanel } from '../components/playbook-observability/ObservabilityOverviewPanel';
import { PolicyMatrixView } from '../components/playbook-observability/PolicyMatrixView';
import { RunTimelineChart } from '../components/playbook-observability/RunTimelineChart';
import type { PlaybookRuntimeMetrics } from '@domain/recovery-playbook-observability-core';

export interface PlaybookObservabilityDashboardPageProps {
  readonly tenantId: string;
  readonly playbook: string;
}

const parseTimelineToMetrics = (
  timeline: readonly string[],
  scope: string,
): readonly PlaybookRuntimeMetrics[] =>
  timeline
    .filter((entry) => entry.includes(scope))
    .map((entry, index) => {
      const score = ((timeline.length - index) / Math.max(1, timeline.length + 1)) * 100;
      const drift = index / Math.max(1, timeline.length);
      return {
        scope: scope as PlaybookRuntimeMetrics['scope'],
        score: Number(score.toFixed(2)),
        drift: Number(drift.toFixed(3)),
        variance: Number((score * 0.7).toFixed(3)),
        confidence: Math.min(0.99, 0.15 + (index % 9) / 10),
        trend: index % 3 === 0 ? 'increasing' : index % 3 === 1 ? 'decreasing' : 'steady',
      };
    });

const scopeSequence = (input: string): readonly string[] => {
  const defaultSequence = ['playbook', 'signal', 'platform', 'policy', 'workflow', 'incident'];
  if (input === 'all') return defaultSequence;
  return [input, ...defaultSequence.filter((item) => item !== input)];
};

export const PlaybookObservabilityDashboardPage = ({ tenantId, playbook }: PlaybookObservabilityDashboardPageProps) => {
  const dashboard = usePlaybookObservabilityDashboard({
    tenantId,
    playbook,
  });

  const currentScope = dashboard.state.policy?.scopes?.[0] ?? 'playbook';
  const manifestTimeline = dashboard.state.result?.manifest.timeline ?? [];

  const metrics = useMemo(
    () => parseTimelineToMetrics(manifestTimeline, currentScope),
    [currentScope, manifestTimeline],
  );

  const policyFilter = usePlaybookPolicyFilters({
    scope: currentScope,
    minScore: dashboard.state.policy?.showForecast ? 0.2 : 0.5,
    maxDrift: dashboard.state.policy?.showForecast ? 0.8 : 0.4,
    metrics,
  });

  return (
    <main className="playbook-observability-dashboard-page">
      <section className="playbook-observability-dashboard-page__header">
        <h1>Playbook Observability Dashboard</h1>
        <p>Tenant: {tenantId}</p>
        <p>Playbook: {playbook}</p>
        <p>Scopes: {scopeSequence(currentScope).join(' → ')}</p>
      </section>

      <ObservabilityOverviewPanel
        policyScope={currentScope}
        summary={policyFilter.summary}
        loaded={dashboard.state.loaded}
        running={dashboard.state.loading}
        totals={{
          score: dashboard.state.result?.score ?? 0,
          drift: dashboard.state.result?.drift ?? 0,
          events: dashboard.state.result?.eventCount ?? 0,
        }}
        tags={dashboard.state.result?.manifest.channels ?? ['none']}
      />

      <section className="playbook-observability-dashboard-page__actions">
        <button onClick={dashboard.refresh} disabled={dashboard.state.loading}>
          Refresh
        </button>
        <button onClick={() => dashboard.setScope('policy')}>
          Policy scope
        </button>
        <button onClick={dashboard.toggleForecast}>
          Toggle forecast
        </button>
      </section>

      <PolicyMatrixView
        scope={currentScope}
        metrics={metrics}
        onScopeChange={dashboard.setScope}
        minScore={policyFilter.filters.minScore}
        maxDrift={policyFilter.filters.maxDrift}
      />

      <RunTimelineChart
        manifest={dashboard.state.result?.manifest}
        scopeFilter={currentScope}
      />

      <section className="playbook-observability-dashboard-page__errors">
        <h3>Errors</h3>
        {dashboard.state.error.length > 0 ? (
          <ul>
            {dashboard.state.error.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        ) : (
          <p>All good</p>
        )}
      </section>
    </main>
  );
};
