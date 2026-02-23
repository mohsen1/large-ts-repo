import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RecoveryCoordinationCommandCenter,
  RecoveryCoordinationOrchestrator,
  RecoveryCoordinationWorkflowRouter,
} from '@service/recovery-coordination-orchestrator';
import type { CoordinationAttemptReport } from '@service/recovery-coordination-orchestrator';
import {
  type CoordinationAttemptInput,
} from '@service/recovery-coordination-orchestrator';
import {
  type CoordinationPlanCandidate,
  type CoordinationSelectionResult,
} from '@domain/recovery-coordination';
import type { RecoveryProgram, RecoveryRunState, RecoveryRunId } from '@domain/recovery-orchestration';
import { defaultDashboardState } from '../../types/coordination/coordinationDashboard';
import type { CoordinationDashboardState } from '../../types/coordination/coordinationDashboard';

export interface UseCoordinationCommandCenterInput {
  readonly tenant: string;
  readonly programId: string;
}

export interface UseCoordinationCommandCenterReturn {
  readonly state: CoordinationDashboardState;
  readonly candidate: CoordinationPlanCandidate | null;
  readonly selection: CoordinationSelectionResult | null;
  readonly commandInputs: readonly CoordinationAttemptInput[];
  readonly launch: () => Promise<void>;
  readonly cancel: (commandId: string) => Promise<void>;
  readonly reload: () => void;
  readonly latestReport: CoordinationAttemptReport | null;
}

const createAttemptInput = (tenant: string, program: RecoveryProgram, index = 0): CoordinationAttemptInput => {
  const context = {
    requestedBy: tenant,
    tenant,
    correlationId: `${tenant}:corr:${index}`,
  };

  const runState: RecoveryRunState = {
    runId: `${program.id}:run:${index}` as RecoveryRunId,
    programId: program.id,
    incidentId: `${tenant}-incident` as RecoveryRunState['incidentId'],
    status: index % 2 === 0 ? 'staging' : 'draft',
    startedAt: new Date().toISOString(),
    completedAt: undefined,
    currentStepId: undefined,
    nextStepId: undefined,
    estimatedRecoveryTimeMinutes: 120 + index,
  };

  return {
    commandId: `${tenant}:command:${index}`,
    tenant,
    program,
    runState,
    runId: runState.runId,
    context,
    budget: {
      maxStepCount: Math.max(1, program.steps.length),
      maxParallelism: 3,
      maxRuntimeMinutes: 120,
    },
  };
};

const resolveProgram = (tenant: string, programId: string): RecoveryProgram => ({
  id: `${tenant}:program:${programId}` as unknown as RecoveryProgram['id'],
  tenant: `${tenant}` as unknown as RecoveryProgram['tenant'],
  service: `${tenant}-service` as unknown as RecoveryProgram['service'],
  name: 'coordination-workspace',
  description: 'Synthetic recovery coordination program for dashboard experiments',
  priority: 'silver',
  mode: 'restorative',
  window: {
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    timezone: 'UTC',
  },
  topology: {
    rootServices: ['edge-router'],
    fallbackServices: ['cache-layer'],
    immutableDependencies: [['edge-router', 'cache-layer']],
  },
  constraints: [
    {
      name: 'region-availability',
      operator: 'gte',
      threshold: 1,
      description: 'region-availability >= 1',
    },
  ],
  steps: [
    {
      id: `${programId}-step-one`,
      title: 'Coordinate incident response',
      command: 'activate-coordination-plan',
      timeoutMs: 30_000,
      dependencies: [],
      requiredApprovals: 1,
      tags: ['coordination'],
    },
    {
      id: `${programId}-step-two`,
      title: 'Validate recovery sequence',
      command: 'validate-sequence',
      timeoutMs: 45_000,
      dependencies: [`${programId}-step-one`],
      requiredApprovals: 2,
      tags: ['validation'],
    },
  ],
  owner: 'console',
  tags: ['synthetic', 'coordination'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export const useCoordinationCommandCenter = ({ tenant, programId }:
  UseCoordinationCommandCenterInput): UseCoordinationCommandCenterReturn => {
  const [state, setState] = useState<CoordinationDashboardState>({
    ...defaultDashboardState,
    tenant,
  });
  const [selection, setSelection] = useState<CoordinationSelectionResult | null>(null);
  const [commands, setCommands] = useState<readonly CoordinationAttemptInput[]>([]);
  const [candidate, setCandidate] = useState<CoordinationPlanCandidate | null>(null);

  const commandCenter = useMemo(() =>
    new RecoveryCoordinationCommandCenter({ orchestrator: new RecoveryCoordinationOrchestrator() }),
  []);
  const router = useMemo(() => new RecoveryCoordinationWorkflowRouter(), []);

  const program = useMemo(() => resolveProgram(tenant, programId), [tenant, programId]);

  const launch = useCallback(async () => {
    const catalog = [
      createAttemptInput(tenant, program, 0),
      createAttemptInput(tenant, program, 1),
      createAttemptInput(tenant, program, 2),
    ];

    const command = catalog[0];
    setState((current) => ({ ...current, isBusy: true, canExecute: false }));
    const result = await commandCenter.execute(
      {
        tenant,
        commandId: command.commandId,
        operator: tenant,
        runId: `${tenant}:${program.id}`,
        requestedBy: tenant,
        runWindowMinutes: 45,
      },
      command,
    );

    if (!result.ok) {
      setState((current) => ({ ...current, isBusy: false }));
      return;
    }

    await router.route(command);
    const catalogReport = result.value;
    setSelection(catalogReport.selection);
    setState((current) => ({
      ...current,
      isBusy: false,
      latestReport: catalogReport,
      canCancel: catalogReport.state.phase !== 'complete',
      candidate: catalogReport.plan,
      selectedSignals: catalogReport.selection.blockedConstraints,
      program,
      canExecute: false,
    }));
    setCandidate(catalogReport.plan);
    setCommands(catalog);
  }, [commandCenter, program, router, tenant]);

  const cancel = useCallback(async (commandIdValue: string) => {
    const result = await commandCenter.cancel(commandIdValue);
    if (!result.ok) return;
    setState((current) => ({ ...current, canCancel: false, canExecute: true, isBusy: false }));
  }, [commandCenter]);

  const reload = useCallback(() => {
    setState((current) => ({ ...current, canExecute: Boolean(current.program) }));
    setCommands([
      createAttemptInput(tenant, program, 0),
      createAttemptInput(tenant, program, 1),
    ]);
  }, [program, tenant]);

  useEffect(() => {
    setState((current) => ({ ...current, commandCenter, canExecute: Boolean(program) }));
  }, [commandCenter, program]);

  return {
    state: {
      ...state,
      commandCenter,
    },
    candidate,
    selection,
    commandInputs: commands,
    latestReport: state.latestReport,
    launch,
    cancel,
    reload,
  };
};
