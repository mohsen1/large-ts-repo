import { useCallback, useMemo, useState } from 'react';
import { runSynthetic, summarizeOrchestrator, normalizePlanInput } from '@service/recovery-horizon-orchestrator';
import type { PluginStage, HorizonInput, RunId } from '@domain/recovery-horizon-engine';

const defaultSessionWindow: readonly PluginStage[] = ['ingest', 'analyze', 'resolve', 'optimize', 'execute'];

type HookState = 'idle' | 'running' | 'success' | 'error';

type StageToggle = {
  readonly stage: PluginStage;
  readonly active: boolean;
  readonly required: boolean;
  readonly index: number;
};

export interface UseSyntheticHorizonInput {
  readonly tenantId: string;
  readonly owner: string;
}

export interface UseSyntheticHorizonOptions {
  readonly stages?: readonly PluginStage[];
  readonly initialProfile?: string;
}

export interface SyntheticTimelineEntry {
  readonly stage: string;
  readonly selected: boolean;
  readonly required: boolean;
  readonly index: number;
}

export interface SyntheticRunState {
  readonly state: HookState;
  readonly runId: string | null;
  readonly elapsedMs: number;
  readonly stageCount: number;
  readonly okCount: number;
  readonly failCount: number;
  readonly events: readonly string[];
  readonly errorMessage: string | null;
}

export interface SyntheticHorizonHook {
  readonly state: SyntheticRunState;
  readonly plans: readonly StageToggle[];
  readonly isRunning: boolean;
  readonly profile: string;
  readonly stages: readonly PluginStage[];
  readonly lastPlan: string;
  readonly lastError: string | null;
  readonly run: () => Promise<void>;
  readonly reset: () => void;
  readonly setProfile: (profile: string) => void;
  readonly toggleStage: (stage: PluginStage) => void;
  readonly selectedStages: readonly PluginStage[];
  readonly status: {
    readonly label: string;
    readonly danger: boolean;
  };
}

const uniqueStages = (values: readonly PluginStage[]): readonly PluginStage[] =>
  [...new Set(values)] as PluginStage[];

const clampStageInput = (values: readonly PluginStage[], backup: readonly PluginStage[]): readonly PluginStage[] => {
  return values.length ? uniqueStages(values) : backup;
}

const defaultProfile = 'default';

export const useSyntheticHorizon = (
  { tenantId, owner }: UseSyntheticHorizonInput,
  options: UseSyntheticHorizonOptions = {},
): SyntheticHorizonHook => {
  const stageSeed = clampStageInput(options.stages ?? [], defaultSessionWindow as readonly PluginStage[]);
  const [selectedStages, setSelectedStages] = useState<readonly PluginStage[]>(stageSeed);
  const [profile, setProfileValue] = useState(options.initialProfile ?? defaultProfile);
  const [state, setState] = useState<SyntheticRunState>({
    state: 'idle',
    runId: null,
    elapsedMs: 0,
    stageCount: stageSeed.length,
    okCount: 0,
    failCount: 0,
    events: [],
    errorMessage: null,
  });

  const plans = useMemo(
    () =>
      selectedStages.map((stage, index) => ({
        stage,
        active: true,
        required: index < defaultSessionWindow.length,
        index,
      }) satisfies StageToggle),
    [selectedStages],
  );

  const status = useMemo(
    () => ({
      label: state.state === 'error' ? 'error' : state.state === 'running' ? 'running' : 'ready',
      danger: state.state === 'error',
    }),
    [state.state],
  );

  const lastPlan = useMemo(() => {
    const plan: HorizonInput = {
      version: '1.0.0',
      runId: `run:${tenantId}:${profile}` as unknown as RunId,
      tenantId,
      stage: selectedStages[0] ?? 'ingest',
      tags: selectedStages,
      metadata: {
        owner,
        profile,
      },
    };
    const normalized = normalizePlanInput(plan);
    return `${normalized.stage}|${normalized.runId}|${normalized.tags.length}`;
  }, [tenantId, selectedStages, profile, owner]);

  const setError = useCallback((error: string) => {
    setState((current) => ({
      ...current,
      state: 'error',
      errorMessage: error,
      okCount: 0,
      failCount: current.stageCount,
      elapsedMs: Date.now() - Number(current.elapsedMs),
      events: [...current.events, `error:${error}`],
    }));
  }, []);

  const run = useCallback(async () => {
    const startedAt = Date.now();
    setState({
      state: 'running',
      runId: null,
      elapsedMs: 0,
      stageCount: selectedStages.length,
      okCount: 0,
      failCount: 0,
      events: ['starting'],
      errorMessage: null,
    });

    try {
      const result = await runSynthetic({
        tenantId,
        owner,
        profile,
        stageWindow: selectedStages,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }

      const summary = summarizeOrchestrator({
        summary: {
          ...result.value,
          tenantId,
          elapsedMs: Date.now() - startedAt as any,
          stageCount: selectedStages.length,
          okCount: result.value.okCount,
          failCount: result.value.failCount,
          runId: result.value.runId,
        },
        signals: [],
        timeline: { stages: selectedStages, ordered: selectedStages as any, events: [] as any },
      });

      setState({
        state: 'success',
        runId: summary.runId,
        elapsedMs: result.value.elapsedMs,
        stageCount: summary.stageCount,
        okCount: result.value.okCount,
        failCount: result.value.failCount,
        events: [`run:${summary.runId}`, `summary:${summary.totalSignals}`],
        errorMessage: null,
      });
    } catch (error) {
      setError((error as Error).message);
    }
  }, [tenantId, owner, profile, runSynthetic, selectedStages, setError]);

  const reset = useCallback(() => {
    setState({
      state: 'idle',
      runId: null,
      elapsedMs: 0,
      stageCount: selectedStages.length,
      okCount: 0,
      failCount: 0,
      events: [],
      errorMessage: null,
    });
  }, [selectedStages.length]);

  const setProfile = useCallback((value: string) => {
    setProfileValue(value);
  }, []);

  const toggleStage = useCallback((stage: PluginStage) => {
    setSelectedStages((current) => {
      const next = current.includes(stage)
        ? current.filter((entry) => entry !== stage)
        : [...current, stage];
      return next.length ? uniqueStages(next) : stageSeed;
    });
  }, [stageSeed]);

  return {
    state,
    plans,
    isRunning: state.state === 'running',
    profile,
    stages: selectedStages,
    lastPlan,
    lastError: state.errorMessage,
    run,
    reset,
    setProfile,
    toggleStage,
    selectedStages,
    status,
  };
};
