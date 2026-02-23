import { useCallback, useEffect, useMemo, useState } from 'react';
import { RecoveryTimeline } from '@domain/recovery-timeline';
import { aggregateHealth, buildSummary } from '@domain/recovery-timeline';
import { applyAdvance, buildForecast, getTimeline, listTimelines, seedRepository } from '../services/recoveryTimelineAdapter';
import { TimelineStudioContext } from '../types';

const initialState: TimelineStudioContext = {
  timelines: [],
  selectedTimelineId: null,
  loading: true,
  filterQuery: '',
  teamFilter: 'Ops Team',
  selectedAction: 'advance',
};

function deriveSamples(): RecoveryTimeline[] {
  const now = Date.now();
  return [];
}

export function useRecoveryTimelineDashboard(initialTimelineSeeds: RecoveryTimeline[] = deriveSamples()): {
  state: TimelineStudioContext;
  filtered: RecoveryTimeline[];
  selectedTimeline: RecoveryTimeline | undefined;
  summary: string;
  forecastTimeline: ReturnType<typeof buildForecast>;
  healthRatio: number;
  refresh: () => void;
  runAction: () => void;
  setTeam: (team: string) => void;
  setFilter: (query: string) => void;
} {
  const [state, setState] = useState<TimelineStudioContext>(initialState);

  useEffect(() => {
    seedRepository(initialTimelineSeeds);
    const all = listTimelines({ ownerTeam: initialState.teamFilter });
    setState((current) => ({
      ...current,
      timelines: all,
      selectedTimelineId: all[0]?.id ?? null,
      loading: false,
    }));
  }, [initialTimelineSeeds]);

  const filtered = useMemo(() => {
    return state.timelines.filter((timeline) =>
      state.filterQuery.length === 0
        || timeline.name.toLowerCase().includes(state.filterQuery.toLowerCase())
        || timeline.id.toLowerCase().includes(state.filterQuery.toLowerCase()),
    );
  }, [state.timelines, state.filterQuery]);

  const selectedTimeline = state.selectedTimelineId
    ? getTimeline(state.selectedTimelineId)
    : undefined;

  const summary = selectedTimeline ? buildSummary(selectedTimeline) : 'No timeline selected';

  const healthRatio = selectedTimeline ? aggregateHealth(selectedTimeline.events).completedCount / Math.max(1, selectedTimeline.events.length) : 0;

  const forecastTimeline = selectedTimeline ? buildForecast(selectedTimeline.id) : undefined;

  const refresh = useCallback(() => {
    const timelines = listTimelines({
      ownerTeam: state.teamFilter,
      query: state.filterQuery || undefined,
    });
    setState((current) => ({ ...current, timelines, loading: false }));
  }, [state.teamFilter, state.filterQuery]);

  const runAction = useCallback(() => {
    if (!state.selectedTimelineId) {
      return;
    }
    const nextTimeline = applyAdvance(state.selectedTimelineId);
    if (!nextTimeline) {
      return;
    }
    setState((current) => ({
      ...current,
      timelines: current.timelines.map((timeline) => timeline.id === nextTimeline.id ? nextTimeline : timeline),
    }));
  }, [state.selectedTimelineId]);

  const setTeam = useCallback((team: string) => {
    setState((current) => ({
      ...current,
      teamFilter: team,
      loading: true,
    }));
    const timelines = listTimelines({ ownerTeam: team, query: currentFilter(state.filterQuery) });
    setState((current) => ({
      ...current,
      timelines,
      selectedTimelineId: timelines[0]?.id ?? null,
      loading: false,
    }));
  }, [state.filterQuery]);

  const setFilter = useCallback((query: string) => {
    setState((current) => ({
      ...current,
      filterQuery: query,
    }));
  }, []);

  return {
    state,
    filtered,
    selectedTimeline,
    summary,
    forecastTimeline,
    healthRatio,
    refresh,
    runAction,
    setTeam,
    setFilter,
  };
}

function currentFilter(query: string): string | undefined {
  const candidate = query.trim();
  return candidate.length > 0 ? candidate : undefined;
}
