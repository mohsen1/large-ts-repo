import { useMemo } from 'react';
import { useChaosLabDashboard } from '../hooks/useChaosLabDashboard';
import { ChaosLabControlDeck } from '../components/ChaosLabControlDeck';
import { ChaosLabSignalDeck } from '../components/ChaosLabSignalDeck';
import { ChaosLabTimeline } from '../components/ChaosLabTimeline';

interface ChaosLabOrchestrationPageProps {
  readonly tenant: string;
}

export const ChaosLabOrchestrationPage = ({ tenant }: ChaosLabOrchestrationPageProps) => {
  const chaos = useChaosLabDashboard({ tenant, mode: 'chaos', autoRefresh: true });
  const synthesis = useChaosLabDashboard({ tenant, mode: 'synthesis', autoRefresh: false });
  const continuity = useChaosLabDashboard({ tenant, mode: 'continuity', autoRefresh: false });

  const summary = useMemo(() => {
    const modes = [chaos, synthesis, continuity];
    const directiveSum = modes.reduce((acc, current) => acc + current.directiveCount, 0);
    const artifactSum = modes.reduce((acc, current) => acc + current.artifactCount, 0);
    return `directives=${directiveSum} artifacts=${artifactSum}`;
  }, [chaos.artifactCount, chaos.directiveCount, continuity.artifactCount, continuity.directiveCount, synthesis.artifactCount, synthesis.directiveCount]);

  const cards = [
    {
      label: 'chaos',
      hook: chaos,
    },
    {
      label: 'synthesis',
      hook: synthesis,
    },
    {
      label: 'continuity',
      hook: continuity,
    },
  ];

  return (
    <main>
      <h1>Recovery Chaos Orchestration Lab</h1>
      <h2>Tenant {tenant}</h2>
      <p>{summary}</p>
      {chaos.error ? <p role="alert">{chaos.error}</p> : null}
      <section>
        {cards.map(({ label, hook }) => (
          <ChaosLabControlDeck
            key={`${tenant}-${label}`}
            mode={label}
            title={`${label.toUpperCase()} Lab Control`}
            isRunning={hook.isRunning}
            directiveCount={hook.directiveCount}
            artifactCount={hook.artifactCount}
            summary={hook.summary}
            onRun={hook.runPlan}
          />
        ))}
      </section>
      <section>
        <h2>Signal Decks</h2>
        <ChaosLabSignalDeck tenant={tenant} timeline={chaos.timeline} directiveCount={chaos.directiveCount} summary={chaos.summary} />
        <ChaosLabSignalDeck tenant={tenant} timeline={synthesis.timeline} directiveCount={synthesis.directiveCount} summary={synthesis.summary} />
        <ChaosLabSignalDeck tenant={tenant} timeline={continuity.timeline} directiveCount={continuity.directiveCount} summary={continuity.summary} />
      </section>
      <section>
        <h2>Timelines</h2>
        <ChaosLabTimeline title={chaos.title} summary={chaos.summary} timeline={chaos.timeline} mode="chaos" />
        <ChaosLabTimeline title={synthesis.title} summary={synthesis.summary} timeline={synthesis.timeline} mode="synthesis" />
        <ChaosLabTimeline title={continuity.title} summary={continuity.summary} timeline={continuity.timeline} mode="continuity" />
      </section>
    </main>
  );
};
