import { RecoveryScenarioOrchestrator, type OrchestratorInput, type OrchestratorSnapshot } from '@domain/recovery-scenario-orchestration';
import { emitPlan, emitConstraintPayload } from './integrations';
import type { ConstraintSnapshot } from '@domain/recovery-scenario-orchestration';
import type { ConstraintEnvelope } from '@infrastructure/recovery-scenario-gateway';
import { constraintsToSnapshots } from '@domain/recovery-scenario-orchestration';
import type { ServiceInput, ServiceState } from './types';

export class RecoveryScenarioPlanner {
  private readonly orchestrator: RecoveryScenarioOrchestrator;
  private state: ServiceState;

  constructor(private readonly actorId: string) {
    this.orchestrator = new RecoveryScenarioOrchestrator();
    this.state = {
      tenantId: '' as never,
      scenarioId: '' as never,
      activePlan: null,
      runs: [],
      planHistory: [],
      signalCount: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  draft(input: ServiceInput): OrchestratorSnapshot {
    const runtime: OrchestratorInput = {
      intent: {
        scenarioId: input.scenarioId,
        tenantId: input.tenantId,
        label: `${input.scenarioId}:draft`,
        owners: ['ops', 'platform'],
      },
      incident: input.incident,
      signals: input.signals,
      context: {
        tenantId: input.tenantId,
        requestedBy: input.actorId,
        startedBy: input.actorId,
        startedAt: new Date().toISOString(),
        tags: ['reactive', 'automated', input.scenarioId],
      },
      blueprint: input.blueprint,
    };

    const snapshot = this.orchestrator.plan(runtime, this.actorId);
    this.state = {
      tenantId: input.tenantId,
      scenarioId: input.scenarioId,
      activePlan: snapshot.plan,
      runs: [...snapshot.runs],
      planHistory: this.state.planHistory,
      signalCount: input.signals.length,
      lastUpdated: new Date().toISOString(),
    };

    emitPlan('recovery-incident-scenario-orchestrator', input.tenantId, input.incident.id as string, snapshot.plan, snapshot.runs[0] ?? null);
    return snapshot;
  }

  validate(snapshot: OrchestratorSnapshot, snapshots: readonly ConstraintSnapshot[]): { plan: OrchestratorSnapshot['plan']; canRun: boolean } {
    const blocking = snapshots.some((entry) => entry.state === 'violated');
    const payload: ConstraintEnvelope = {
      status: blocking ? 'rejected' : 'accepted',
      constraints: snapshots,
      blockingCount: snapshots.filter((item) => item.state === 'violated').length,
    };
    emitConstraintPayload('recovery-incident-scenario-orchestrator', this.state.tenantId, snapshot.plan.incidentId as string, payload);
    return { plan: snapshot.plan, canRun: !blocking };
  }

  hydrate(): ServiceState {
    return {
      ...this.state,
      lastUpdated: new Date().toISOString(),
    };
  }

  schedule(signalSnapshots: readonly ConstraintSnapshot[]): { total: number; blockers: number } {
    const snapshots = snapshotToValues(signalSnapshots);
    const blockers = snapshots.filter((entry) => entry.state === 'violated').length;
    return {
      total: snapshots.length,
      blockers,
    };
  }
}

const snapshotToValues = (values: readonly ConstraintSnapshot[]): readonly { readonly state: ConstraintSnapshot['state'] }[] =>
  values.map((entry) => ({ state: entry.state }));
