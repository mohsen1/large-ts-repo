import { useMemo, useState } from 'react';
import { withBrand } from '@shared/core';
import { InMemoryRecoveryOperationsRepository } from '@data/recovery-operations-store';
import {
  hydrateWorkspaceBySession,
  type WorkspaceEnvelope,
} from '@data/recovery-operations-store';
import { buildCommandSurface, summarizeSurface } from '@domain/recovery-operations-models/command-surface';
import { buildOrchestrationMatrix, buildReadinessProfile } from '@domain/recovery-operations-models/orchestration-matrix';
import { buildPortfolioReadinessBoard } from '@domain/recovery-operations-models/portfolio-readiness';
import type { RecoverySignal, RunPlanSnapshot } from '@domain/recovery-operations-models';
import { withBrand as withBrandShared } from '@shared/core';
import type { SessionStatus } from '@domain/recovery-operations-models';
import type { RecoveryMode, RecoveryPriority } from '@domain/recovery-orchestration';

interface RecoveryOpsWorkspaceInput {
  readonly tenant: string;
  readonly signals: readonly RecoverySignal[];
  readonly plans: readonly RunPlanSnapshot[];
}

export interface RecoveryOpsWorkspaceState {
  readonly tenant: string;
  readonly ready: boolean;
  readonly workspaceId: string;
  readonly planCount: number;
  readonly commandSurfaceScore: number;
  readonly matrixRiskScore: number;
  readonly signalDigest: string;
  readonly recommendation: string;
  readonly refresh: () => void;
}

const summarizeSignalDigest = (signals: readonly RecoverySignal[]): string => {
  const bySource = new Map<string, number>();
  for (const signal of signals) {
    bySource.set(signal.source, (bySource.get(signal.source) ?? 0) + 1);
  }
  return [...bySource.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([source, count]) => `${source}:${count}`)
    .join('|');
};

const fallbackRunPlan = (tenant: string): RunPlanSnapshot => ({
  id: withBrand(`${tenant}:fallback-plan`, 'RunPlanId'),
  name: 'fallback-plan',
  program: {
    id: withBrand(`${tenant}:fallback-program`, 'RecoveryProgramId'),
    tenant: withBrandShared(tenant, 'TenantId'),
    service: withBrandShared('service', 'ServiceId'),
    name: 'fallback',
    description: 'fallback program',
    priority: 'silver' as RecoveryPriority,
    mode: 'defensive' as RecoveryMode,
    window: {
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      timezone: 'UTC',
    },
    topology: {
      rootServices: ['runtime'],
      fallbackServices: ['runtime-backup'],
      immutableDependencies: [['runtime', 'runtime-backup']],
    },
    constraints: [],
    steps: [],
    owner: 'operator',
    tags: ['fallback'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  constraints: {
    maxParallelism: 2,
    maxRetries: 1,
    timeoutMinutes: 15,
    operatorApprovalRequired: false,
  },
  fingerprint: {
    tenant: withBrand(tenant, 'TenantId'),
    region: 'global',
    serviceFamily: 'runtime',
    impactClass: 'infrastructure',
    estimatedRecoveryMinutes: 20,
  },
  effectiveAt: new Date().toISOString(),
});

const buildState = (input: RecoveryOpsWorkspaceInput): {
  workspace: WorkspaceEnvelope;
  commandSurfaceScore: number;
  matrixRiskScore: number;
  recommendation: string;
} => {
  const repository = new InMemoryRecoveryOperationsRepository();
  const session = {
    id: withBrand(`${input.tenant}:session`, 'RunSessionId'),
    runId: withBrand(`${input.tenant}:run`, 'RecoveryRunId'),
    ticketId: withBrand(`${input.tenant}:ticket`, 'RunTicketId'),
    planId: withBrand(`${input.tenant}:plan`, 'RunPlanId'),
    status: 'running' as SessionStatus,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    constraints: {
      maxParallelism: 4,
      maxRetries: 2,
      timeoutMinutes: 30,
      operatorApprovalRequired: false,
    },
    signals: input.signals,
  };

  const plans = input.plans.length > 0 ? input.plans : [fallbackRunPlan(input.tenant)];

  for (const plan of plans) {
    void repository.upsertPlan(plan);
    void repository.upsertSession(session);
  }

  const workspace = hydrateWorkspaceBySession(session, plans);
  const surfaces = plans.map((plan) => buildCommandSurface(session, plan));
  const readiness = plans.map((plan) => buildReadinessProfile(session, plan));
  const board = buildPortfolioReadinessBoard(input.tenant, session, plans, readiness, surfaces);
  const commandSurfaceScore = surfaces.reduce((acc, surface) => acc + summarizeSurface(surface).average, 0) /
    Math.max(1, surfaces.length);
  const matrixRiskScore = plans
    .map((plan) => buildOrchestrationMatrix(session, plan).cycleRisk)
    .reduce((acc, value) => acc + value, 0) /
    Math.max(1, plans.length);

  return {
    workspace,
    commandSurfaceScore: Number(commandSurfaceScore.toFixed(4)),
    matrixRiskScore: Number(matrixRiskScore.toFixed(4)),
    recommendation: board.topRecommendation,
  };
};

export const useRecoveryOpsWorkspace = (input: RecoveryOpsWorkspaceInput): RecoveryOpsWorkspaceState => {
  const [tick, setTick] = useState(0);

  const state = useMemo(() => {
    const computed = buildState(input);
    return {
      workspaceId: computed.workspace.workspaceId,
      planCount: computed.workspace.plans.length,
      tenant: input.tenant,
      commandSurfaceScore: computed.commandSurfaceScore,
      matrixRiskScore: computed.matrixRiskScore,
      recommendation: computed.recommendation,
      signalDigest: summarizeSignalDigest(input.signals),
      ready: true,
    };
  }, [input, tick]);

  void (tick);

  return {
    ...state,
    refresh: () => setTick((current) => current + 1),
  };
};
