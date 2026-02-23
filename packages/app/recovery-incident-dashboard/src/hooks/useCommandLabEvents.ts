import { useEffect, useMemo, useState } from 'react';
import { CommandLabTelemetry } from '@service/recovery-incident-command-orchestrator/lab-telemetry';

export interface UseCommandLabEventsOutput {
  readonly events: readonly string[];
  readonly active: boolean;
  readonly refresh: () => Promise<void>;
}

export const useCommandLabEvents = (tenantId: string): UseCommandLabEventsOutput => {
  const telemetry = useMemo(() => new CommandLabTelemetry(), []);
  const [events, setEvents] = useState<readonly string[]>([]);
  const [active, setActive] = useState(false);

  const refresh = async () => {
    const snapshot = telemetry.getEvents();
    setEvents(snapshot.map((entry) => `${entry.name}@${entry.timestamp}`));
  };

  useEffect(() => {
    let canceled = false;
    setActive(true);
    void telemetry.subscribe(tenantId, async () => {
      if (canceled) return;
      await refresh();
    });
    void refresh().finally(() => {
      if (!canceled) {
        setActive(false);
      }
    });
    return () => {
      canceled = true;
    };
  }, [tenantId, telemetry]);

  return { events, active, refresh };
};
