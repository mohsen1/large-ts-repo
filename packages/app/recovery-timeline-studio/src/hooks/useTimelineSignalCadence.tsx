import { useCallback, useMemo, useState } from 'react';
import {
  RecoveryTimeline,
  TimelinePhase,
  classifyRisk,
  type RecoveryTimelineEvent,
  type RiskBand,
} from '@domain/recovery-timeline';

const signalClassByPhase = {
  prepare: 'availability',
  mitigate: 'integrity',
  restore: 'performance',
  verify: 'compliance',
  stabilize: 'availability',
} as const satisfies Record<TimelinePhase, 'availability' | 'integrity' | 'performance' | 'compliance'>;

export type SignalClass = (typeof signalClassByPhase)[TimelinePhase];

type PhaseEntry = {
  readonly phase: TimelinePhase;
  readonly riskBand: RiskBand;
  readonly signalClass: SignalClass;
  readonly count: number;
  readonly avgRisk: number;
};

type SignalWindow<T extends readonly RecoveryTimeline[]> = {
  readonly [I in keyof T]: {
    readonly timeline: T[I];
    readonly entries: readonly PhaseEntry[];
  };
}[number];

type SortMode = 'risk' | 'volume' | 'timeline';

const asRiskBandValue = (value: RiskBand): number =>
  value === 'critical' ? 3 : value === 'high' ? 2 : value === 'medium' ? 1 : 0;

const byRiskBand = (left: { readonly riskBand: RiskBand }, right: { readonly riskBand: RiskBand }) =>
  asRiskBandValue(right.riskBand) - asRiskBandValue(left.riskBand);

const byEventsDesc = (left: { readonly events: number }, right: { readonly events: number }) => right.events - left.events;

const classifyEvent = (event: RecoveryTimelineEvent): [SignalClass, RiskBand] => [
  signalClassByPhase[event.phase],
  classifyRisk(event.riskScore),
];

const dedupeTimelineIds = (events: readonly RecoveryTimelineEvent[]): readonly string[] =>
  [...new Map(events.map((event) => [event.id, event.timelineId])).keys()];

const collectTimelineWindows = (timelines: readonly RecoveryTimeline[]): readonly SignalWindow<typeof timelines>[] =>
  timelines.map((timeline) => ({
    timeline,
    entries: timeline.events.map((event) => {
      const [signalClass, riskBand] = classifyEvent(event);
      return {
        phase: event.phase,
        riskBand,
        signalClass,
        count: 1,
        avgRisk: event.riskScore,
      };
    }),
  }));

const combineBySignalClass = (events: readonly RecoveryTimelineEvent[]): Record<SignalClass, { count: number; avgRisk: number }> =>
  events.reduce<Record<SignalClass, { count: number; avgRisk: number }>>((acc, event) => {
    const [signalClass, riskBand] = classifyEvent(event);
    const current = acc[signalClass] ?? { count: 0, avgRisk: 0 };
    const nextCount = current.count + 1;
    const riskValue = asRiskBandValue(riskBand);

    return {
      ...acc,
      [signalClass]: {
        count: nextCount,
        avgRisk: (current.avgRisk * current.count + riskValue) / nextCount,
      },
    };
  }, {
    availability: { count: 0, avgRisk: 0 },
    integrity: { count: 0, avgRisk: 0 },
    performance: { count: 0, avgRisk: 0 },
    compliance: { count: 0, avgRisk: 0 },
  });

const combineByTimeline = (timelines: readonly RecoveryTimeline[]) =>
  timelines.reduce<Record<string, { events: number; riskScore: number; riskBand: RiskBand; topPhase: TimelinePhase }>>(
    (acc, timeline) => {
      const totalRisk = timeline.events.reduce((sum, event) => sum + event.riskScore, 0);
      const riskScore = timeline.events.length > 0 ? totalRisk / timeline.events.length : 0;
      const grouped = timeline.events.reduce<Record<TimelinePhase, number>>((phaseAcc, event) => {
        const next = phaseAcc[event.phase] ?? 0;
        return {
          ...phaseAcc,
          [event.phase]: next + 1,
        };
      }, {
        prepare: 0,
        mitigate: 0,
        restore: 0,
        verify: 0,
        stabilize: 0,
      });
      const [topPhase] = (Object.entries(grouped) as [TimelinePhase, number][])
        .sort((left, right) => right[1] - left[1])
        .map(([phase]) => phase);

      return {
        ...acc,
        [timeline.id]: {
          events: timeline.events.length,
          riskScore,
          riskBand: classifyRisk(riskScore),
          topPhase: topPhase ?? 'prepare',
        },
      };
    },
    {},
  );

type TimelineSortRow = {
  readonly timelineId: string;
  readonly riskBand: RiskBand;
  readonly events: number;
};

