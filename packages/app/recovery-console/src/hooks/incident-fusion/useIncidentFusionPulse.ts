import { useEffect, useMemo, useState } from 'react';
import type { SignalPulse, RecoverySignal, SignalId } from '@domain/incident-fusion-models';
import { createFusionRepository } from '@data/incident-fusion-store';

export interface PulsePoint {
  readonly at: string;
  readonly value: number;
}

export interface SignalPulseSeries {
  readonly signalId: SignalId;
  readonly tenant: string;
  readonly title: string;
  readonly history: readonly PulsePoint[];
}

const sampleCount = 25;

export const useIncidentFusionPulse = (tenant: string, signals: readonly RecoverySignal[]) => {
  const repository = useMemo(() => createFusionRepository({ tenant }), [tenant]);
  const [series, setSeries] = useState<readonly SignalPulseSeries[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      try {
        const snapshot = await repository.snapshot(tenant);
        if (!snapshot || !alive) return;

        const grouped = new Map<SignalId, SignalPulse[]>();
        for (const item of snapshot) {
          const pulses = grouped.get(item.data.id) ?? [];
          const signalPulse: SignalPulse = {
            value: 0,
            signalId: item.data.id,
            at: item.recordedAt,
          };
          pulses.push(signalPulse);
          grouped.set(item.data.id, pulses);
        }

        const next = signals
          .map((signal) => {
            const pulseHistory = grouped.get(signal.id) ?? [];
            return {
              signalId: signal.id,
              tenant,
              title: signal.title,
              history: pulseHistory
                .slice(-sampleCount)
                .map((point) => ({
                  at: point.at,
                  value: point.value,
                })),
            };
          })
          .filter((item) => item.history.length > 0);

        if (!alive) return;
        setSeries(next);
        setError(null);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : 'Unable to read pulse signal snapshots');
      }
    };

    void run();
    const interval = window.setInterval(run, 12_000);
    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, [repository, tenant, signals]);

  return {
    series,
    error,
  };
};
