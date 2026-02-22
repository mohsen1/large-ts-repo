import { useCallback, useMemo, useState } from 'react';
import { withBrand } from '@shared/core';
import { runRecoveryPolicyOrchestrator } from '@service/recovery-operations-engine';
import { InMemoryRecoveryOperationsRepository } from '@data/recovery-operations-store';
import {
  buildSignalEnvelope,
  buildSignalPortfolio,
} from '@domain/recovery-operations-models';
import type { RecoveryOperationsEnvelope, RecoverySignal } from '@domain/recovery-operations-models';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import type { RankedSignalPortfolios } from '@domain/recovery-operations-models/signal-portfolio';

export interface UseRecoveryOperationsIntelligenceResult {
  readonly selectedTenant: string;
  readonly signalCount: number;
  readonly portfolios: readonly string[];
  readonly routeSummary: string | undefined;
  readonly timelineSummary: string | undefined;
  readonly busy: boolean;
  readonly error?: string;
  readonly execute: () => Promise<void>;
  readonly ingestSignals: (tenant: string, rawSignals: unknown[]) => void;
  readonly clear: () => void;
}

const formatPortfolioSummary = (portfolio: RankedSignalPortfolios): string =>
  `top=${portfolio.topSource} severity=${portfolio.averageSeverity} confidence=${portfolio.averageConfidence}`;

const fakeReadinessPlan: RecoveryReadinessPlan = {
  planId: withBrand('plan:ops:readiness', 'RecoveryReadinessPlanId'),
  runId: withBrand('readiness-run', 'ReadinessRunId'),
  title: 'Recovery operations readiness',
  objective: 'stability',
  state: 'active',
  createdAt: new Date().toISOString(),
  targets: [],
  windows: [],
  signals: [],
  riskBand: 'green',
  metadata: {
    owner: 'ops-console',
    tags: ['recovery', 'simulation'],
    tenant: 'global',
  },
};

export const useRecoveryOperationsIntelligence = (): UseRecoveryOperationsIntelligenceResult => {
  const [tenant, setTenant] = useState('global');
  const [envelopes, setEnvelopes] = useState<readonly RecoveryOperationsEnvelope<RecoverySignal>[]>([]);
  const [routeSummary, setRouteSummary] = useState<string | undefined>(undefined);
  const [timelineSummary, setTimelineSummary] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const ingestSignals = useCallback((selectedTenant: string, rawSignals: unknown[]) => {
    const parsedSignals: RecoveryOperationsEnvelope<RecoverySignal>[] = [];

    rawSignals.forEach((signal, index) => {
      try {
        const parsed = buildSignalEnvelope(selectedTenant, `route-${index}`, signal);
        parsedSignals.push({
          eventId: withBrand(`${selectedTenant}:${index}`, 'RecoveryRouteKey'),
          tenant: withBrand(selectedTenant, 'TenantId'),
          payload: parsed.signal,
          createdAt: new Date().toISOString(),
        });
      } catch {
        // ignore malformed inputs
      }
    });

    setTenant(selectedTenant);
    setEnvelopes((existing) => [...parsedSignals, ...existing].slice(0, 60));
  }, []);

  const clear = useCallback(() => {
    setEnvelopes([]);
    setRouteSummary(undefined);
    setTimelineSummary(undefined);
    setError(undefined);
  }, []);

  const execute = useCallback(async () => {
    setBusy(true);
    setError(undefined);

    try {
      const repository = new InMemoryRecoveryOperationsRepository();
      const tenantSignals = envelopes.filter((entry) => entry.tenant === withBrand(tenant, 'TenantId'));
      const portfolio = buildSignalPortfolio(tenant, tenantSignals.map((entry) => entry.payload));

      const orchestratorResult = await runRecoveryPolicyOrchestrator(
        repository,
        tenant,
        fakeReadinessPlan,
        tenantSignals,
      );

      setRouteSummary(`routes=${orchestratorResult.routeCount} decision=${orchestratorResult.policy.decision}`);
      setTimelineSummary(orchestratorResult.timelineSummary);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Execution error');
    } finally {
      setBusy(false);
    }
  }, [tenant, envelopes]);

  const portfolios = useMemo(() => {
    const tenantSignals = envelopes
      .filter((entry) => entry.tenant === withBrand(tenant, 'TenantId'))
      .map((entry) => entry.payload);
    const portfolio = buildSignalPortfolio(tenant, tenantSignals);
    return [formatPortfolioSummary(portfolio)];
  }, [tenant, envelopes]);

  return useMemo(
    () => ({
      selectedTenant: tenant,
      signalCount: envelopes.length,
      portfolios,
      routeSummary,
      timelineSummary,
      busy,
      error,
      execute,
      ingestSignals,
      clear,
    }),
    [tenant, envelopes.length, portfolios, routeSummary, timelineSummary, busy, error, execute, ingestSignals, clear],
  );
};
