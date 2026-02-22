import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';
import type { RecoveryProgram, RecoveryRunState, RecoveryWindow, RecoveryRunId, RecoveryProgramId, RecoveryIncidentId } from '@domain/recovery-orchestration';
import type { RunPlanSnapshot, RunSession, SessionDecision, RunSessionId, RunTicketId, RunPlanId } from '@domain/recovery-operations-models';
import { buildDeploymentImpactProfile, DeploymentImpactProfile, profileToSummary } from '@domain/recovery-orchestration/deployment-impact';
import { buildCoordinationMetric, groupBySessionState, TenantCoordinationBoard } from '@domain/recovery-operations-models/coordination-metrics';
import { buildPriorityMatrix, PriorityMatrix, summarizeMatrix } from '@domain/recovery-operations-models/incident-priority-matrix';
import { buildStrategyReport, StrategyRunReport } from '@domain/recovery-orchestration/strategy-lanes';
import { withBrand } from '@shared/core';

export interface OperationsInsightFilters {
  readonly tenant: string;
  readonly status?: RunSession['status'];
}

export interface OperationsProgramRuntime {
  readonly runId: RecoveryRunId;
  readonly session: RunSession;
  readonly program: RecoveryProgram;
  readonly latestRunState: RecoveryRunState;
  readonly strategyReport: StrategyRunReport;
  readonly impactProfile: DeploymentImpactProfile;
}

export interface OperationsInsightSnapshot {
  readonly tenant: string;
  readonly planCount: number;
  readonly runtimeCount: number;
  readonly board: TenantCoordinationBoard;
  readonly matrix: PriorityMatrix;
  readonly matrixSummary: ReturnType<typeof summarizeMatrix>;
  readonly lastUpdated: string;
}

