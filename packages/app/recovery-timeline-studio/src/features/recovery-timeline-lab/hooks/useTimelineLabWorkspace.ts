import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RecoveryTimeline } from '@domain/recovery-timeline';
import {
  buildLabWorkspaceData,
  runLabPolicyAction,
  runSimulationPreview,
  resolvePluginSummary,
  type TimelineLabWorkspaceData,
} from '../../../services/recoveryTimelineLabAdapter';
import { seedRepository, listTimelines } from '../../../services/recoveryTimelineAdapter';

interface TimelineLabState {
  ownerTeam: string;
  query: string;
  selectedTimelineId: string | null;
  snapshots: string[];
}

const defaultTimelineState: TimelineLabState = {
  ownerTeam: 'Ops Team',
  query: '',
  selectedTimelineId: null,
  snapshots: [],
};

function resolveSelected(records: TimelineLabWorkspaceData[]): string | null {
  return records[0]?.selectedTimeline?.id ?? null;
}

export function useTimelineLabWorkspace(seedTimelines: RecoveryTimeline[]): {
  state: TimelineLabState;
  records: TimelineLabWorkspaceData[];
  pluginSummaries: ReturnType<typeof resolvePluginSummary>;
  runAction: (action: 'advance' | 'simulate' | 'reopen') => Promise<string>;
  setOwnerTeam: (ownerTeam: string) => void;
  setQuery: (query: string) => void;
  selectTimeline: (id: string) => void;
  selected: RecoveryTimeline | undefined;
  preview: (timelineId: string) => Promise<string>;
  refresh: () => void;
} {
  const [state, setState] = useState<TimelineLabState>(defaultTimelineState);
  const [records, setRecords] = useState<TimelineLabWorkspaceData[]>([]);
  const [selected, setSelected] = useState<RecoveryTimeline | undefined>(undefined);

  const refresh = useCallback(() => {
    const source = seedTimelines.length > 0 ? seedTimelines : listTimelines({ ownerTeam: state.ownerTeam, query: state.query || undefined, includeSegments: false });
    const next = buildLabWorkspaceData(source, state.ownerTeam, state.query);
    setRecords(next);
    if (next.length > 0 && !state.selectedTimelineId) {
      setState((current) => ({ ...current, selectedTimelineId: resolveSelected(next) }));
    }
  }, [seedTimelines, state.ownerTeam, state.query]);

  useEffect(() => {
    seedRepository(seedTimelines);
    refresh();
  }, [seedTimelines, refresh]);

  useEffect(() => {
    const timeline = records.find((record) => record.selectedTimeline?.id === state.selectedTimelineId)?.selectedTimeline;
    setSelected(timeline);
  }, [records, state.selectedTimelineId]);

  const pluginSummaries = useMemo(() => resolvePluginSummary(state.ownerTeam, state.query), [state.ownerTeam, state.query]);

  const runAction = useCallback(
    async (action: 'advance' | 'simulate' | 'reopen') => {
      if (!state.selectedTimelineId) {
        return 'no selected timeline';
      }
      const timelineId = state.selectedTimelineId;
      const result = await runLabPolicyAction(timelineId, action);
      setState((current) => ({ ...current, snapshots: [...current.snapshots, result] }));
      refresh();
      return result;
    },
    [refresh, state.selectedTimelineId],
  );

  const preview = useCallback(async (timelineId: string) => {
    return runSimulationPreview(timelineId);
  }, []);

  return {
    state,
    records,
    pluginSummaries,
    runAction,
    setOwnerTeam: (ownerTeam: string) => setState((current) => ({ ...current, ownerTeam })),
    setQuery: (query: string) => setState((current) => ({ ...current, query })),
    selectTimeline: (id: string) => setState((current) => ({ ...current, selectedTimelineId: id })),
    selected,
    preview,
    refresh,
  };
}
