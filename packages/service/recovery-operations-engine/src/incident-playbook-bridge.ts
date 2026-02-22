import type { RecoveryRunState } from '@domain/recovery-orchestration';
import type { RunSession, RecoverySignal, SessionDecision } from '@domain/recovery-operations-models';
import type { OperationsAnalyticsReport, OperationsAnalyticsWindow } from '@data/recovery-operations-analytics';
import { buildOperationsReport, enrichScoredSessions, summarizeAggregateSignals } from '@data/recovery-operations-analytics';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import { summarizeTopology, buildProgramTopology } from '@domain/recovery-operations-models';
import { withBrand } from '@shared/core';
import { toDispatchSignalDigest, createOperationsMetrics } from './quality';
import type { RunSessionPlan } from './plan';
import { buildPlanReadiness } from './plan';

export interface PlaybookStep {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly command: string;
  readonly retryBudget: number;
  readonly dependsOn: readonly string[];
}

export interface PlaybookDefinition {
  readonly id: string;
  readonly tenant: string;
  readonly runId: string;
  readonly steps: readonly PlaybookStep[];
  readonly notes: readonly string[];
  readonly createdAt: string;
  readonly tags: readonly string[];
}

export interface PlaybookExecutionState {
  readonly runId: string;
  readonly planId: string;
  readonly status: 'draft' | 'ready' | 'executing' | 'completed' | 'blocked';
  readonly completedSteps: readonly string[];
  readonly failedSteps: readonly string[];
  readonly timeline: readonly string[];
}

export interface PlaybookBridgeDeps {
  readonly runState: RecoveryRunState;
  readonly run: RunSession;
  readonly plan: RunSessionPlan;
}

export class IncidentPlaybookBridge {
  private readonly steps: PlaybookStep[];
  private readonly notes: string[] = [];
  private state: PlaybookExecutionState;

  constructor(private readonly deps: PlaybookBridgeDeps) {
    const topology = buildProgramTopology(this.deps.plan.snapshot.program);
    this.steps = topology.layers.flatMap((layer) =>
      layer.stepIds.map((stepId) => ({
        id: `${this.deps.run.runId}-${stepId}`,
        name: `step-${stepId}`,
        description: `Run ${stepId} via layer ${layer.index}`,
        command: `apply:${stepId}`,
        retryBudget: layer.approvalLoad,
        dependsOn: layer.stepIds.slice(0, Math.max(0, layer.index)),
      })),
    );
    this.state = {
      runId: String(this.deps.run.runId),
      planId: String(this.deps.plan.snapshot.id),
      status: 'draft',
      completedSteps: [],
      failedSteps: [],
      timeline: [],
    };
  }

  getDefinition(): PlaybookDefinition {
    const topology = buildProgramTopology(this.deps.plan.snapshot.program);
    const summary = summarizeTopology(this.deps.plan.snapshot.program);
    return {
      id: `playbook-${this.deps.run.runId}`,
      tenant: String(this.deps.run.id),
      runId: String(this.deps.run.runId),
      steps: this.steps,
      notes: [
        ...this.notes,
        `layers=${topology.layers.length}`,
        `risk=${summary.riskSurface}`,
        `timeout=${summary.averageTimeoutMs}`,
      ],
      createdAt: new Date().toISOString(),
      tags: ['incident-playbook', summary.riskSurface],
    };
  }

  async buildFromReadiness(readiness: RecoveryReadinessPlan): Promise<PlaybookDefinition> {
    const metrics = toDispatchSignalDigest(createOperationsMetrics(String(this.deps.run.runId), readiness.targets.length, this.deps.run.signals.length));
    const topology = buildProgramTopology(this.deps.plan.snapshot.program);
    this.notes.push(
      `readiness=${readiness.runId}`,
      `targetCount=${readiness.targets.length}`,
      `metric=${metrics}`,
      `topology=${topology.summary.criticalPathLength}`,
    );
    return this.getDefinition();
  }

