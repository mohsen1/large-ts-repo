import { useCallback, useMemo, useState } from 'react';
import type { ScenarioWorkspaceState, ScenarioStudioInput } from '../../types/scenario-studio';
import {
  initialWorkspaceState,
  fetchScenarioTemplates,
  startScenarioRun,
  loadScenarioTemplateById,
  normalizeMode,
} from '../../services/scenario-studio/scenarioStudioService';

export function useScenarioStudioWorkspace() {
  const [state, setState] = useState<ScenarioWorkspaceState>(initialWorkspaceState);

  const reload = useCallback(async () => {
    const templates = await fetchScenarioTemplates();
    setState((current) => ({
      ...current,
      model: {
        ...current.model,
        templates,
      },
      history: [`templates:${templates.length}:reloaded`, ...current.history].slice(0, 25),
    }));
  }, []);

  const selectTemplate = useCallback((templateId: string) => {
    setState((current) => ({
      ...current,
      model: {
        ...current.model,
        selectedTemplateId: templateId,
      },
      history: [`template:selected:${templateId}`, ...current.history].slice(0, 50),
    }));
  }, []);

  const startRun = useCallback(async (mode: string) => {
    const templateId = state.model.selectedTemplateId;
    if (!templateId) {
      return;
    }
    const template = await loadScenarioTemplateById(templateId);
    if (!template) {
      return;
    }
    const input: ScenarioStudioInput = {
      templateId,
      owner: template.owner,
      mode: normalizeMode(mode),
      parameters: {
        createdAt: template.createdAt,
        stageCount: template.stages.length,
      },
    };
    const response = await startScenarioRun(input);
    if (!response.ok || !response.payload) {
      return;
    }
    const snapshot = response.payload;

    setState((current) => ({
      ...current,
      model: {
        ...current.model,
        selectedRunId: snapshot.runId,
      },
      runningRuns: [snapshot, ...current.runningRuns].slice(0, 12),
      history: [`run:start:${snapshot.runId}`, ...current.history].slice(0, 50),
    }));
  }, [state.model.selectedTemplateId]);

  const switchMode = useCallback((mode: ScenarioStudioInput['mode']) => {
    setState((current) => ({
      ...current,
      model: {
        ...current.model,
        currentMode: mode,
      },
      history: [`mode:${mode}`, ...current.history].slice(0, 50),
    }));
  }, []);

  const sortedRuns = useMemo(() => [...state.runningRuns].sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [state.runningRuns]);

  const latestRun = sortedRuns.at(0);

  return {
    state,
    reload,
    selectTemplate,
    startRun,
    switchMode,
    sortedRuns,
    latestRun,
  };
}