const sortTimelines = (rows: readonly TimelineSortRow[], sort: SortMode) => {
  if (sort === 'risk') {
    return [...rows].sort((left, right) => {
      const riskDiff = byRiskBand(left, right);
      return riskDiff !== 0 ? riskDiff : byEventsDesc(left, right);
    });
  }
  if (sort === 'timeline') {
    return [...rows].sort((left, right) => left.timelineId.localeCompare(right.timelineId));
  }
  return [...rows].sort(byEventsDesc);
};

export interface TimelineSignalCadenceOptions {
  readonly filterPhases: readonly TimelinePhase[];
  readonly minimumRisk: RiskBand;
  readonly sortMode: SortMode;
}

const defaultOptions: TimelineSignalCadenceOptions = {
  filterPhases: ['prepare', 'mitigate', 'restore', 'verify', 'stabilize'],
  minimumRisk: 'low',
  sortMode: 'risk',
};

export function useTimelineSignalCadence<const TTimelines extends readonly RecoveryTimeline[]>(
  timelines: TTimelines,
  options: Partial<TimelineSignalCadenceOptions> = {},
) {
  const [phaseFilter, setPhaseFilter] = useState<TimelineSignalCadenceOptions['filterPhases']>(options.filterPhases ?? defaultOptions.filterPhases);
  const [minimumRisk, setMinimumRisk] = useState<RiskBand>(options.minimumRisk ?? defaultOptions.minimumRisk);
  const [sortMode, setSortMode] = useState<SortMode>(options.sortMode ?? defaultOptions.sortMode);
  const [activeTimelineId, setActiveTimelineId] = useState<string | null>(timelines.at(0)?.id ?? null);

  const phaseSet = useMemo(() => new Set(phaseFilter), [phaseFilter]);

  const filteredTimelines = useMemo(
    () =>
      timelines.filter((timeline) =>
        timeline.events.some((event) =>
          phaseSet.has(event.phase) && asRiskBandValue(classifyRisk(event.riskScore)) >= asRiskBandValue(minimumRisk),
        ),
      ),
    [timelines, phaseSet, minimumRisk],
  );

  const windows = useMemo(() => collectTimelineWindows(filteredTimelines), [filteredTimelines]);
  const cadence = useMemo(
    () => windows.map((window) => ({
      timelineId: window.timeline.id,
      timelineName: window.timeline.name,
      summary: combineBySignalClass(window.timeline.events.map((event) => event)),
      selectedCount: window.entries.length,
      topPhase: [...window.entries]
        .sort((left, right) => byRiskBand(left, right))
        .map((entry) => entry.phase)[0] ?? 'prepare',
    })),
    [windows],
  );
  const timelineStats = useMemo(() => combineByTimeline(filteredTimelines), [filteredTimelines]);
  const events = useMemo(
    () =>
      filteredTimelines.flatMap((timeline) =>
        timeline.events
          .filter((event) => phaseSet.has(event.phase))
          .map((event) => ({
            timelineId: timeline.id,
            timelineName: timeline.name,
            phase: event.phase,
            state: event.state,
            riskBand: classifyRisk(event.riskScore),
            score: event.riskScore,
          })),
      ),
    [phaseSet, filteredTimelines],
  );
  const signatures = useMemo(
    () =>
      dedupeTimelineIds(filteredTimelines.flatMap((timeline) => timeline.events))
        .map((id) => `${id}::${asRiskBandValue(classifyRisk(events.find((entry) => entry.timelineId === id)?.score ?? 0))}`),
    [events, filteredTimelines],
  );

  const ranked = useMemo(() => {
    const rows = Object.entries(timelineStats).map(([timelineId, value]) => ({
      timelineId,
      riskBand: value.riskBand,
      events: value.events,
    }));
    return sortTimelines(rows, sortMode);
  }, [sortMode, timelineStats]);

  const setPhaseFilterSafe = useCallback((next: readonly TimelinePhase[]) => {
    const nextSet = next.length > 0 ? next : defaultOptions.filterPhases;
    setPhaseFilter(nextSet);
  }, []);

  const setMinimumRiskSafe = useCallback((next: RiskBand) => {
    setMinimumRisk(next);
  }, []);

  const setSortModeSafe = useCallback((next: SortMode) => {
    setSortMode(next);
  }, []);

  return {
    timelines: filteredTimelines,
    windows,
    cadence,
    events,
    rankedTimelines: ranked,
    activeTimelineId,
    setActiveTimelineId,
    phaseFilter,
    minimumRisk,
    sortMode,
    setPhaseFilter: setPhaseFilterSafe,
    setMinimumRisk: setMinimumRiskSafe,
    setSortMode: setSortModeSafe,
    signatures,
  };
}
