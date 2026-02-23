import { useEffect, useMemo, useState } from 'react';

import { SignalStore } from '@data/recovery-signal-intelligence-store';
import {
  type SignalBundle,
  type SignalDimension,
  type SignalFeedSnapshot,
  type SignalPlan,
} from '@domain/recovery-signal-intelligence';
import { createSignalOrchestrator } from '@service/recovery-signal-intelligence-orchestrator';

export interface UseRecoverySignalIntelligenceParams {
  facilityId: string;
  tenantId: string;
}

interface UseRecoverySignalIntelligenceResult {
  loading: boolean;
  error: string | null;
  snapshot: SignalFeedSnapshot | null;
  plan: SignalPlan | null;
  commandsQueued: number;
  refresh: () => Promise<void>;
  runPlan: (actor: string) => void;
}

const dimensions: SignalDimension[] = [
  'capacity',
  'latency',
  'reachability',
  'integrity',
  'availability',
  'cost',
  'compliance',
];

const syntheticPulse = (facilityId: string, tenantId: string, index: number): SignalBundle['pulses'][number] => ({
  id: `pulse-${tenantId}-${facilityId}-${index}`,
  category: index % 5 === 0 ? 'incident' : 'readiness',
  tenantId,
  facilityId,
  dimension: dimensions[index % dimensions.length],
  value: 82 + index,
  baseline: 70 + (index % 3),
  weight: 0.45 + ((index % 5) * 0.1),
  timestamp: new Date(Date.now() - index * 60_000).toISOString(),
  observedAt: new Date().toISOString(),
  source: 'telemetry',
  unit: 'ratio',
  tags: ['tenant-bound', 'facility', facilityId],
});

export const useRecoverySignalIntelligence = ({
  facilityId,
  tenantId,
}: UseRecoverySignalIntelligenceParams): UseRecoverySignalIntelligenceResult => {
  const store = useMemo(() => new SignalStore(), []);
  const orchestrator = useMemo(() => createSignalOrchestrator(store), [store]);
  const [snapshot, setSnapshot] = useState<SignalFeedSnapshot | null>(null);
  const [plan, setPlan] = useState<SignalPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commandsQueued, setCommandsQueued] = useState(0);

  const makeBundle = (): SignalBundle => ({
    id: `${tenantId}-${facilityId}`,
    tenantId,
    pulses: Array.from({ length: 14 }, (_, index) => syntheticPulse(facilityId, tenantId, index)),
    envelopes: [],
    generatedBy: 'console-harness',
    generatedAt: new Date().toISOString(),
  });

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const bundle = makeBundle();
      const nextSnapshot = await orchestrator.ingestBundle(bundle);
      const nextPlan = orchestrator.createPlanForBundle(bundle.id);
      setSnapshot(nextSnapshot);
      setPlan(nextPlan);
      setCommandsQueued(store.listCommands().length);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load signal intelligence');
    } finally {
      setLoading(false);
    }
  };

  const runPlan = (actor: string) => {
    if (!plan) {
      return;
    }
    try {
      orchestrator.enqueueCommand(plan, actor);
      setCommandsQueued((count) => count + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to queue command');
    }
  };

  useEffect(() => {
    void refresh();
  }, [facilityId, tenantId]);

  return {
    loading,
    error,
    snapshot,
    plan,
    commandsQueued,
    refresh,
    runPlan,
  };
};
