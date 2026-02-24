import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createHorizonExecutionEngine,
  type EngineRunSummary,
} from '@service/recovery-stress-lab-orchestrator/src/horizon-execution-engine';
import {
  baseTemplate,
  type Brand,
  type HorizonIdentity,
  type HorizonScenarioId,
  type HorizonStage,
  type HorizonTemplate,
  type HorizonWorkspaceId,
  deserializeScope,
  defaultStages,
} from '@domain/recovery-stress-lab';

interface WorkspaceState {
  readonly id: HorizonWorkspaceId;
  readonly scenarioId: HorizonScenarioId;
  readonly isRunning: boolean;
  readonly stage: HorizonStage;
  readonly stageHistory: readonly HorizonStage[];
  readonly summary?: EngineRunSummary;
  readonly runId: Brand<string, 'HorizonRunId'> | null;
}

interface WorkspaceAction {
  readonly start: () => Promise<void>;
  readonly stop: () => void;
  readonly toggleAuto: () => void;
  readonly reset: () => void;
}

export interface UseHorizonLabWorkspaceReturn {
  readonly state: WorkspaceState;
  readonly actions: WorkspaceAction;
}

interface UseHorizonLabWorkspaceArgs {
  readonly scenarioId: HorizonScenarioId;
  readonly workspaceId: HorizonWorkspaceId;
  readonly identityKey: string;
}

const bootstrapTemplate: HorizonTemplate = {
  ...baseTemplate,
  templateId: baseTemplate.templateId as Brand<string, 'HorizonTemplateId'>,
};

const buildIdentity = (identityKey: string, workspaceId: HorizonWorkspaceId, scenarioId: HorizonScenarioId): HorizonIdentity => {
  const parsed = deserializeScope(identityKey);
  return {
    ids: {
      scenario: scenarioId,
      workspace: workspaceId,
      session: parsed.ids.session,
    },
    trace: parsed.trace,
    createdAt: parsed.createdAt,
  };
};

export const useHorizonLabWorkspace = ({
  scenarioId,
  workspaceId,
  identityKey,
}: UseHorizonLabWorkspaceArgs): UseHorizonLabWorkspaceReturn => {
  const [isRunning, setIsRunning] = useState(false);
  const [isAuto, setIsAuto] = useState(true);
  const [runId, setRunId] = useState<Brand<string, 'HorizonRunId'> | null>(null);
  const [summary, setSummary] = useState<EngineRunSummary | null>(null);
  const [stageHistory, setStageHistory] = useState<readonly HorizonStage[]>([]);

  const identity = useMemo(() => buildIdentity(identityKey, workspaceId, scenarioId), [identityKey, workspaceId, scenarioId]);

  const state: WorkspaceState = useMemo(
    () => ({
      id: workspaceId,
      scenarioId,
      isRunning,
      stage: defaultStages[stageHistory.length] ?? defaultStages[defaultStages.length - 1],
      stageHistory,
      summary: summary ?? undefined,
      runId,
    }),
    [isRunning, stageHistory, workspaceId, scenarioId, summary, runId],
  );

  const run = useCallback(async () => {
    if (isRunning) {
      return;
    }

    setIsRunning(true);
    const engine = createHorizonExecutionEngine({
      identity,
      template: bootstrapTemplate,
      tenant: 'horizon-ui',
      payload: {
        scenario: scenarioId,
        workspace: workspaceId,
        key: identityKey,
      },
    });

    try {
      const report = await engine.run();
      if (!report.ok) {
        return;
      }

      setRunId(report.value.state.runId);
      setSummary(report.value);
      setStageHistory(report.value.timeline.map((entry) => entry.stage));
    } finally {
      await engine[Symbol.asyncDispose]();
      setIsRunning(false);
    }
  }, [identity, isRunning, scenarioId, workspaceId, identityKey]);

  const stop = useCallback(() => {
    setIsRunning(false);
  }, []);

  const toggleAuto = useCallback(() => {
    setIsAuto((value) => !value);
  }, []);

  const reset = useCallback(() => {
    setStageHistory([]);
    setSummary(null);
    setRunId(null);
  }, []);

  useEffect(() => {
    if (!isAuto) {
      return;
    }

    if (isRunning) {
      return;
    }

    if (stageHistory.length > 0 && stageHistory.at(-1) === defaultStages[defaultStages.length - 1]) {
      return;
    }

    const timer = setTimeout(() => {
      void run();
    }, 2_000);

    return () => {
      clearTimeout(timer);
    };
  }, [isAuto, isRunning, run, stageHistory]);

  return {
    state,
    actions: {
      start: run,
      stop,
      toggleAuto,
      reset,
    },
  };
};
