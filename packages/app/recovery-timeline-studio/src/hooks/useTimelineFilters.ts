import { useState } from 'react';

export interface TimelineFilterState {
  query: string;
  ownerTeam: string;
  includeArchived: boolean;
}

export interface TimelineFilterActions {
  setQuery: (value: string) => void;
  setOwnerTeam: (team: string) => void;
  setIncludeArchived: (value: boolean) => void;
  reset: () => void;
}

const DEFAULT_FILTER: TimelineFilterState = {
  query: '',
  ownerTeam: 'Ops Team',
  includeArchived: false,
};

export function useTimelineFilters(): TimelineFilterState & TimelineFilterActions {
  const [state, setState] = useState<TimelineFilterState>(DEFAULT_FILTER);

  const setQuery = (value: string): void => {
    setState((current) => ({
      ...current,
      query: value,
    }));
  };

  const setOwnerTeam = (team: string): void => {
    setState((current) => ({
      ...current,
      ownerTeam: team,
    }));
  };

  const setIncludeArchived = (value: boolean): void => {
    setState((current) => ({
      ...current,
      includeArchived: value,
    }));
  };

  const reset = (): void => {
    setState(DEFAULT_FILTER);
  };

  return {
    ...state,
    setQuery,
    setOwnerTeam,
    setIncludeArchived,
    reset,
  };
}

