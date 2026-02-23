import { useCallback, useEffect, useMemo, useState } from 'react';
import { runMeshPipeline, type CommandNetworkSnapshot, type RuntimeIntent, type RoutingDecision } from '@domain/recovery-command-network';
import { evaluateHealth } from '../services/healthStore';
import { buildDraftWindows, projectTimeline } from '../services/meshPlanPlanner';

export interface EngineState {
  readonly loading: boolean;
  readonly error: string | null;
  readonly snapshot: CommandNetworkSnapshot | null;
  readonly decisions: readonly RoutingDecision[];
  readonly confidence: number;
  readonly timeline: readonly { at: string; label: string; load: number; urgencyScore: number }[];
}

export const useCommandNetworkEngine = (snapshot: CommandNetworkSnapshot | null, intents: readonly RuntimeIntent[]) => {
  const [state, setState] = useState<EngineState>({
    loading: false,
    error: null,
    snapshot: null,
    decisions: [],
    confidence: 0,
    timeline: [],
  });

  const health = useMemo(() => (snapshot ? evaluateHealth(snapshot) : null), [snapshot]);

  const run = useCallback(async () => {
    if (!snapshot) {
      return;
    }
    setState((current) => ({ ...current, loading: true }));

    try {
      const result = runMeshPipeline(snapshot, intents);
      const draft = buildDraftWindows(snapshot, intents);
      const timeline = projectTimeline(snapshot, draft);
      setState({
        loading: false,
        error: result.warnings.length > 0 ? result.warnings.join(' | ') : null,
        snapshot,
        decisions: result.decisions,
        confidence: result.envelope.confidence,
        timeline,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : 'engine failed',
      }));
    }
  }, [snapshot, intents]);

  useEffect(() => {
    void run();
  }, [run]);

  return {
    state,
    health,
    refresh: run,
    isHealthy: state.error === null && health?.status !== 'degraded',
  };
};
