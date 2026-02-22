import type { RecoveryOperationsEnvelope, RecoverySignal } from '@domain/recovery-operations-models';
import type { CandidateRoute, RouteDraft } from '@domain/recovery-operations-models/route-intelligence';
import type { RecoveryConstraintBudget } from '@domain/recovery-operations-models/types';
import { withBrand } from '@shared/core';
import { InMemoryRecoveryOperationsRepository } from './repository';
import type { RecoveryOperationsRepository } from './repository';
import type { RunSessionRecord } from './models';
import { buildSignalPortfolio } from '@domain/recovery-operations-models/signal-portfolio';
import { draftRoutes, routeCoverageByIntent } from '@domain/recovery-operations-models/route-intelligence';
import type { PolicyEvaluation } from '@domain/recovery-operations-models/recovery-policy-rules';

export interface LiveRouteCommand {
  readonly tenant: string;
  readonly envelopes: readonly RecoveryOperationsEnvelope<RecoverySignal>[];
  readonly policy: PolicyEvaluation;
}

export interface LiveRouteState {
  readonly tenant: string;
  readonly routeSet: readonly CandidateRoute[];
  readonly routeIntentTotals: Record<'observe' | 'stabilize' | 'mitigate', number>;
  readonly budget: RecoveryConstraintBudget;
  readonly createdAt: string;
}

const tenantSignals = (tenant: string, envelopes: readonly RecoveryOperationsEnvelope<RecoverySignal>[]): readonly RecoverySignal[] => {
  return envelopes.filter((entry) => entry.tenant === tenant).map((entry) => entry.payload);
};

const buildBudget = (tenant: string, envelopes: readonly RecoveryOperationsEnvelope<RecoverySignal>[]): RecoveryConstraintBudget => {
  const signals = tenantSignals(tenant, envelopes);
  const portfolio = buildSignalPortfolio(tenant, signals);
  const base = portfolio.averageSeverity > 8 ? 2 : portfolio.averageSeverity > 5 ? 4 : 8;

  return {
    maxParallelism: Math.max(1, Math.round(base)),
    maxRetries: Math.max(1, Math.round(8 - base)),
    timeoutMinutes: Math.max(15, Math.round(portfolio.averageSeverity * 10)),
    operatorApprovalRequired: portfolio.averageSeverity > 7,
  };
};

export const buildRouteDraft = (input: LiveRouteCommand): RouteDraft => {
  return draftRoutes({
    tenant: input.tenant,
    readinessPlan: {
      planId: 'plan' as any,
      runId: 'run' as any,
      title: 'Runtime route plan',
      objective: 'stabilize',
      state: 'active',
      createdAt: new Date().toISOString(),
      targets: [],
      windows: [],
      signals: [],
      riskBand: 'green',
      metadata: { owner: 'ops', tags: ['generated'] },
    },
    envelopes: input.envelopes,
    policy: input.policy,
  });
};

export const buildRouteState = (command: LiveRouteCommand): LiveRouteState => {
  const routes = buildRouteDraft(command).routeSet;
  return {
    tenant: command.tenant,
    routeSet: routes,
    routeIntentTotals: routeCoverageByIntent(routes),
    budget: buildBudget(command.tenant, command.envelopes),
    createdAt: new Date().toISOString(),
  };
};

export const writeRoutesToRepository = async (
  repository: RecoveryOperationsRepository,
  state: LiveRouteState,
  envelopes: readonly RecoveryOperationsEnvelope<RecoverySignal>[],
): Promise<void> => {
  for (const route of state.routeSet) {
    await repository.upsertSession({
      id: withBrand(route.routeId, 'RunSessionId'),
      runId: withBrand(route.runId, 'RecoveryRunId'),
      ticketId: withBrand(`${state.tenant}:${route.signalId}`, 'RunTicketId'),
      planId: withBrand(`${state.tenant}:plan`, 'RunPlanId'),
      status: 'running',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      constraints: state.budget,
      signals: tenantSignals(state.tenant, envelopes),
    });
  }
};

export const createInMemoryRouteRepository = (): RecoveryOperationsRepository => new InMemoryRecoveryOperationsRepository();

export const routeStateProbe = async (): Promise<LiveRouteState> => {
  const repo: RecoveryOperationsRepository = new InMemoryRecoveryOperationsRepository();
  const snapshot = await repo.loadLatestSnapshot('global');

  const envelopes = snapshot?.sessions.flatMap((session: RunSessionRecord) =>
    session.signals.map((signal: RecoverySignal) => ({
      eventId: withBrand(`${session.id}:${signal.id}`, 'RecoveryRouteKey'),
      tenant: withBrand(snapshot.tenant, 'TenantId'),
      payload: signal,
      createdAt: new Date().toISOString(),
    })),
  );


  return buildRouteState({
    tenant: 'global',
    envelopes: envelopes ?? [],
    policy: {
      tenant: 'global',
      policy: {
        id: withBrand('global-policy', 'RecoveryPolicyId'),
        tenant: 'global',
        enforceManualApproval: false,
        budget: {
          maxParallelism: 4,
          maxRetries: 2,
          timeoutMinutes: 30,
          operatorApprovalRequired: false,
        },
        priorities: ['normal'],
        sourceSignals: [],
        rationale: 'initial',
      },
      factors: [],
      decision: 'allow',
      confidence: 1,
      createdAt: new Date().toISOString(),
    },
  });
};
