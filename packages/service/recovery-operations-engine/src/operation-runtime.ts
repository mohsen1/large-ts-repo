import type { RecoveryProgram, RecoveryRunState } from '@domain/recovery-orchestration';
import {
  buildProgramTopology,
  type TopologyLayer,
  type TopologySummary,
  type ProgramTopology,
} from '@domain/recovery-operations-models';
import type {
  RecoverySignal,
  RunSession,
  RunPlanSnapshot,
  SessionStatus,
} from '@domain/recovery-operations-models';
import { withBrand } from '@shared/core';
import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import { buildRunSchedule } from './schedule';
import { createJournal, type OperationsJournal } from './journal';
import type { RunSessionPlan } from './plan';

export interface RuntimeCommand {
  readonly command: string;
  readonly runId: RunSession['runId'];
  readonly issuedAt: string;
}

export interface RuntimeContext {
  readonly commandTimeoutMs: number;
  readonly maxAttempts: number;
  readonly allowParallel: boolean;
}

export interface RuntimeCheckpoint {
  readonly runId: string;
  readonly at: string;
  readonly status: SessionStatus;
  readonly commandCount: number;
  readonly signalCount: number;
}

export interface RuntimeSession {
  readonly runId: RunSession['runId'];
  readonly planId: RunPlanSnapshot['id'];
  readonly program: RecoveryProgram;
  readonly status: SessionStatus;
  readonly topology: ProgramTopology;
  readonly schedule: ReturnType<typeof buildRunSchedule>;
  readonly history: readonly RuntimeCheckpoint[];
}

type LayerQueue = Map<number, readonly TopologyLayer[]>;

const makeRunId = (input: string): RecoveryRunState['runId'] => withBrand(input, 'RecoveryRunId');

const nextStatus = (status: SessionStatus, commandCount: number, total: number): SessionStatus => {
  if (status === 'aborted' || status === 'failed' || status === 'completed') {
    return status;
  }
  if (commandCount >= total) return 'completed';
  if (status === 'queued') return 'warming';
  if (status === 'warming') return 'running';
  if (status === 'running' && commandCount + 1 >= total) return 'completed';
  return 'running';
};

export interface RuntimeState {
  readonly context: RuntimeContext;
  readonly sessions: readonly RuntimeSession[];
}

interface RuntimeStorage {
  loadSession(runId: string): Promise<RunSession | undefined>;
  upsertSession(session: RunSession): Promise<void>;
}

export class OperationRuntime {
  private readonly journal: OperationsJournal;
  private readonly sessions = new Map<string, RuntimeSession>();

  constructor(
    private readonly repository: RuntimeStorage,
    private readonly context: RuntimeContext,
  ) {
    this.journal = createJournal();
  }

  private buildLayerQueue(topology: ProgramTopology): LayerQueue {
    const map = new Map<number, readonly TopologyLayer[]>();
    for (const layer of topology.layers) {
      const key = layer.index;
      const existing = map.get(key) ?? [];
      map.set(key, [...existing, layer]);
    }
    return map;
  }

  async hydrateRuntimeSession(runId: string): Promise<RuntimeSession | undefined> {
    const session = await this.repository.loadSession(runId);
    if (!session) return undefined;

    const plan = await this.repository.loadSession(runId);
    if (!plan) return undefined;

    const topology = buildProgramTopology({
      id: withBrand(`plan-${runId}`, 'RecoveryProgramId'),
      tenant: withBrand('tenant', 'TenantId'),
      service: withBrand('service', 'ServiceId'),
      name: `Run ${runId} Program`,
      description: 'Recovered runtime topology',
      priority: 'silver',
      mode: 'restorative',
      window: {
        startsAt: new Date(Date.now()).toISOString(),
        endsAt: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
        timezone: 'UTC',
      },
      topology: {
        rootServices: ['core-api'],
        fallbackServices: ['fallback-cache'],
        immutableDependencies: [],
      },
      constraints: [],
      steps: plan.signals.map((signal, index) => ({
        id: `step-${index}`,
        title: signal.source,
        command: `inspect:${signal.id}`,
        timeoutMs: 1_000,
        dependencies: index > 0 ? [`step-${index - 1}`] : [],
        requiredApprovals: 0,
        tags: [signal.source],
      })),
      owner: session.ticketId,
      tags: ['runtime', 'recovered'],
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    });

    const schedule = buildRunSchedule(
      {
        id: withBrand(`plan-${runId}`, 'RunPlanId'),
        name: `schedule-${runId}`,
        program: topology ? ({} as never) : ({} as never),
        constraints: {
          maxParallelism: 2,
          maxRetries: 1,
          timeoutMinutes: 10,
          operatorApprovalRequired: false,
        },
        fingerprint: {
          tenant: withBrand('tenant', 'TenantId'),
          region: 'us-east-1',
          serviceFamily: 'platform',
          impactClass: 'application',
          estimatedRecoveryMinutes: 10,
        },
        sourceSessionId: undefined,
        effectiveAt: new Date().toISOString(),
      } as RunPlanSnapshot,
      {
        ...session,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      } as RunSession,
      {
        readinessState: ['warm'],
        approvals: 0,
        signalPressure: session.signals.length,
      },
    );

    const next: RuntimeSession = {
      runId: session.runId,
      planId: withBrand(`plan-${runId}`, 'RunPlanId'),
      program: {} as RecoveryProgram,
      status: session.status,
      topology,
      schedule,
      history: [
        {
          runId: String(session.runId),
          at: new Date().toISOString(),
          status: session.status,
          commandCount: 0,
          signalCount: session.signals.length,
        },
      ],
    };

    this.sessions.set(String(runId), next);
    return next;
  }

