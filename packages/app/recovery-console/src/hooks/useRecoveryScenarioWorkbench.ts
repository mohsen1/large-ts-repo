import { useCallback, useEffect, useMemo, useState } from 'react';
import { withBrand } from '@shared/core';
import type { RecoveryScenarioTemplate } from '@domain/recovery-orchestration-planning/src/incident-models';
import { runRecoveryScenarioWorkflow, type WorkflowInput, type WorkflowResult } from '@service/recovery-scenario-orchestrator';
import type { OrchestrationSignal } from '@domain/recovery-orchestration-planning/src/incident-models';

type WorkbenchStatus = 'idle' | 'running' | 'ready' | 'failed';

export interface ScenarioWorkbenchState {
  readonly status: WorkbenchStatus;
  readonly selectedTemplateId: string;
  readonly selectedTemplateTitle: string;
  readonly diagnostics: readonly string[];
  readonly reasonMap: Record<string, readonly string[]>;
  readonly selectedRevision?: string;
  readonly candidateCount: number;
  readonly blockedCount: number;
  readonly riskScore: number;
  readonly runAt: string;
}

export interface ScenarioWorkbenchConfig {
  readonly tenantId: string;
  readonly incidentId: string;
  readonly templates: readonly RecoveryScenarioTemplate[];
  readonly signals: readonly OrchestrationSignal[];
}

const initialState: ScenarioWorkbenchState = {
  status: 'idle',
  selectedTemplateId: '',
  selectedTemplateTitle: '',
  diagnostics: [],
  reasonMap: {},
  candidateCount: 0,
  blockedCount: 0,
  riskScore: 0,
  runAt: '',
};

const toString = (value: string | undefined): string => value ?? '';

export const useRecoveryScenarioWorkbench = ({ tenantId, incidentId, templates, signals }: ScenarioWorkbenchConfig) => {
  const [state, setState] = useState<ScenarioWorkbenchState>(initialState);

  const workflowInput = useMemo<WorkflowInput>(
    () => ({
      tenantId: withBrand(tenantId, 'TenantId'),
      incidentId,
      templates,
      signals,
      options: {
        templateCount: templates.length,
        templateLimit: Math.max(1, Math.min(6, templates.length)),
        minSignals: Math.max(1, signals.length),
        maxRiskScore: 92,
      },
    }),
    [tenantId, incidentId, templates, signals],
  );

  const runScenarioWorkflow = useCallback(async () => {
    setState((previous) => ({ ...previous, status: 'running', runAt: new Date().toISOString() }));

    const result = runRecoveryScenarioWorkflow(workflowInput);
    if (!result.ok) {
      setState((previous) => ({
        ...previous,
        status: 'failed',
        runAt: new Date().toISOString(),
        diagnostics: [...previous.diagnostics, result.error],
      }));
      return;
    }

    const summary = summarizeRunResult(result.value);
    setState((previous) => ({
      ...previous,
      status: 'ready',
      selectedTemplateId: summary.selectedTemplateId,
      selectedTemplateTitle: summary.selectedTemplateTitle,
      selectedRevision: summary.selectedRevision,
      diagnostics: summary.diagnostics,
      reasonMap: summary.reasonMap,
      candidateCount: summary.candidateCount,
      blockedCount: summary.blockedCount,
      riskScore: summary.riskScore,
      runAt: new Date().toISOString(),
    }));
  }, [workflowInput]);

  useEffect(() => {
    void runScenarioWorkflow();
  }, [runScenarioWorkflow]);

  const selectedReasons = useMemo(() => state.reasonMap[state.selectedTemplateId] ?? [], [state.reasonMap, state.selectedTemplateId]);

  return {
    state: {
      ...state,
      selectedTemplateTitle: state.selectedTemplateTitle,
    },
    status: state.status,
    runScenarioWorkflow,
    canRun: workflowInput.templates.length > 0 && workflowInput.signals.length > 0,
    selectedReasons,
    health: state.riskScore > 75 ? 'green' : state.riskScore > 45 ? 'yellow' : 'red',
  } as const;
};

const summarizeRunResult = (result: WorkflowResult) => {
  const selectedTemplate = result.summary.selected;
  const diagnostics = Object.entries(result.reasonMap).map(([id, reasons]) => `${id}:${reasons.join(',')}`);
  const riskScore = Math.round(result.aggregateRisk.score);
  const selectedTitle = result.summary.selectedCount === 0 ? 'none' : `scenario-${selectedTemplate}`;

  return {
    selectedTemplateId: toString(selectedTemplate),
    selectedTemplateTitle: selectedTitle,
    selectedRevision: ``,
    diagnostics,
    reasonMap: result.reasonMap,
    candidateCount: result.summary.selectedCount,
    blockedCount: result.summary.blockedCount,
    riskScore,
  };
};
