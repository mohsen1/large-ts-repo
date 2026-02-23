import { useEffect, useState } from 'react';
import { PlanId, SignalDigest, SignalSeverity } from '@domain/recovery-cockpit-models';
import { InMemoryCockpitStore } from '@data/recovery-cockpit-store';
import { toTimestamp } from '@domain/recovery-cockpit-models';

export type CockpitSignalState = {
  digest: SignalDigest;
  fetchSignalWindow: (planId: PlanId, limit?: number) => Promise<void>;
  muted: ReadonlySet<SignalSeverity>;
};

export const useCockpitSignals = (store: InMemoryCockpitStore, planId: PlanId): CockpitSignalState => {
  const [digest, setDigest] = useState<SignalDigest>({
    timestamp: toTimestamp(new Date()),
    activeCount: 0,
    criticalCount: 0,
    mutedCount: 0,
    signals: [],
  });
  const [muted, setMuted] = useState(new Set<SignalSeverity>(['info']));

  const fetchSignalWindow = async (targetPlanId: PlanId, limit = 20) => {
    const events = await store.getEvents(targetPlanId, limit);
    const digestState: SignalDigest = {
      timestamp: toTimestamp(new Date()),
      activeCount: events.length,
      criticalCount: events.filter((event) => event.status === 'failed').length,
      mutedCount: muted.size,
      signals: events,
    };
    setDigest(digestState);
  };

  useEffect(() => {
    void fetchSignalWindow(planId);
  }, [planId]);

  useEffect(() => {
    if (digest.activeCount > 30) {
      setMuted((current) => new Set([...current, 'notice', 'warning']));
    }
  }, [digest.activeCount]);

  return {
    digest,
    fetchSignalWindow,
    muted,
  };
};
