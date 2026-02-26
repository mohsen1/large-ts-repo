import { useEffect, useMemo, useState } from 'react';

interface TimelineEvent {
  readonly id: string;
  readonly domain: string;
  readonly metric: number;
  readonly phase: 'discovery' | 'validation' | 'execution' | 'rollback';
  readonly at: string;
}

interface UseStressTimelineResult {
  readonly events: readonly TimelineEvent[];
  readonly domains: readonly string[];
  readonly maxMetric: number;
  readonly minMetric: number;
  readonly avgMetric: number;
}

const buildSeed = (): readonly TimelineEvent[] => {
  const now = Date.now();
  const out: TimelineEvent[] = [];
  const phases = ['discovery', 'validation', 'execution', 'rollback'] as const;
  for (let index = 0; index < 80; index += 1) {
    const domain = `domain-${index % 12}`;
    const phase = phases[index % phases.length] as TimelineEvent['phase'];
    out.push({
      id: `evt-${index}`,
      domain,
      metric: index * 1.5,
      phase,
      at: new Date(now - index * 1000 * 60).toISOString(),
    });
  }
  return out;
};

export const useStressTimeline = (): UseStressTimelineResult => {
  const [events, setEvents] = useState<readonly TimelineEvent[]>(buildSeed);

  useEffect(() => {
    let active = true;

    const tick = () => {
      if (!active) {
        return;
      }

      setEvents((previous) => {
        const latest: TimelineEvent = {
          id: `evt-${Date.now()}`,
          domain: `domain-${previous.length % 12}`,
          metric: (previous[0]?.metric ?? 0) + 5,
          phase: ['discovery', 'validation', 'execution', 'rollback'][previous.length % 4] as TimelineEvent['phase'],
          at: new Date().toISOString(),
        };
        return [latest, ...previous].slice(0, 120);
      });

      window.setTimeout(tick, 200);
    };

    tick();

    return () => {
      active = false;
    };
  }, []);

  const derived = useMemo(() => {
    const domains = [...new Set(events.map((event) => event.domain))];
    const metrics = events.map((event) => event.metric);
    const maxMetric = Math.max(...metrics);
    const minMetric = Math.min(...metrics);
    const avgMetric = metrics.reduce((acc, metric) => acc + metric, 0) / metrics.length;
    return {
      events,
      domains,
      maxMetric,
      minMetric,
      avgMetric,
    };
  }, [events]);

  return derived;
};
