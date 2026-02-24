import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LatticeSignalEvent } from '@data/recovery-lattice-store';
import { asTenantId, asStreamId, asZoneId } from '@domain/recovery-lattice';
import {
  executeLatticePlan,
  inspectLatticeSignals,
  runLatticeIngestion,
  type LatticeExecutionContext,
  type LatticeExecutionResult,
} from '../services/latticeOrchestrationService';

export interface LatticeOrchestrationState {
  readonly loading: boolean;
  readonly hasData: boolean;
  readonly accepted: number;
  readonly rejected: number;
  readonly lastRunId: string;
  readonly lastAlertCount: number;
  readonly lastScore: number;
  readonly report: string;
}

export interface UseLatticeOrchestratorProps {
  readonly tenant: string;
  readonly streamId: string;
  readonly namespace: string;
}

const defaultState: LatticeOrchestrationState = {
  loading: false,
  hasData: false,
  accepted: 0,
  rejected: 0,
  lastRunId: '',
  lastAlertCount: 0,
  lastScore: 0,
  report: '',
};

const syntheticSignals = (streamId: string): LatticeSignalEvent[] => {
  const now = Date.now();
  const tenantId = asTenantId(`tenant://${streamId}`);
  const zoneId = asZoneId(`zone://${streamId}`);
  const brandedStreamId = asStreamId(streamId);
  return [
    {
      tenantId,
      zoneId,
      streamId: brandedStreamId,
      level: 'normal',
      score: 0.2,
      at: new Date(now).toISOString(),
      details: { index: 0, source: 'ui' },
    },
    {
      tenantId,
      zoneId,
      streamId: brandedStreamId,
      level: 'elevated',
      score: 0.6,
      at: new Date(now + 25).toISOString(),
      details: { index: 1, source: 'ui' },
    },
    {
      tenantId,
      zoneId,
      streamId: brandedStreamId,
      level: 'critical',
      score: 0.94,
      at: new Date(now + 50).toISOString(),
      details: { index: 2, source: 'ui' },
    },
  ];
};

export const useLatticeCommandOrchestrator = ({ tenant, streamId, namespace }: UseLatticeOrchestratorProps) => {
  const [state, setState] = useState<LatticeOrchestrationState>(defaultState);
  const [events, setEvents] = useState<readonly LatticeSignalEvent[]>([]);

  const run = useCallback(async (mode: LatticeExecutionContext['mode']) => {
    setState((current) => ({ ...current, loading: true }));
    try {
      const payload = {
        tenant,
        streamId,
        mode,
        namespace,
      };
      const result = await runLatticeIngestion(payload, {
        tenant,
        streamId,
        events: syntheticSignals(streamId),
      });
      setEvents(result && 'accepted' in result ? syntheticSignals(streamId) : []);
      setState((current) => ({
        ...current,
        loading: false,
        hasData: true,
        accepted: result.accepted,
        rejected: result.rejected,
        lastRunId: result.runId,
        lastAlertCount: result.alerts.length,
        lastScore: result.alerts.length / Math.max(1, result.accepted),
        report: result.report,
      }));
      return result;
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
      }));
      throw error;
    }
  }, [tenant, streamId, namespace]);

  const load = useCallback(async () => {
    const snapshot = await inspectLatticeSignals({
      tenantId: asTenantId(tenant),
      streamId: asStreamId(streamId),
    });
    setState((current) => ({
      ...current,
      loading: false,
      lastScore: snapshot.envelope.average,
      report: `envelope:${snapshot.envelope.levels.join('|')}`,
      hasData: snapshot.audits.length > 0,
      lastRunId: `load:${streamId}`,
    }));
    return snapshot;
  }, [streamId, tenant]);

  const executeAndLoad = useCallback(async (mode: LatticeExecutionContext['mode']) => {
    const result = await run(mode);
    const details = await load();
    return {
      result,
      summary: `${details.envelope.streamId}:${details.envelope.latest}`,
    };
  }, [load, run]);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo(() => {
    const acceptanceRate = state.accepted + state.rejected > 0
      ? state.accepted / (state.accepted + state.rejected)
      : 0;
    return {
      acceptanceRate,
      alertDensity: state.lastAlertCount,
      risk: events.length ? events.reduce((acc, event) => acc + event.score, 0) / events.length : 0,
      hasCritical: events.some((event) => event.level === 'critical'),
    };
  }, [state.accepted, state.rejected, state.lastAlertCount, events]);

  return {
    state,
    events,
    metrics,
    run,
    load,
    executeAndLoad,
  };
};
