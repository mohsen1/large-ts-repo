import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { RecoveryLabRegistryViewer } from '../components/RecoveryLabRegistryViewer';
import { mapScenarioToAdapter } from '../adapters/recoveryLabRegistryAdapter';
import { useRecoveryIncidentLabWorkspace } from '../hooks/useRecoveryIncidentLabWorkspace';
import type { IncidentLabRun } from '@domain/recovery-incident-lab-core';

export const RecoveryLabRegistryPage = (): ReactElement => {
  const workspace = useRecoveryIncidentLabWorkspace();
  const [timeline, setTimeline] = useState<readonly string[]>([]);

  const adapter = useMemo(() => {
    const scenario = workspace.state.scenario;
    const plan = workspace.plan;
    if (!scenario || !plan) {
      return null;
    }
    return mapScenarioToAdapter({
      namespace: 'registry-view',
      scenario,
      run: {
        runId: `${scenario.id}:timeline` as IncidentLabRun['runId'],
        planId: plan.id,
        scenarioId: scenario.id,
        startedAt: new Date().toISOString(),
        completeBy: undefined,
        state: 'ready',
        results: [],
      },
      plan,
      signals: ['capacity', 'latency', 'integrity', 'dependency'],
    });
  }, [workspace.state.scenario, workspace.plan]);

  useEffect(() => {
    if (!adapter) {
      setTimeline([]);
      return;
    }
    void (async () => {
      setTimeline(
        [
          ...adapter.eventStream.map((entry) => `${entry.scope}:${entry.name}`),
          ...adapter.artifactIds,
        ],
      );
    })();
  }, [adapter]);

  return (
    <main className="recovery-lab-registry-page">
      <h1>Recovery Lab Registry</h1>
      <RecoveryLabRegistryViewer timeline={timeline} />
    </main>
  );
};
