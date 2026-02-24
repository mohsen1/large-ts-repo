import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FulfillmentEntityRef,
  FulfillmentDashboardFilter,
} from '../types';
import {
  createFulfillmentIntelligenceOrchestrator,
  OrchestrationRequest,
  OrchestrationResult,
} from '@service/fulfillment-intelligence-orchestrator';
import { DemandSignal } from '@domain/fulfillment-orchestration-analytics';

export interface UseFulfillmentIntelligenceState {
  loading: boolean;
  lastRun?: OrchestrationResult;
  error?: string;
  signals: readonly DemandSignal[];
}

const DEFAULT_MINUTES = 120;

export const useFulfillmentIntelligence = (tenantId: string, filter: FulfillmentDashboardFilter) => {
  const [state, setState] = useState<UseFulfillmentIntelligenceState>({
    loading: false,
    signals: [],
  });

  const orchestrator = useMemo(() => createFulfillmentIntelligenceOrchestrator(), []);

  const run = useCallback(async (request: Omit<OrchestrationRequest, 'tenantId'>) => {
    setState((prev) => ({ ...prev, loading: true, error: undefined }));
    const requestSignals = request.signals ?? sampleSignals(tenantId, request.productId, filter.horizonMinutes || DEFAULT_MINUTES);
    const targetSla = request.targetSla ?? filter.minConfidence;
    const payload: OrchestrationRequest = {
      tenantId,
      productId: request.productId,
      signals: requestSignals,
      windows: request.windows,
      targetSla,
    };

    const result = await orchestrator.run(payload);
    if (!result.ok) {
      setState((previous) => ({
        loading: false,
        error: result.error.message,
        lastRun: previous.lastRun,
        signals: requestSignals,
      }));
      return result;
    }

    setState({
      loading: false,
      lastRun: result.value,
      error: undefined,
      signals: requestSignals,
    });
    return result;
  }, [tenantId, filter.horizonMinutes, filter.minConfidence, orchestrator]);

  useEffect(() => {
    const initialSignals = sampleSignals(tenantId, filter.productId ?? 'default', filter.horizonMinutes || DEFAULT_MINUTES);
    void run({
      productId: filter.productId ?? 'default',
      signals: initialSignals,
      windows: new Array(Math.max(1, Math.ceil((filter.horizonMinutes || DEFAULT_MINUTES) / 15)))
        .fill(0)
        .map((_, index) => ({
          slotStart: new Date(Date.now() + index * 900_000).toISOString(),
          slotEnd: new Date(Date.now() + (index + 1) * 900_000).toISOString(),
          forecastUnits: 0,
          demandVariance: 0,
          backlogRisk: 0,
          confidence: 0,
        })),
      targetSla: filter.minConfidence,
    });
  }, [tenantId, filter.productId, filter.horizonMinutes, run, filter.minConfidence]);

  return useMemo(() => ({ ...state, run }), [state, run]);
};

const sampleSignals = (tenantId: string, productId: string, points: number): readonly DemandSignal[] => {
  return new Array(points).fill(0).map((_, index) => ({
    tenantId,
    productId,
    sku: `sku-${index}`,
    baseDemand: 20 + index,
    observedDemand: 18 + index * 1.15,
    seasonalFactor: 0.85 + (index % 8) / 20,
    confidence: Math.min(0.99, 0.45 + index / 50),
    sampleWindowStart: new Date(Date.now() + index * 60_000).toISOString(),
    sampleWindowEnd: new Date(Date.now() + (index + 1) * 60_000).toISOString(),
    source: index % 4 === 0 ? 'inventory' : 'sales',
  }));
};

export const useFulfillmentEntity = (tenantId: string, entityId: string): FulfillmentEntityRef => {
  return useMemo(() => ({ tenantId, entityId }), [tenantId, entityId]);
};
