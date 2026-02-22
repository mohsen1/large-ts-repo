import { useCallback, useMemo, useState } from 'react';
import { withBrand } from '@shared/core';
import { InMemoryRecoveryOperationsRepository } from '@data/recovery-operations-store';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import { buildSignalEnvelope } from '@domain/recovery-operations-models';
import type { RecoveryOperationsEnvelope, RecoverySignal, RunSession, RunPlanSnapshot } from '@domain/recovery-operations-models';
import { buildReadinessSnapshot } from '@domain/recovery-operations-models/operations-readiness';
import { buildAndRunCommandBridge, inspectCommandWindow, type OperationCommandRequest } from '@service/recovery-operations-engine/command-bridge';

interface WorkspaceState {
  readonly tenant: string;
  readonly readinessPlan: RecoveryReadinessPlan;
  readonly commandRequests: readonly string[];
  readonly busy: boolean;
  readonly lastSummary: string;
  readonly lastForecast: string;
  readonly lastAnalytics: string;
  readonly lastGraph: string;
  readonly error?: string;
}

const defaultReadinessPlan: RecoveryReadinessPlan = {
  planId: withBrand('ops:console:readiness', 'RecoveryReadinessPlanId'),
  runId: withBrand('ops-console-run', 'ReadinessRunId'),
  title: 'Recovery command center readiness',
  objective: 'stability',
  state: 'active',
  createdAt: new Date().toISOString(),
  targets: [],
  windows: [],
  signals: [],
  riskBand: 'green',
  metadata: {
    owner: 'recovery-console',
    tags: ['ui', 'command-center'],
    tenant: 'global',
  },
};

const toSeedSignals = (rawSignals: readonly RecoveryOperationsEnvelope<RecoverySignal>[]): readonly RecoverySignal[] =>
  rawSignals.map((entry) => entry.payload);

const buildSession = (tenant: string, signals: readonly RecoverySignal[]): RunSession => ({
  id: withBrand(`${tenant}:session`, 'RunSessionId'),
  runId: withBrand(`${tenant}:run`, 'RecoveryRunId'),
  ticketId: withBrand(`${tenant}:ticket`, 'RunTicketId'),
  planId: withBrand(`${tenant}:plan`, 'RunPlanId'),
  status: 'running',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  constraints: {
    maxParallelism: 2,
    maxRetries: 2,
    timeoutMinutes: 30,
    operatorApprovalRequired: false,
  },
  signals: [...signals],
});

const buildPlan = (tenant: string): RunPlanSnapshot => ({
  id: withBrand(`${tenant}:plan`, 'RunPlanId'),
  name: `Plan for ${tenant}`,
  constraints: {
    maxParallelism: 2,
    maxRetries: 3,
    timeoutMinutes: 45,
    operatorApprovalRequired: false,
  },
  fingerprint: {
    tenant: withBrand(tenant, 'TenantId'),
    region: 'global',
    serviceFamily: 'recovery-console',
    impactClass: 'application',
    estimatedRecoveryMinutes: 15,
  },
  sourceSessionId: withBrand(`${tenant}:session`, 'RunSessionId'),
  effectiveAt: new Date().toISOString(),
  program: {
    id: withBrand(`${tenant}:program`, 'RecoveryProgramId'),
    tenant: withBrand(tenant, 'TenantId'),
    service: withBrand('recovery-console', 'ServiceId'),
    name: `program-${tenant}`,
    description: 'recovery operations console program',
    priority: 'gold',
    mode: 'restorative',
    window: {
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 45 * 60_000).toISOString(),
      timezone: 'UTC',
    },
    topology: {
      rootServices: ['recovery-console'],
      fallbackServices: ['recovery-console-fallback'],
      immutableDependencies: [['recovery-console', 'db']],
    },
    constraints: [],
    steps: [],
    owner: 'recovery-console',
    tags: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
});

export const useRecoveryOperationsCommandCenter = () => {
  const [tenant] = useState('global');
  const [envelopes, setEnvelopes] = useState<readonly RecoveryOperationsEnvelope<RecoverySignal>[]>([]);
  const [busy, setBusy] = useState(false);
  const [commandRequests, setCommandRequests] = useState<readonly string[]>([]);
  const [lastSummary, setLastSummary] = useState('');
  const [lastForecast, setLastForecast] = useState('');
  const [lastAnalytics, setLastAnalytics] = useState('');
  const [lastGraph, setLastGraph] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const clear = useCallback(() => {
    setEnvelopes([]);
    setCommandRequests([]);
    setLastSummary('');
    setLastForecast('');
    setLastAnalytics('');
    setLastGraph('');
    setError(undefined);
  }, []);

  const ingest = useCallback((rawSignals: unknown[]) => {
    const parsedSignals = (rawSignals as unknown[])
      .map((rawSignal, index) => {
        try {
          const parsed = buildSignalEnvelope(tenant, `op-${tenant}-${index}`, rawSignal);
          const signal = parsed.signal;
          return {
            eventId: withBrand(`${tenant}:${index}:${Date.now()}`, 'RecoveryRouteKey'),
            tenant: withBrand(tenant, 'TenantId'),
            payload: {
              ...signal,
              id: String(signal.id),
              detectedAt: new Date().toISOString(),
            },
            createdAt: new Date().toISOString(),
          } as RecoveryOperationsEnvelope<RecoverySignal>;
        } catch {
          return undefined;
        }
      })
      .filter((entry): entry is RecoveryOperationsEnvelope<RecoverySignal> => Boolean(entry));

    setEnvelopes((existing) => [...parsedSignals, ...existing].slice(0, 60));
  }, [tenant]);

  const runCommandCenter = useCallback(async () => {
    setBusy(true);
    setError(undefined);

    try {
      const repository = new InMemoryRecoveryOperationsRepository();
      const signals = toSeedSignals(envelopes);
      const session = buildSession(tenant, signals);
      const snapshot = buildPlan(tenant);
      const readiness = buildReadinessSnapshot(tenant, session, snapshot, defaultReadinessPlan);

      const request: Omit<OperationCommandRequest, 'repository'> = {
        tenant,
        readinessPlan: {
          ...defaultReadinessPlan,
          riskBand: readiness.projection === 'critical' ? 'red' : readiness.projection === 'degrading' ? 'amber' : 'green',
        },
        session,
        snapshot: {
          id: String(snapshot.id),
          program: snapshot.program,
        },
        signals,
      };

      const result = await buildAndRunCommandBridge(repository, request);
      const trend = await inspectCommandWindow(repository, tenant, String(session.runId));

      setCommandRequests((previous) => [...previous, `run:${session.id}`, `trend:${trend.acceptanceRate.toFixed(2)}`]);
      setLastSummary(result.centerSummary);
      setLastForecast(result.forecast);
      setLastAnalytics(result.analyticsSummary);
      setLastGraph(result.commandGraph);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to execute command center');
    } finally {
      setBusy(false);
    }
  }, [tenant, envelopes]);

  const state: WorkspaceState = useMemo(
    () => ({
      tenant,
      readinessPlan: defaultReadinessPlan,
      commandRequests,
      busy,
      lastSummary,
      lastForecast,
      lastAnalytics,
      lastGraph,
      error,
    }),
    [tenant, commandRequests, busy, lastSummary, lastForecast, lastAnalytics, lastGraph, error],
  );

  return {
    state,
    ingest,
    clear,
    runCommandCenter,
    signalCount: envelopes.length,
  };
};