const makeSyntheticProgram = (seed: string, tenant: string): RecoveryProgram => ({
  id: withBrand(seed, 'RecoveryProgramId'),
  tenant: withBrand(tenant, 'TenantId'),
  service: withBrand(`${tenant}-svc`, 'ServiceId'),
  name: `program-${seed}`,
  description: 'Synthetic program for orchestration summary',
  priority: 'silver',
  mode: 'defensive',
  window: {
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    timezone: 'UTC',
  },
  topology: {
    rootServices: ['api-gw'],
    fallbackServices: ['control-plane'],
    immutableDependencies: [['api-gw', 'control-plane']],
  },
  constraints: [],
  steps: [
    {
      id: 'seed-step',
      title: 'seed step',
      command: 'noop',
      timeoutMs: 1000,
      dependencies: [],
      requiredApprovals: 0,
      tags: ['synth'],
    },
  ],
  owner: 'engine',
  tags: ['generated'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const sessionToPlan = (session: RunSession): RunPlanSnapshot => ({
  id: session.planId,
  name: `plan-${session.planId}`,
  program: makeSyntheticProgram(String(session.id), String(session.id)),
  constraints: session.constraints,
  fingerprint: {
    tenant: withBrand(String(session.id), 'TenantId'),
    region: 'us-east-1',
    serviceFamily: 'recovery',
    impactClass: 'infrastructure',
    estimatedRecoveryMinutes: Math.max(1, session.constraints.timeoutMinutes),
  },
  sourceSessionId: session.id,
  effectiveAt: new Date(session.createdAt).toISOString(),
});

const runStateFromSession = (session: RunSession): RecoveryRunState => ({
  runId: session.runId,
  programId: session.planId as unknown as RecoveryProgramId,
  incidentId: withBrand(String(session.id), 'RecoveryIncidentId'),
  status: 'running',
  startedAt: session.createdAt,
  completedAt: undefined,
  currentStepId: undefined,
  nextStepId: undefined,
  estimatedRecoveryTimeMinutes: Math.max(5, session.signals.length * 2),
});

export class RecoveryOperationsInsightEngine {
  constructor(private readonly repository: RecoveryOperationsRepository) {}

  async loadBoard(filters: OperationsInsightFilters): Promise<OperationsInsightSnapshot> {
    const snapshot = await this.repository.loadLatestSnapshot(filters.tenant);
    if (!snapshot) {
      return {
        tenant: filters.tenant,
        planCount: 0,
        runtimeCount: 0,
        board: {
          tenant: withBrand(filters.tenant, 'TenantId'),
          active: [],
          blocked: [],
          completed: [],
          updatedAt: new Date().toISOString(),
        },
        matrix: buildPriorityMatrix([], filters.tenant),
        matrixSummary: summarizeMatrix(buildPriorityMatrix([], filters.tenant)),
        lastUpdated: new Date().toISOString(),
      };
    }

    const sessions = snapshot.sessions.filter((session) =>
      filters.status == null || session.status === filters.status,
    );
    const plans = sessions.map((session) => sessionToPlan(session));
    const board = groupBySessionState(plans.map((plan, index) => ({
      plan,
      session: sessions[index],
    })));

    return {
      tenant: filters.tenant,
      planCount: plans.length,
      runtimeCount: sessions.length,
      board,
      matrix: buildPriorityMatrix(plans, filters.tenant),
      matrixSummary: summarizeMatrix(buildPriorityMatrix(plans, filters.tenant)),
      lastUpdated: new Date().toISOString(),
    };
  }

  async loadRunSummaries(filters: OperationsInsightFilters): Promise<readonly OperationsProgramRuntime[]> {
    const board = await this.loadBoard(filters);
    if (board.runtimeCount === 0) {
      return [];
    }
    return board.board.active.map((metric) => {
      const runState = runStateFromSession({
        id: withBrand(metric.runId, 'RunSessionId'),
        runId: withBrand(metric.runId, 'RecoveryRunId'),
        ticketId: withBrand(`ticket-${metric.runId}`, 'RunTicketId'),
        planId: metric.runId,
        status: 'running',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        constraints: {
          maxParallelism: 1,
          maxRetries: 0,
          timeoutMinutes: 10,
          operatorApprovalRequired: false,
        },
        signals: [],
      });
      const plan = sessionToPlan(runState as unknown as RunSession);
      const program = plan.program;
      return {
        runId: runState.runId,
        session: runState as unknown as RunSession,
        program,
        latestRunState: runState,
        strategyReport: buildStrategyReport(runState, program),
        impactProfile: buildDeploymentImpactProfile(program, runState),
      };
    });
  }

  async buildDigest(filters: OperationsInsightFilters): Promise<{ summary: string; details: string[] }> {
    const board = await this.loadBoard(filters);
    const metrics = board.board.active.map((entry) => buildCoordinationMetric({
      id: entry.runId,
      name: `plan-${entry.runId}`,
      program: makeSyntheticProgram(String(entry.runId), filters.tenant),
      constraints: {
        maxParallelism: 1,
        maxRetries: 0,
        timeoutMinutes: 10,
        operatorApprovalRequired: false,
      },
      fingerprint: {
        tenant: withBrand(filters.tenant, 'TenantId'),
        region: 'us-east-1',
        serviceFamily: 'recovery',
        impactClass: 'database',
        estimatedRecoveryMinutes: entry.estimatedMinutes,
      },
      sourceSessionId: withBrand(String(entry.runId), 'RunSessionId'),
      effectiveAt: new Date().toISOString(),
    } as RunPlanSnapshot));

    return {
      summary: `operations-${filters.tenant}`,
      details: [
        `plans=${board.planCount}`,
        `active=${board.board.active.length}`,
        `blocked=${board.board.blocked.length}`,
        ...board.matrixSummary.map((entry) => `${entry.band}:${entry.count}`),
        ...metrics.map((metric) => metric.summary),
      ],
    };
  }

  async submitDecision(decision: SessionDecision): Promise<void> {
    await this.repository.upsertDecision(decision);
  }
}

export const summarizeImpact = (profile: DeploymentImpactProfile): string => profileToSummary(profile);

export const buildRunStrategyDigest = (runtime: OperationsProgramRuntime): string =>
  `${runtime.runId}:${runtime.strategyReport.score}:${runtime.impactProfile.impactBand}`;

export const buildFleetImpact = (entries: readonly OperationsProgramRuntime[]): DeploymentImpactProfile[] =>
  entries.map((entry) => entry.impactProfile);

export const buildStrategyReports = (entries: readonly OperationsProgramRuntime[]) =>
  entries.map((entry) => entry.strategyReport);

export const buildLatestBoard = async (
  repository: RecoveryOperationsRepository,
  tenant: string,
): Promise<TenantCoordinationBoard> => {
  const engine = new RecoveryOperationsInsightEngine(repository);
  const result = await engine.loadBoard({ tenant, status: 'running' });
  return result.board;
};
