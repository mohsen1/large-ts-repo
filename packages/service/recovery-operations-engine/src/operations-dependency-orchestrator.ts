import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';
import type { RecoveryProgram, RecoveryRunState } from '@domain/recovery-orchestration';
import type { RunPlanSnapshot, RunSession, SessionDecision } from '@domain/recovery-operations-models';
import { withBrand } from '@shared/core';
import { buildCoordinationMetric } from '@domain/recovery-operations-models/coordination-metrics';
import { buildDeploymentImpactProfile } from '@domain/recovery-orchestration/deployment-impact';

export interface DependencyTopologyEntry {
  readonly from: string;
  readonly to: string;
  readonly reason: string;
}

export interface DependencyOrchestratorState {
  readonly tenant: string;
  readonly planId: string;
  readonly topology: readonly DependencyTopologyEntry[];
  readonly unresolvedCount: number;
  readonly hasBlockingSignal: boolean;
}

export interface DependencySnapshot {
  readonly runId: string;
  readonly plan: RunPlanSnapshot;
  readonly state: DependencyOrchestratorState;
  readonly impactProfileSummary: string;
}

export interface DependencyDecision {
  readonly decision: SessionDecision;
  readonly approved: boolean;
}

const buildTopology = (program: RecoveryProgram): readonly DependencyTopologyEntry[] =>
  program.topology.immutableDependencies.map(([from, to]) => ({
    from,
    to,
    reason: 'immutable',
  }));

export class OperationsDependencyOrchestrator {
  constructor(private readonly repository: RecoveryOperationsRepository) {}

  async loadSnapshot(program: RunPlanSnapshot, runState: RecoveryRunState): Promise<DependencySnapshot> {
    const topology = buildTopology(program.program);
    const unresolvedCount = topology.filter((edge) => !edge.from || !edge.to).length;
    const metric = buildCoordinationMetric(program, undefined);
    const impact = buildDeploymentImpactProfile(program.program, runState);

    return {
      runId: String(runState.runId),
      plan: program,
      state: {
        tenant: String(metric.tenant),
        planId: String(program.id),
        topology,
        unresolvedCount,
        hasBlockingSignal: impact.impactBand === 'severe',
      },
      impactProfileSummary: `${impact.impactBand}:${impact.projectedOutageMinutes}`,
    };
  }

  async acceptDecision(decision: SessionDecision): Promise<DependencyDecision> {
    const approved = decision.accepted && decision.reasonCodes.length === 0;
    await this.repository.upsertDecision(decision);
    return { decision, approved };
  }

  async appendSignal(runId: string, source: string, severity: number): Promise<void> {
    const session = await this.repository.loadSessionByRunId(runId);
    if (!session) return;

    const signal = {
      id: `signal-${runId}-${Date.now()}`,
      source,
      severity,
      confidence: Math.max(0, Math.min(1, severity / 10)),
      detectedAt: new Date().toISOString(),
      details: { reason: 'dependency-orchestrator' },
    };
    await this.repository.upsertSession({
      ...session,
      signals: [...session.signals, signal],
      updatedAt: new Date().toISOString(),
    });
  }

  async resolveSession(runId: string): Promise<RunSession | undefined> {
    const session = await this.repository.loadSessionByRunId(runId);
    if (!session) return undefined;
    return {
      ...session,
      status: 'completed',
      updatedAt: new Date().toISOString(),
    };
  }

  buildSyntheticRunState(runId: string, program: RecoveryProgram): RecoveryRunState {
    return {
      runId: withBrand(runId, 'RecoveryRunId'),
      programId: program.id,
      incidentId: withBrand(`inc-${runId}`, 'RecoveryIncidentId'),
      status: 'running',
      startedAt: new Date().toISOString(),
      completedAt: undefined,
      currentStepId: program.steps[0]?.id,
      nextStepId: program.steps[1]?.id,
      estimatedRecoveryTimeMinutes: program.steps.length * 2,
    };
  }
}
