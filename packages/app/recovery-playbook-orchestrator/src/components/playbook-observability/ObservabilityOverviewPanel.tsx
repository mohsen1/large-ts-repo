import type { ObservabilityScope } from '@domain/recovery-playbook-observability-core';

interface ObservabilityOverviewPanelProps {
  readonly policyScope: ObservabilityScope;
  readonly summary: string;
  readonly loaded: boolean;
  readonly running: boolean;
  readonly totals: {
    readonly score: number;
    readonly drift: number;
    readonly events: number;
  };
  readonly tags: readonly string[];
}

export const ObservabilityOverviewPanel = ({
  policyScope,
  summary,
  loaded,
  running,
  totals,
  tags,
}: ObservabilityOverviewPanelProps) => {
  const status = loaded ? 'active' : running ? 'running' : 'idle';
  return (
    <section className="observability-overview-panel">
      <h2>Observability Overview</h2>
      <p>Scope: {policyScope}</p>
      <p>Status: {status}</p>
      <p>{summary}</p>
      <dl>
        <dt>Score</dt>
        <dd>{totals.score.toFixed(2)}</dd>
        <dt>Drift</dt>
        <dd>{totals.drift.toFixed(3)}</dd>
        <dt>Events</dt>
        <dd>{totals.events}</dd>
      </dl>
      <ul>
        {tags.map((tag) => (
          <li key={tag}>{tag}</li>
        ))}
      </ul>
    </section>
  );
};

