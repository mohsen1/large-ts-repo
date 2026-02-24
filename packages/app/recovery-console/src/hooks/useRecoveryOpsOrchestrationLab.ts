import { useCallback, useMemo, useState } from 'react';
import { randomUUID } from 'node:crypto';
import type {
  LabSignal,
  OrchestrationLab,
  LabPlan,
  OrchestrationPolicy,
  OrchestrationLabId,
  LabPlanId,
  LabWindowId,
} from '@domain/recovery-ops-orchestration-lab';
import { buildLabGraph } from '@domain/recovery-ops-orchestration-lab';
import {
  executeOrchestratedLab,
  type OrchestratedLabRun,
  type RuntimeRunContext,
  withRuntimeContext,
} from '@service/recovery-ops-orchestration-engine';
import { isOk } from '@shared/result';

interface UseRecoveryOpsOrchestrationLabParams {
  readonly tenant: string;
  readonly policy: OrchestrationPolicy;
}

interface OrchestrationLabHookState {
  readonly lab?: OrchestrationLab;
  readonly run?: OrchestratedLabRun;
  readonly isRunning: boolean;
  readonly lastError?: string;
}

const timestamp = (): string => new Date().toISOString();

const buildDemoSignal = (index: number): LabSignal => ({
  id: `signal-${index}`,
  labId: `demo-lab` as OrchestrationLabId,
  source: 'demo-source',
  tier: index % 5 === 0 ? 'critical' : index % 2 === 0 ? 'warning' : 'signal',
  title: `Signal ${index}`,
  score: 40 + (index % 6) * 9,
  message: `Auto-generated signal ${index}`,
  createdAt: timestamp(),
  tags: [{ key: 'demo', value: 'true' }],
});

const buildDemoLab = (tenant: string): OrchestrationLab => {
  const planId = `plan-${tenant}-${randomUUID()}` as LabPlanId;
  const firstPlan: LabPlan = {
    id: planId,
    labId: `demo-lab-${tenant}` as OrchestrationLabId,
    title: 'Demo plan',
    description: 'Automated demo plan',
    steps: [
      {
        id: `step-${tenant}-1`,
        type: 'detect',
        name: 'Detect',
        command: 'discover-signals',
        expectedMinutes: 10,
        owner: 'automated',
        dependencies: [],
        risk: 0.3,
        reversible: true,
        tags: ['auto'],
      },
    ],
    state: 'draft',
    score: 0.61,
    confidence: 0.78,
    createdAt: timestamp(),
    updatedAt: timestamp(),
  };

  return {
    id: `lab-${tenant}` as OrchestrationLabId,
    scenarioId: `scenario-${tenant}`,
    tenantId: tenant,
    incidentId: `incident-${tenant}`,
    title: `Demo lab ${tenant}`,
    signals: Array.from({ length: 6 }, (_, index) => buildDemoSignal(index)),
    windows: [
      {
        id: `window-${tenant}` as LabWindowId,
        labId: `lab-${tenant}` as OrchestrationLabId,
        from: new Date().toISOString(),
        to: new Date(Date.now() + 45 * 60_000).toISOString(),
        preferredTimezone: 'UTC',
        blackoutMinutes: [
          15,
          30,
        ],
      },
    ],
    plans: [firstPlan],
    createdAt: timestamp(),
    updatedAt: timestamp(),
  };
};

const deriveGraphSignal = (lab: OrchestrationLab): string => {
  const graph = buildLabGraph(lab);
  return `nodes=${graph.nodes.length} edges=${graph.edges.length}`;
};

export const useRecoveryOpsOrchestrationLab = ({ tenant, policy }: UseRecoveryOpsOrchestrationLabParams) => {
  const [state, setState] = useState<OrchestrationLabHookState>({
    isRunning: false,
  });

  const lab = useMemo(() => buildDemoLab(tenant), [tenant]);

  const runOrchestratedLab = useCallback(async () => {
    setState((previous) => ({ ...previous, isRunning: true, lastError: undefined }));

    const context: RuntimeRunContext = {
      contextId: randomUUID(),
      tenant,
      policy,
      requestedBy: tenant,
    };

    const runtime = await withRuntimeContext(context, async (runContext) => {
      return executeOrchestratedLab(lab, policy, runContext);
    });

    if (!isOk(runtime)) {
      setState((previous) => ({
        ...previous,
        isRunning: false,
        lastError: runtime.error.message,
      }));
      return;
    }

    setState((previous) => ({
      ...previous,
      isRunning: false,
      lab,
      run: runtime.value,
    }));
  }, [lab, tenant, policy]);

  const signalCount = lab.signals.length;
  const planCount = lab.plans.length;
  const graphSummary = deriveGraphSignal(lab);

  return {
    lab,
    run: state.run,
    isRunning: state.isRunning,
    lastError: state.lastError,
    signalCount,
    planCount,
    graphSummary,
    runOrchestratedLab,
  };
};