  private appendCheckpoint(runtime: RuntimeSession, status: SessionStatus): RuntimeSession {
    const checkpoint: RuntimeCheckpoint = {
      runId: String(runtime.runId),
      at: new Date().toISOString(),
      status,
      commandCount: runtime.topology.layers.length,
      signalCount: runtime.schedule.segments.length,
    };
    return {
      ...runtime,
      status,
      history: [...runtime.history, checkpoint],
    };
  }

  private summarizeTopology(topology: ProgramTopology): TopologySummary {
    return topology.summary;
  }

  async executeCommand(runId: string, command: RuntimeCommand): Promise<Result<RuntimeSession, string>> {
    const current = this.sessions.get(runId);
    if (!current) {
      const loaded = await this.hydrateRuntimeSession(runId);
      if (!loaded) return fail('SESSION_NOT_FOUND');
      this.sessions.set(runId, loaded);
      return this.executeCommand(runId, command);
    }

    const layerQueue = this.buildLayerQueue(current.topology);
    const planCount = Array.from(layerQueue.values()).reduce((count, values) => count + values.length, 0);
    const status = nextStatus(current.status, current.history.length, Math.max(1, planCount));
    const next = this.appendCheckpoint(current, status);
    this.sessions.set(runId, next);

    const summary = this.summarizeTopology(current.topology);
    this.journal.appendDecision(
      String(current.runId),
      command.runId,
      status === 'completed' ? 'allow' : 'defer',
      [command.command, summary.riskSurface],
    );

    const runState: RecoveryRunState = {
      runId: makeRunId(String(current.runId)),
      programId: withBrand(`program-${runId}`, 'RecoveryProgramId'),
      incidentId: withBrand(`incident-${runId}`, 'RecoveryIncidentId'),
      status: status === 'completed' ? 'completed' : 'running',
      estimatedRecoveryTimeMinutes: Math.max(1, summary.averageTimeoutMs / 1000),
    };
    void runState;
    return ok(next);
  }

  async hydrate(plan: RunSessionPlan): Promise<RuntimeSession> {
    const initial: RuntimeSession = {
      runId: plan.runId,
      planId: plan.snapshot.id,
      program: {} as RecoveryProgram,
      status: 'queued',
      topology: buildProgramTopology(plan.snapshot.program),
      schedule: buildRunSchedule(
        plan.snapshot,
        {
          id: withBrand(`session-${plan.runId}`, 'RunSessionId'),
          runId: plan.runId,
          ticketId: plan.ticketId,
          planId: plan.snapshot.id,
          status: 'queued',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          constraints: plan.snapshot.constraints,
          signals: [],
        },
        {
          approvals: 0,
          readinessState: ['boot'],
          signalPressure: 1,
        },
      ),
      history: [],
    };
    this.sessions.set(String(plan.runId), initial);
    return initial;
  }

  async createSession(plan: RunSessionPlan, session: RunSession, signals: readonly RecoverySignal[]): Promise<Result<RuntimeSession, string>> {
    const topology = buildProgramTopology(session.planId ? ({} as RecoveryProgram) : plan.snapshot.program);
    if (topology.summary.stepCount === 0) {
      return fail('EMPTY_TOPOLOGY');
    }

    const baseSession: RuntimeSession = {
      runId: session.runId,
      planId: plan.snapshot.id,
      program: plan.snapshot.program,
      status: session.status,
      topology,
      schedule: buildRunSchedule(plan.snapshot, session, {
        maxConcurrency: plan.snapshot.constraints.maxParallelism,
        approvals: session.signals.length,
        signalPressure: signals.length,
      }),
      history: [
        {
          runId: String(session.runId),
          at: new Date().toISOString(),
          status: session.status,
          commandCount: 0,
          signalCount: signals.length,
        },
      ],
    };

    this.sessions.set(String(session.runId), baseSession);
    await this.repository.upsertSession(session);
    return ok(baseSession);
  }
}

export const createOperationRuntime = (
  repository: RuntimeStorage,
  context: RuntimeContext,
): OperationRuntime => {
  return new OperationRuntime(repository, context);
};
