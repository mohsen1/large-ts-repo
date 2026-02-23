import { useMemo } from 'react';
import { useScenarioPlanEngine } from '../../hooks/scenario/useScenarioPlanEngine';
import { useScenarioDataStream } from '../../hooks/scenario/useScenarioDataStream';
import { ScenarioBlueprintCard } from '../../components/scenario/ScenarioBlueprintCard';
import { ScenarioTimeline } from '../../components/scenario/ScenarioTimeline';
import { ScenarioConstraintPanel } from '../../components/scenario/ScenarioConstraintPanel';
import { ScenarioActivityFeed } from '../../components/scenario/ScenarioActivityFeed';
import type { RecoveryBlueprint, RecoveryPlan, IncidentEnvelope } from '@domain/recovery-scenario-orchestration';

const mkBlueprint = (tenantId: string, scenarioId: string): RecoveryBlueprint => ({
  id: `${tenantId}:blueprint` as any,
  tenantId: tenantId as any,
  scenarioId: scenarioId as any,
  name: `Scenario orchestration (${scenarioId})`,
  description: 'Stress scenario for orchestrating recovery operations',
  constraints: [
    {
      id: `${tenantId}:constraint-a` as any,
      key: 'latency',
      operator: 'gte',
      threshold: 50,
      windowMinutes: 2,
    },
    {
      id: `${tenantId}:constraint-b` as any,
      key: 'error-rate',
      operator: 'lt',
      threshold: 5,
      windowMinutes: 1,
    },
  ],
  actions: [
    {
      id: `${tenantId}:action-a` as any,
      code: 'failover',
      title: 'Failover active region',
      owner: 'ops',
      commandTemplate: 'run failover {{region}}',
      requiredApprovals: 1,
      estimatedMinutes: 5,
      status: 'ready',
      tags: ['critical', 'automated'],
    },
    {
      id: `${tenantId}:action-b` as any,
      code: 'scale-out',
      title: 'Scale out workers',
      owner: 'platform',
      commandTemplate: 'kubectl scale',
      requiredApprovals: 0,
      estimatedMinutes: 2,
      status: 'ready',
      tags: ['capacity'],
    },
  ],
  tags: ['incident', tenantId, scenarioId],
  priority: 4,
});

export const ScenarioOrchestrationPage = () => {
  const tenantId = 'tenant-critical';
  const scenarioId = 'incident-restore';
  const { workspace, events, run } = useScenarioPlanEngine({ tenantId, scenarioId, incidentId: `${scenarioId}-active` });
  const stream = useScenarioDataStream({ tenantId, scenarioId });

  const incident: IncidentEnvelope = {
    id: `${tenantId}:incident` as any,
    tenantId: tenantId as any,
    title: 'Recovery scenario test incident',
    severity: 'high',
    service: 'api-gateway',
    region: 'us-east-1',
    detectedAt: new Date().toISOString(),
    metadata: {
      origin: 'dashboard',
      incidentType: 'synthetic',
    },
  };

  const blueprint = mkBlueprint(tenantId, scenarioId);

  const selectedRunId = workspace.runs[0]?.id ?? null;
  const defaultPlan = useMemo<RecoveryPlan>(() => ({
    id: `${tenantId}:fallback-plan` as any,
    tenantId: tenantId as any,
    incidentId: `${tenantId}:incident` as any,
    scenarioId: scenarioId as any,
    blueprintId: `${tenantId}:blueprint` as any,
    state: 'planned',
    runbookVersion: 'v1',
    actions: blueprint.actions,
    confidence: 0.5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tags: ['fallback'],
  }), [blueprint.actions, scenarioId, tenantId]);

  return (
    <main className="scenario-orchestration-page">
      <header>
        <h1>Scenario Orchestration Workspace</h1>
        <p>Tenant: {tenantId}</p>
        <p>Active metrics buckets: {stream.latestByMetric.length}</p>
        <button onClick={() => void run(incident, blueprint)}>
          Draft scenario plan
        </button>
      </header>

      <section className="scenario-grid">
        <ScenarioBlueprintCard plan={workspace.plan ?? defaultPlan} selected={false} onSelect={() => {
          return;
        }} />
        <ScenarioTimeline runs={workspace.runs} selectedRunId={selectedRunId} onSelectRun={() => {
          return;
        }} />
        <ScenarioConstraintPanel
          constraints={stream.latestByMetric.map((entry) => ({
            id: entry.metric,
            key: entry.metric,
            state: entry.points.length > 5 ? 'met' : 'violated',
            score: entry.points.length / 10,
          }))}
          onJump={(id) => {
            return;
          }}
        />
        <ScenarioActivityFeed
          events={events.map((event) => ({ ...event }))}
          onSelectEvent={(id) => {
            return;
          }}
        />
      </section>
    </main>
  );
};
