import { useMemo } from 'react';

import { useRecoveryConsoleTelemetry } from '../hooks/useRecoveryConsoleTelemetry';
import type { RecoverySignal } from '@domain/recovery-operations-models';
import { OperationsDependencyTimeline } from '../components/OperationsDependencyTimeline';
import { OperationsOrchestrationStudio } from '../components/OperationsOrchestrationStudio';

interface RecoveryOperationsOrchestrationStudioPageProps {
  readonly tenant: string;
  readonly runId: string;
}

const buildPlanCatalog = (runId: string) => {
  return Array.from({ length: 6 }, (_, index) => ({
    id: `${runId}-${index}`,
    name: `Orchestrated sequence ${index + 1}`,
    steps: Math.max(2, (index + 2) * 2),
  }));
};

const mockDependencies = (seed: string) =>
  Array.from({ length: 7 }, (_, index) => ({
    id: `${seed}-svc-${index}`,
    owner: index === 0 ? 'core' : index % 2 === 0 ? 'platform' : 'ops',
    region: index % 2 === 0 ? 'us-east-1' : 'eu-west-1',
  }));

const buildSignals = (runId: string) => {
  return Array.from({ length: 18 }, (_, index) => ({
    id: `${runId}-sig-${index}`,
    source: index % 3 === 0 ? 'telemetry' : 'policy',
    severity: (index % 9) + 1,
    confidence: Number(((index % 10) / 10).toFixed(1)),
    detectedAt: new Date(Date.now() - index * 45_000).toISOString(),
    details: { index },
  })) as readonly RecoverySignal[];
};

export const RecoveryOperationsOrchestrationStudioPage = ({ tenant, runId }: RecoveryOperationsOrchestrationStudioPageProps) => {
  const telemetry = useRecoveryConsoleTelemetry({
    simulations: [],
    filter: { tenant: tenant, runId },
  });

  const plans = useMemo(() => buildPlanCatalog(runId), [runId]);
  const dependencies = useMemo(() => mockDependencies(tenant), [tenant]);
  const signals = useMemo(() => buildSignals(runId), [runId]);
  const nodes = useMemo(
    () => dependencies.map((dependency) => ({
      id: dependency.id,
      region: dependency.region,
      criticality: Math.max(1, dependency.id.length + dependency.region.length),
    })),
    [dependencies],
  );
  const edges = useMemo(
    () =>
      dependencies
        .map((dependency, index) => {
          const next = dependencies[index + 1];
          if (!next) return undefined;
          return {
            id: `${dependency.id}-${next.id}`,
            source: dependency.id,
            target: next.id,
            reliability: dependency.owner === 'core' ? 0.95 : 0.7,
          };
        })
        .filter((entry): entry is { id: string; source: string; target: string; reliability: number } => Boolean(entry)),
    [dependencies],
  );

  const totalSignals = telemetry.recent.length + signals.length;

  return (
    <main>
      <h1>Recovery orchestration studio</h1>
      <p>{tenant}</p>
      <p>{`run: ${runId} · telemetry snapshots: ${telemetry.recent.length}`}</p>
      <p>{`total signal source count ${totalSignals}`}</p>
      <OperationsOrchestrationStudio
        tenant={tenant}
        candidatePlans={plans}
        signals={signals}
        dependencies={dependencies}
      />
      <OperationsDependencyTimeline nodes={nodes} edges={edges} />
      <section>
        <h2>Signal feed</h2>
        <ul>
          {telemetry.recent.map((summary) => (
            <li key={summary.id}>
              <span>{summary.id}</span>
              {' - '}
              <strong>{summary.score}</strong>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
};
