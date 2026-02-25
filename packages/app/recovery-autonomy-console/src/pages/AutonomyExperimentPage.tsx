import { useMemo } from 'react';
import { useAutonomyExperimentPlanner } from '../hooks/useAutonomyExperimentPlanner';
import { ExperimentStatusRibbon } from '../components/ExperimentStatusRibbon';
import { AutonomyExperimentWorkbench } from '../components/AutonomyExperimentWorkbench';
import { ExperimentTimeline } from '../components/ExperimentTimeline';
import { withBrand } from '@shared/core';
import { type SignalChannel } from '@domain/recovery-autonomy-experiment';

interface Props {
  readonly tenantId: string;
  readonly graphId: string;
}

interface SectionProps {
  readonly title: string;
  readonly children: React.ReactNode;
}

const Section = ({ title, children }: SectionProps) => (
  <section style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 16 }}>
    <h3>{title}</h3>
    {children}
  </section>
);

export const AutonomyExperimentPage = ({ tenantId, graphId }: Props) => {
  const {
    loading,
    plan,
    diagnostics,
    error,
    clear,
    runId,
    planIntent,
  } = useAutonomyExperimentPlanner({
    tenantId,
    context: {
      issuer: withBrand(tenantId, 'ExperimentIssuer'),
      tenantLabel: `tenant:${tenantId}`,
      namespace: `autonomy:${tenantId}`,
      activePhases: ['prepare', 'inject', 'observe', 'adapt', 'recover', 'verify'],
      signal: graphId as SignalChannel,
    },
    payload: {
      strategy: `auto-${tenantId}`,
      horizonMinutes: 60,
    },
  });

  const summary = useMemo(() => {
    const total = plan?.sequence?.length ?? 0;
    const metrics = diagnostics.length ? `${diagnostics.length} signals` : 'no signals';
    return `${runId} · phases=${total} · ${metrics}`;
  }, [diagnostics.length, plan?.sequence.length, runId]);

  if (loading) {
    return <p>Generating experiment plan…</p>;
  }

  return (
    <main style={{ display: 'grid', gap: 16, padding: 16 }}>
      <header>
        <h1>Autonomy Experiment Console</h1>
        <p>{summary}</p>
      </header>

      {error ? <p style={{ color: 'crimson' }}>{error}</p> : null}

      <Section title="Diagnostics">
        {diagnostics.length ? diagnostics.map((entry) => <p key={entry}>{entry}</p>) : <p>No diagnostics</p>}
        <button type="button" onClick={clear}>
          Reset Diagnostics
        </button>
      </Section>

      <Section title="Plan summary">
        <ul>
          <li>Run: {runId}</li>
          <li>Tenant: {tenantId}</li>
          <li>Phases: {plan?.sequence.length ?? 0}</li>
          <li>Nodes: {plan?.graph.length ?? 0}</li>
        </ul>
      </Section>

      <Section title="Timeline">
        <ExperimentTimeline plan={plan} activePhase={plan?.sequence.at(-1)} />
      </Section>

      <Section title="Workbench">
        <AutonomyExperimentWorkbench tenantId={tenantId} plan={plan}>
          <ExperimentStatusRibbon result={undefined} />
          <pre>{JSON.stringify(planIntent.payload, null, 2)}</pre>
        </AutonomyExperimentWorkbench>
      </Section>
    </main>
  );
};
