import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  createContinuityLensOrchestrator,
  type ContinuityIngestionBatch,
  type ForecastInput,
  type OrchestratorCommands,
} from '@service/recovery-continuity-lens';
import type { ContinuityWorkspace, ContinuityWorkspaceSummary } from '@domain/continuity-lens';
import { withBrand } from '@shared/core';
import {
  canonicalSignalId,
  type ContinuitySignal,
  normalizeSignalEnvelope,
} from '@domain/continuity-lens';
import { z } from 'zod';

const seedSignal = (tenantId: string): ContinuitySignal => {
  const envelope = normalizeSignalEnvelope({
    tenantId,
    zone: 'us-east-1',
    service: 'control-plane',
    component: 'continuity-sensor',
    state: 'detected',
    title: 'Seeded continuity drift',
    description: 'Synthetic signal for lens warm-up',
    severity: 48,
    risk: 'medium',
    scope: 'service',
    tags: ['seed', 'continuity-lens'],
    reportedAt: new Date().toISOString(),
    dimensions: [{ dimension: 'service', key: 'tier', value: 'core' }],
    metrics: [
      { metricName: 'availability', value: 99.2, unit: '%', source: 'mock', observedAt: new Date().toISOString() },
    ],
  });

  return {
    id: withBrand(canonicalSignalId(tenantId, 'control-plane', `${Date.now()}`), 'ContinuitySignalId'),
    tenantId: withBrand(tenantId, 'ContinuityTenantId'),
    zone: envelope.zone,
    service: withBrand(envelope.service, 'ContinuityServiceId'),
    component: withBrand(envelope.component, 'ContinuityComponentId'),
    state: envelope.state,
    title: envelope.title,
    description: envelope.description,
    severity: envelope.severity,
    risk: envelope.risk,
    scope: envelope.scope,
    tags: envelope.tags,
    reportedAt: envelope.reportedAt,
    dimensions: envelope.dimensions,
    metrics: envelope.metrics,
  };
};

const tenantSchema = z.object({
  tenantId: z.string().min(1),
});

export interface UseRecoveryContinuityLensParams {
  readonly tenantId: string;
}

export interface UseRecoveryContinuityLensState {
  readonly tenantId: string;
  readonly workspace?: ContinuityWorkspace;
  readonly summary?: ContinuityWorkspaceSummary;
  readonly running: boolean;
  readonly error?: string;
  readonly forecastTrend?: string;
  readonly signalCount: number;
}

export interface UseRecoveryContinuityLensActions {
  refreshWorkspace: () => Promise<void>;
  ingestSeedSignals: () => Promise<void>;
  forecast: (minutes: number) => Promise<void>;
  reset: () => void;
}

export const useRecoveryContinuityLens = ({ tenantId }: UseRecoveryContinuityLensParams): UseRecoveryContinuityLensState & UseRecoveryContinuityLensActions => {
  const [tenant] = useState(withBrand(tenantSchema.parse({ tenantId }).tenantId, 'ContinuityTenantId'));
  const [orchestrator, setOrchestrator] = useState<OrchestratorCommands | undefined>(undefined);
  const [workspace, setWorkspace] = useState<ContinuityWorkspace | undefined>(undefined);
  const [summary, setSummary] = useState<ContinuityWorkspaceSummary | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [forecastTrend, setForecastTrend] = useState<string | undefined>(undefined);
  const signalSeed = useMemo(() => Array.from({ length: 12 }, (_, index) => seedSignal(`${tenant}-${index}`)), [tenant]);

  useEffect(() => {
    const created = createContinuityLensOrchestrator(tenant);
    if (!created.ok) {
      setError(created.error.message);
      return;
    }
    setOrchestrator(created.value);
    void created.value.loadDefaults();
  }, [tenant]);

  const refreshWorkspace = useCallback(async () => {
    if (!orchestrator) return;
    setRunning(true);
    setError(undefined);
    const current = await orchestrator.workspace();
    if (!current.ok) {
      setError(current.error.message);
      setRunning(false);
      return;
    }
    setWorkspace(current.value);
    setSummary({
      tenantId: tenant,
      windowId: current.value.snapshot.id as string,
      riskScore: current.value.snapshot.riskScore,
      signalCount: current.value.snapshot.signals.length,
      hasForecast: Boolean(current.value.forecast),
    });
    setRunning(false);
  }, [orchestrator, tenant]);

  const ingestSeedSignals = useCallback(async () => {
    if (!orchestrator) return;
    setRunning(true);
    setError(undefined);
    const batch: ContinuityIngestionBatch = {
      tenantId: tenant,
      signals: signalSeed,
    };
    const result = await orchestrator.ingestBatch(batch);
    if (!result.ok) {
      setError(result.error.message);
      setRunning(false);
      return;
    }
    setWorkspace(result.value.workspace);
    setSummary({
      tenantId: tenant,
      windowId: result.value.runId as unknown as string,
      riskScore: result.value.workspace.snapshot.riskScore,
      signalCount: result.value.workspace.snapshot.signals.length,
      hasForecast: false,
    });
    setRunning(false);
  }, [orchestrator, tenant, signalSeed]);

  const forecast = useCallback(
    async (minutes: number) => {
      if (!orchestrator) return;
      setRunning(true);
      const input: ForecastInput = {
        tenantId: tenant,
        horizonMinutes: minutes,
        maxSignals: 200,
        includeResolved: true,
      };
      const result = await orchestrator.forecast(input);
      if (!result.ok) {
        setError(result.error.message);
        setRunning(false);
        return;
      }
      setForecastTrend(result.value.trend);
      setError(undefined);
      setRunning(false);
    },
    [orchestrator, tenant],
  );

  const reset = useCallback(() => {
    setWorkspace(undefined);
    setSummary(undefined);
    setForecastTrend(undefined);
    setError(undefined);
    void orchestrator?.resetWorkspace();
  }, [orchestrator, tenant]);

  useEffect(() => {
    if (!orchestrator) return;
    void refreshWorkspace();
  }, [orchestrator, refreshWorkspace]);

  return {
    tenantId: tenantId,
    workspace,
    summary,
    running,
    error,
    forecastTrend,
    signalCount: signalSeed.length,
    refreshWorkspace,
    ingestSeedSignals,
    forecast,
    reset,
  };
};
