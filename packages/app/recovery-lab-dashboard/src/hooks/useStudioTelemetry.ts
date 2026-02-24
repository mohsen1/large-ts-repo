import { useEffect, useState } from 'react';
import { InMemoryTelemetryCollector, type TelemetrySnapshot } from '@service/recovery-lab-orchestration-studio/src/telemetry';

interface UseStudioTelemetryOptions {
  readonly runId: string;
  readonly enabled: boolean;
}

export interface StudioTelemetry {
  readonly live: readonly string[];
  readonly snapshot: TelemetrySnapshot | null;
}

export const useStudioTelemetry = ({ runId, enabled }: UseStudioTelemetryOptions): StudioTelemetry => {
  const [live, setLive] = useState<readonly string[]>([]);
  const [snapshot, setSnapshot] = useState<TelemetrySnapshot | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const collector = new InMemoryTelemetryCollector();
    const timer = setInterval(async () => {
      await collector.push({
        id: runId,
        kind: 'tick',
        value: Date.now(),
      });
      const next = await collector.summarize(runId);
      setLive((current) => [...current.slice(-20), `${next.summary}:${next.events}`]);
      setSnapshot(next);
    }, 350);

    return () => {
      clearInterval(timer);
      setLive(['stopped']);
      setSnapshot(null);
    };
  }, [enabled, runId]);

  return { live, snapshot };
};
