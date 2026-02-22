import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdaptiveOpsOrchestrator, type CommandInput, type CommandResult } from '@service/adaptive-ops-orchestrator';
import { RunForecast, HealthSnapshot } from '@domain/adaptive-ops-metrics';
import { UiActionRecord, UiPolicyRecord } from '../types';

export interface AdaptiveOpsForecastInput {
  tenantId: string;
  horizonMinutes: number;
  maxPoints: number;
}

export interface AdaptiveOpsForecastState {
  loadingForecast: boolean;
  loadingSummary: boolean;
  lastResult: CommandResult | null;
  forecast: RunForecast | null;
  historySummary: HealthSnapshot | null;
  trend: readonly UiPolicyRecord[];
  topForecastActions: readonly UiActionRecord[];
  errors: readonly string[];
}

const defaultForecastInput: AdaptiveOpsForecastInput = {
  tenantId: 'tenant-a',
  horizonMinutes: 60,
  maxPoints: 12,
};

const toActionRecords = (forecast: RunForecast | null): readonly UiActionRecord[] => {
  if (!forecast) return [];
  return forecast.points.map((point) => ({
    type: forecast.recommendation,
    intensity: point.confidence * 100,
    target: point.dominantPolicyId ?? 'global',
    justification: `${point.projectedRisk.toFixed(2)} risk · ${point.expectedRecoveryMinutes}m expected`,
  }));
};

const toTrend = (forecast: RunForecast | null): readonly UiPolicyRecord[] => {
  if (!forecast) return [];
  const byPolicy = new Map<string, number>();
  for (const point of forecast.points) {
    if (!point.dominantPolicyId) continue;
    byPolicy.set(point.dominantPolicyId, (byPolicy.get(point.dominantPolicyId) ?? 0) + point.projectedRisk);
  }

  return Array.from(byPolicy.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([policyId, score]) => ({
      policyId,
      tenantId: forecast.tenantId,
      confidence: Number(score.toFixed(2)),
    }));
};

export const useAdaptiveOpsForecast = (initialInput: AdaptiveOpsForecastInput = defaultForecastInput) => {
  const [input, setInput] = useState<AdaptiveOpsForecastInput>(initialInput);
  const [loadingForecast, setLoadingForecast] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [lastResult, setLastResult] = useState<CommandResult | null>(null);
  const [forecast, setForecast] = useState<RunForecast | null>(null);
  const [historySummary, setHistorySummary] = useState<HealthSnapshot | null>(null);
  const [errors, setErrors] = useState<readonly string[]>([]);

  const setHorizonMinutes = useCallback((horizonMinutes: number) => {
    setInput((current) => ({
      ...current,
      horizonMinutes: Math.max(15, Math.min(240, horizonMinutes)),
    }));
  }, []);

  const setMaxPoints = useCallback((maxPoints: number) => {
    setInput((current) => ({
      ...current,
      maxPoints: Math.max(3, Math.min(60, maxPoints)),
    }));
  }, []);

  const setTenant = useCallback((tenantId: string) => {
    setInput((current) => ({
      ...current,
      tenantId,
    }));
  }, []);

  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    const orchestrator = AdaptiveOpsOrchestrator.create();
    try {
      const simulated: CommandInput = {
        tenantId: input.tenantId,
        windowMs: 300_000,
        policies: [],
        signals: [],
        dryRun: true,
        maxActions: 5,
      };
      const summary = await orchestrator.summarize(simulated);
      if (summary.ok) {
        setHistorySummary(summary.value.profile);
      } else {
        setErrors((current) => [...current, summary.error]);
      }
    } catch (error) {
      setErrors((current) => [...current, error instanceof Error ? error.message : 'summary failed']);
    } finally {
      setLoadingSummary(false);
    }
  }, [input.tenantId]);

  const runForecast = useCallback(async () => {
    setLoadingForecast(true);
    const orchestrator = AdaptiveOpsOrchestrator.create();
    try {
      const runResult = await orchestrator.forecast({
        tenantId: input.tenantId,
        runId: `${input.tenantId}:${Date.now()}`,
        horizonMinutes: input.horizonMinutes,
        maxPoints: input.maxPoints,
      });

      if (runResult.ok) {
        setForecast(runResult.value);
      } else {
        setErrors((current) => [...current, runResult.error]);
      }
    } catch (error) {
      setErrors((current) => [...current, error instanceof Error ? error.message : 'forecast failed']);
    } finally {
      setLoadingForecast(false);
    }
  }, [input.tenantId, input.horizonMinutes, input.maxPoints]);

  const executeForecast = useCallback(async () => {
    setLoadingForecast(true);
    try {
      const orchestrator = AdaptiveOpsOrchestrator.create();
      const simulated: CommandInput = {
        tenantId: input.tenantId,
        windowMs: Math.max(30_000, input.horizonMinutes * 1000),
        policies: [],
        signals: [],
        dryRun: true,
        maxActions: input.maxPoints,
      };
      const result = await orchestrator.execute(simulated);
      setLastResult(result);
      if (!result.ok) {
        setErrors((current) => [...current, result.error ?? 'execution failed']);
      }
      await runForecast();
    } catch (error) {
      setErrors((current) => [...current, error instanceof Error ? error.message : 'execute failed']);
    } finally {
      setLoadingForecast(false);
    }
  }, [input.horizonMinutes, input.tenantId, input.maxPoints, runForecast]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const trend = useMemo(() => toTrend(forecast), [forecast]);
  const topForecastActions = useMemo(() => toActionRecords(forecast), [forecast]);

  const clearErrors = useCallback(() => setErrors([]), []);

  return {
    input,
    setTenant,
    setHorizonMinutes,
    setMaxPoints,
    executeForecast,
    loadSummary,
    runForecast,
    clearErrors,
    loadingForecast,
    loadingSummary,
    lastResult,
    forecast,
    historySummary,
    trend,
    topForecastActions,
    errors,
  };
};
