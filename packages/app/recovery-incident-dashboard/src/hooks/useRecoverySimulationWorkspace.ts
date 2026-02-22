import { useCallback, useEffect, useMemo, useState } from 'react';
import { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import {
  summarizeSimulationQuery,
  buildResolutionProjections,
  buildSimulationEnvelope,
  forecastFromRuns,
} from '@data/recovery-incident-store';

export interface SimulationWorkspaceState {
  readonly loading: boolean;
  readonly active: boolean;
  readonly envelopeText: string;
  readonly topIncident: string;
  readonly totalRuns: number;
  readonly totalProjections: number;
  readonly confidence: number;
}

export interface SimulationWorkspaceActions {
  readonly refresh: () => Promise<void>;
}

export const useRecoverySimulationWorkspace = (repository: RecoveryIncidentRepository) => {
  const [state, setState] = useState<SimulationWorkspaceState>({
    loading: false,
    active: false,
    envelopeText: '',
    topIncident: 'none',
    totalRuns: 0,
    totalProjections: 0,
    confidence: 0,
  });

  const refresh = useCallback(async () => {
    setState((previous) => ({ ...previous, loading: true, active: true }));
    const snapshot = repository.snapshot();
    const incidents = (await snapshot).incidents.map((entry) => entry.incident);
    const plans = (await snapshot).plans.map((entry) => entry.plan);
    const runs = (await snapshot).runs.map((entry) => entry.run);
    const query = summarizeSimulationQuery({ total: incidents.length, data: incidents });
    const envelope = buildSimulationEnvelope(incidents, plans, runs);
    const projections = buildResolutionProjections(incidents, (await snapshot).plans);
    const forecast = forecastFromRuns(runs);
    const topIncident = forecast[0]?.incidentId ?? 'none';
    const confidence = Number((envelope.successRate / Math.max(1, envelope.total)).toFixed(4));
    setState({
      loading: false,
      active: true,
      envelopeText: `${query} | total=${envelope.total}`,
      topIncident,
      totalRuns: runs.length,
      totalProjections: projections.length,
      confidence,
    });
  }, [repository]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    state,
    actions: { refresh } as SimulationWorkspaceActions,
    score: useMemo(() => ({
      confidence: state.confidence,
      active: state.active,
    }), [state.confidence, state.active]),
  };
};
