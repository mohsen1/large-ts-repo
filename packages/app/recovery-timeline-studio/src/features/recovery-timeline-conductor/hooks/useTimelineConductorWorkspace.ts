import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getTimeline,
  listTimelines,
  resolveRepository,
} from '../../../services/recoveryTimelineAdapter';
import {
  type ConductorInput,
  type ConductorMode,
  type ConductorOutput,
} from '@domain/recovery-timeline-orchestration';
import type { RecoveryTimeline } from '@domain/recovery-timeline';
import {
  runConductorPreview,
  executeConductorRun,
  getConductorCachedOutput,
  preloadConductorCatalog,
  warmUpTimelines,
} from '../services/timelineConductorAdapter';
import { toConductorMetric, type ConductorFilter, type ConductorWorkspaceState } from '../types';

const defaultFilter: ConductorFilter = {
  mode: 'observe',
  minRisk: 25,
  plugin: null,
  ownerTeam: 'Ops Team',
};

export interface UseTimelineConductorWorkspaceResult {
  readonly state: ConductorWorkspaceState;
  readonly metrics: ReturnType<typeof toConductorMetric>;
  readonly catalog: readonly string[];
  readonly output: ConductorOutput | undefined;
  readonly loading: boolean;
  readonly preview: () => Promise<void>;
  readonly runConductor: () => Promise<void>;
  readonly setFilterMode: (mode: ConductorMode) => void;
  readonly setMinRisk: (risk: number) => void;
  readonly setOwnerTeam: (team: string) => void;
  readonly setPlugin: (plugin: string | null) => void;
}

export function useTimelineConductorWorkspace(seed: ConductorInput): UseTimelineConductorWorkspaceResult {
  const [filter, setFilter] = useState<ConductorFilter>(defaultFilter);
  const [selectedTimelineId, setSelectedTimelineId] = useState<string | null>(seed.seedTimeline.id);
  const [output, setOutput] = useState<ConductorOutput | undefined>(undefined);
  const [catalog, setCatalog] = useState<readonly string[]>([]);
  const [loading, setLoading] = useState(true);

  const timeline = useMemo(
    () => getTimeline(selectedTimelineId ?? seed.seedTimeline.id) ?? seed.seedTimeline,
    [selectedTimelineId, seed.seedTimeline],
  );

  const metrics = useMemo(() => toConductorMetric(timeline), [timeline]);

  const state = useMemo<ConductorWorkspaceState>(
    () => ({
      timelines: [timeline],
      selectedTimelineId,
      candidateTimelines: [timeline.id],
      currentMode: filter.mode,
      loading,
      filter,
    }),
    [timeline, selectedTimelineId, filter, loading],
  );

  useEffect(() => {
    let active = true;
    warmUpTimelines();

    void preloadConductorCatalog(filter.mode).then((nextCatalog) => {
      if (!active) {
        return;
      }
      setCatalog(nextCatalog);
      setLoading(false);
      resolveRepository();
    });

    return () => {
      active = false;
    };
  }, [filter.mode]);

  const buildInput = useCallback(
    (): ConductorInput => {
      const selectedPlugins = filter.plugin ? [filter.plugin] : [...catalog];
      return {
        seedTimeline: timeline,
        mode: filter.mode,
        plugins: selectedPlugins,
        pluginNames: selectedPlugins,
        windowMinutes: 30,
        profile: 'adaptive',
      };
    },
    [catalog, filter.mode, filter.plugin, timeline],
  );

  const preview = useCallback(async () => {
    const input = buildInput();
    setLoading(true);
    const previewResult = await runConductorPreview(input);
    if (previewResult.ok) {
      const cached = getConductorCachedOutput(filter.mode, input.seedTimeline.id);
      if (cached) {
        setOutput(cached);
      }
    }
    setLoading(false);
  }, [buildInput, filter.mode]);

  const runConductor = useCallback(async () => {
    const input = buildInput();
    setLoading(true);
    const runResult = await executeConductorRun(input);
    if (runResult.ok) {
      setOutput(runResult.output.output);
    }
    setLoading(false);
  }, [buildInput]);

  const candidateTimelines = useMemo(() => {
    const all = listTimelines({ ownerTeam: filter.ownerTeam, includeSegments: true }) as RecoveryTimeline[];
    return all.filter((entry: RecoveryTimeline) => toConductorMetric(entry).avgRisk >= filter.minRisk);
  }, [filter.minRisk, filter.ownerTeam]);

  useEffect(() => {
    if (!selectedTimelineId && candidateTimelines[0]) {
      setSelectedTimelineId(candidateTimelines[0].id);
    }
  }, [candidateTimelines, selectedTimelineId]);

  const setFilterMode = useCallback((mode: ConductorMode) => {
    setFilter((current) => ({ ...current, mode }));
  }, []);

  const setMinRisk = useCallback((risk: number) => {
    setFilter((current) => ({ ...current, minRisk: risk }));
  }, []);

  const setOwnerTeam = useCallback((team: string) => {
    setFilter((current) => ({ ...current, ownerTeam: team }));
  }, []);

  const setPlugin = useCallback((plugin: string | null) => {
    setFilter((current) => ({ ...current, plugin }));
  }, []);

  return {
    state: {
      ...state,
      timelines: candidateTimelines,
      candidateTimelines: candidateTimelines.map((item: RecoveryTimeline) => item.id),
    },
    metrics,
    catalog,
    output,
    loading,
    preview,
    runConductor,
    setFilterMode,
    setMinRisk,
    setOwnerTeam,
    setPlugin,
  };
}

export function useTimelineConductorCandidates(mode: ConductorMode) {
  const candidates = useMemo(() => {
    return listTimelines({ ownerTeam: 'Ops Team', includeSegments: true }).filter((timeline: RecoveryTimeline) =>
      timeline.id.includes(mode),
    );
  }, [mode]);

  return {
    candidates,
    candidateCount: candidates.length,
  };
}