  async seedFromSignals(signals: readonly RecoverySignal[]): Promise<OperationsAnalyticsReport> {
    const report = buildOperationsReport({
      tenant: String(this.deps.run.id),
      signals,
      sessions: [this.deps.run],
      decisions: [],
      assessments: [],
    });
    const aggregate = summarizeAggregateSignals({
      tenant: String(this.deps.run.id),
      sessions: [this.deps.run],
      signals,
      assessments: [],
    });
    const readiness = buildPlanReadiness(this.deps.plan, signals.length);
    const enriched = enrichScoredSessions([this.deps.run]);
    this.notes.push(
      `acceptance=${readiness.canAutoRun}`,
      `risk=${readiness.riskBand}`,
      `coverage=${aggregate.signalDensity.length}`,
    );
    this.state = {
      ...this.state,
      status: 'ready',
      timeline: [...this.state.timeline, `seed:${readiness.canAutoRun}`, `signals=${signals.length}`, `scored=${enriched.length}`],
    };
    return report;
  }

  markStepCompleted(stepId: string): PlaybookExecutionState {
    if (this.state.completedSteps.includes(stepId)) {
      return this.state;
    }
    const nextTimeline = [...this.state.timeline, `complete:${stepId}`];
    const nextCompleted = [...this.state.completedSteps, stepId];
    const nextStatus = nextCompleted.length >= this.steps.length ? 'completed' : 'executing';
    this.state = {
      ...this.state,
      status: nextStatus,
      completedSteps: nextCompleted,
      timeline: nextTimeline,
    };
    return this.state;
  }

  markStepFailed(stepId: string, reason: string): PlaybookExecutionState {
    const nextFailed = this.state.failedSteps.includes(stepId) ? this.state.failedSteps : [...this.state.failedSteps, stepId];
    this.notes.push(`failure:${stepId}:${reason}`);
    this.state = {
      ...this.state,
      status: 'blocked',
      failedSteps: nextFailed,
      timeline: [...this.state.timeline, `fail:${stepId}`],
    };
    return this.state;
  }

  exportState(): PlaybookExecutionState {
    return { ...this.state };
  }

  exportWindowReport(tenant: string, signals: readonly RecoverySignal[]): OperationsAnalyticsWindow {
    const brandedTenant = withBrand(tenant, 'TenantId');
    return {
      tenant: brandedTenant,
      window: {
        from: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        to: new Date().toISOString(),
        zone: 'UTC',
        kind: 'hour',
      },
      sessions: [this.deps.run],
      sessionsByStatus: {
        queued: 0,
        warming: 0,
        running: 1,
        blocked: 0,
        completed: 0,
        failed: 0,
        aborted: 0,
      },
      sessionScoreTrend: {
        direction: 'flat',
        points: [
          { timestamp: new Date().toISOString(), value: signals.length },
          { timestamp: new Date(Date.now() + 60_000).toISOString(), value: Math.max(0, signals.length - 1) },
        ],
      },
    };
  }

  emitDecision(decision: SessionDecision): string {
    const note = [
      `run=${decision.runId}`,
      `accepted=${decision.accepted}`,
      `score=${decision.score}`,
      `reasons=${decision.reasonCodes.join(',')}`,
    ].join('|');
    this.state = {
      ...this.state,
      timeline: [...this.state.timeline, `decision:${decision.ticketId}`],
    };
    return note;
  }

  static buildDefaultSteps(tenant: string, readiness: RecoveryReadinessPlan, runId: string): PlaybookStep[] {
    const baseWindow = readiness.windows[0];
    const init = `init-${runId}`;
    const verify = `verify-${runId}`;
    return [
      {
        id: init,
        name: 'initialize',
        description: `Initialize ${tenant} recovery run`,
        command: `init:${tenant}`,
        retryBudget: 1,
        dependsOn: [],
      },
      {
        id: verify,
        name: 'verify-readiness',
        description: 'Verify readiness windows and targets',
        command: `verify:${baseWindow?.windowId ?? 'default'}`,
        retryBudget: 2,
        dependsOn: [init],
      },
      {
        id: `execute-${runId}`,
        name: 'execute',
        description: readiness.objective,
        command: `execute:${readiness.title}`,
        retryBudget: 3,
        dependsOn: [verify],
      },
    ];
  }
}

export const buildPlaybookBridgeFromPlan = (
  runState: RecoveryRunState,
  run: RunSession,
  plan: RunSessionPlan,
): IncidentPlaybookBridge => new IncidentPlaybookBridge({ runState, run, plan });
