import { useCallback, useMemo, useState } from 'react';
import { withBrand } from '@shared/core';
import { InMemoryRecoveryOperationsRepository } from '@data/recovery-operations-store';
import { InMemoryFusionStore, NoopFusionBus, RecoveryFusionOrchestrator } from '@service/recovery-fusion-orchestrator';
import type { FusionPlanResult } from '@domain/recovery-fusion-intelligence';
import { planFusionBundle } from '@domain/recovery-fusion-intelligence';
import type { FusionPlanCommand } from '@domain/recovery-fusion-intelligence';
import { runBatchPlans } from '@service/recovery-fusion-orchestrator';
import { buildCommandEvent, routeCommand } from '@service/recovery-fusion-orchestrator';

export interface UseRecoveryFusionCoordinatorResult {
  readonly tenant: string;
  readonly runId: string;
  readonly planId: string;
  readonly accepted: boolean;
  readonly planResult?: FusionPlanResult;
  readonly error?: string;
  readonly busy: boolean;
  readonly commands: readonly string[];
  readonly execute: () => Promise<void>;
  readonly executeCommand: (command: FusionPlanCommand) => Promise<void>;
  readonly clear: () => void;
}

interface CoordinationState {
  readonly tenant: string;
  readonly planId: string;
  readonly runId: string;
  readonly accepted: boolean;
  readonly commandLog: readonly string[];
  readonly planResult?: FusionPlanResult;
}

const buildDummyRequest = (tenant: string, planId: string, runId: string) => ({
  planId: withBrand(planId, 'RunPlanId'),
  runId: withBrand(runId, 'RecoveryRunId'),
  waves: [] as const,
  signals: [],
  budget: {
    maxParallelism: 2,
    maxRetries: 4,
    timeoutMinutes: 30,
    operatorApprovalRequired: false,
  },
});

export const useRecoveryFusionCoordinator = (): UseRecoveryFusionCoordinatorResult => {
  const [tenant, setTenant] = useState('global');
  const [planId, setPlanId] = useState('fusion-plan-main');
  const [runId, setRunId] = useState('fusion-run-main');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [state, setState] = useState<CoordinationState>({
    tenant,
    planId,
    runId,
    accepted: false,
    commandLog: [],
  });

  const execute = useCallback(async () => {
    setBusy(true);
    setError(undefined);
    try {
      const request = buildDummyRequest(tenant, planId, runId);
      const repo = new InMemoryRecoveryOperationsRepository();
      void repo;

      const service = new RecoveryFusionOrchestrator({
        context: {
          tenant,
          zone: 'us-east',
          owner: 'operator-console',
          planIdPrefix: `${tenant}-${planId}`,
        },
        store: new InMemoryFusionStore(),
        bus: new NoopFusionBus(),
        constraint: request.budget,
      });

      const parsed = planFusionBundle(request);
      if (!parsed.ok) {
        throw new Error(parsed.error.message);
      }

      const cycle = await service.run(request);
      if (!cycle.ok) {
        throw new Error(cycle.error.message);
      }

      const batch = await runBatchPlans(
        {
          runId: request.runId,
          plans: [request],
        },
        {
          context: {
            tenant,
            zone: 'us-east',
            owner: 'operator-console',
            planIdPrefix: `${tenant}-${planId}`,
          },
          store: new InMemoryFusionStore(),
          bus: new NoopFusionBus(),
        },
      );
      if (!batch.ok) {
        throw new Error(batch.error.message);
      }

      setState({
        tenant,
        planId,
        runId,
        accepted: parsed.value.accepted,
        commandLog: [...state.commandLog, `accepted=${cycle.value.accepted}`, `batch=${batch.value.accepted}`],
        planResult: parsed.value,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Coordinator failure');
      setState((previous) => ({
        ...previous,
        commandLog: [...previous.commandLog, `error=${String(caught)}`],
      }));
    } finally {
      setBusy(false);
    }
  }, [tenant, planId, runId, state.commandLog]);

  const executeCommand = useCallback(
    async (command: FusionPlanCommand) => {
      setBusy(true);
      setError(undefined);
      try {
        const serviceStore = new InMemoryFusionStore();
        const serviceBus = new NoopFusionBus();
        const event = buildCommandEvent(
          {
            runId: command.runId,
            waveId: command.targetWaveId,
            command: command.command,
            reason: command.reason,
          },
          {
            tenant,
            zone: 'us-east',
            owner: 'operator-console',
            planIdPrefix: `${tenant}-${planId}`,
          },
        );
        const sent = await serviceBus.send(event);
        if (!sent.ok) {
          throw new Error(sent.error);
        }
        const routed = await routeCommand(serviceStore, serviceBus, {
          tenant,
          zone: 'us-east',
          owner: 'operator-console',
          planIdPrefix: `${tenant}-${planId}`,
        }, command);
        if (!routed.ok) {
          throw new Error(routed.error.message);
        }
        setState((previous) => ({
          ...previous,
          commandLog: [...previous.commandLog, `command:${command.command}:${command.targetWaveId}`],
        }));
      } finally {
        setBusy(false);
      }
    },
    [tenant, planId],
  );

  const clear = useCallback(() => {
    setTenant('global');
    setPlanId('fusion-plan-main');
    setRunId('fusion-run-main');
    setState({
      tenant: 'global',
      planId: 'fusion-plan-main',
      runId: 'fusion-run-main',
      accepted: false,
      commandLog: [],
    });
    setError(undefined);
  }, []);

  return useMemo(
    () => ({
      tenant,
      runId,
      planId,
      accepted: state.accepted,
      planResult: state.planResult,
      error,
      busy,
      commands: state.commandLog,
      execute,
      executeCommand,
      clear,
    }),
    [tenant, runId, planId, state.accepted, state.planResult, state.commandLog, error, busy, execute, executeCommand, clear],
  );
};
