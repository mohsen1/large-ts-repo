import { useCallback, useMemo, useState, type ReactElement } from 'react';
import type { LatticeOrchestratorMode, LatticeOrchestratorRequest } from '@service/recovery-lattice-orchestrator';
import {
  createLatticeOrchestrator,
  type LatticeOrchestratorResult,
  runPlannerDryRun,
} from '@service/recovery-lattice-orchestrator';
import { withLatticeSession, makeSessionConfig } from '@domain/recovery-lattice';
import { asTenantId, asRouteId, type LatticeBlueprintManifest, type LatticeTenantId } from '@domain/recovery-lattice';

export type CommandPayload = {
  readonly id: string;
  readonly name: string;
  readonly mode: LatticeOrchestratorMode;
  readonly blueprintId: string;
  readonly routeId: string;
  readonly status: 'queued' | 'running' | 'done' | 'failed';
};

export type CommandState = {
  readonly tenantId: LatticeTenantId;
  readonly mode: LatticeOrchestratorMode;
  readonly commands: readonly CommandPayload[];
  readonly activeIds: readonly string[];
  readonly hasFailure: boolean;
  readonly lastResult: LatticeOrchestratorResult | null;
};

export interface CommandRunner {
  readonly commandId: string;
  readonly result: LatticeOrchestratorResult | Error | null;
  readonly startedAt: string;
  readonly completedAt?: string;
}

export const useLatticeCommand = (
  tenantId: string,
): {
  readonly commandState: CommandState;
  readonly queueCommand: (blueprint: LatticeBlueprintManifest, mode: LatticeOrchestratorMode) => Promise<void>;
  readonly clear: () => void;
  readonly runners: readonly CommandRunner[];
} => {
  const [commands, setCommands] = useState<readonly CommandPayload[]>([]);
  const [runners, setRunners] = useState<readonly CommandRunner[]>([]);
  const [lastResult, setLastResult] = useState<LatticeOrchestratorResult | null>(null);
  const [activeIds, setActiveIds] = useState<readonly string[]>([]);

  const tenant = useMemo(() => asTenantId(tenantId), [tenantId]);

  const queueCommand = useCallback(
    async (blueprint: LatticeBlueprintManifest, mode: LatticeOrchestratorMode): Promise<void> => {
      const commandId = `cmd:${tenantId}:${Date.now().toString(36)}`;
      const routeId = asRouteId(`route:${tenantId}:${mode}:${blueprint.version}:${commands.length}`);

      const base: CommandPayload = {
        id: commandId,
        name: `${mode}:${blueprint.name}`,
        mode,
        blueprintId: String(blueprint.blueprintId),
        routeId: String(routeId),
        status: 'queued',
      };

      setCommands((prior) => [...prior, base]);
      setActiveIds((prior) => [...prior, commandId]);
      setRunners((prior) => [
        ...prior,
        {
          commandId,
          result: null,
          startedAt: new Date().toISOString(),
        },
      ]);

      const orchestrator = await createLatticeOrchestrator({
        tenantId: tenant,
        namespace: `lattice-cmd-${tenantId}`,
      });

      const request: LatticeOrchestratorRequest = {
        tenantId: tenant,
        routeId,
        mode,
        blueprint,
        payload: {
          commandId,
          mode,
          routeId,
        },
      };

      try {
        const outcome = await orchestrator.run(request);
        await withLatticeSession(makeSessionConfig(tenant), async () => Promise.resolve('command'));
        const dryRun = await runPlannerDryRun(blueprint, request.payload, mode);
        setLastResult(outcome);
        setCommands((prior) =>
          prior.map((item) => (item.id === commandId ? { ...item, status: outcome.status === 'completed' ? 'done' : 'failed' } : item)),
        );
        setRunners((prior) =>
          prior.map((runner) =>
            runner.commandId === commandId
              ? {
                  ...runner,
                  result: { ...outcome, error: outcome.error },
                  completedAt: new Date().toISOString(),
                }
              : runner,
          ),
        );
      } catch (error) {
        setCommands((prior) => prior.map((item) => (item.id === commandId ? { ...item, status: 'failed' } : item)));
        setRunners((prior) =>
          prior.map((runner) => (runner.commandId === commandId ? { ...runner, result: error as Error } : runner)),
        );
        setLastResult(null);
      } finally {
        setActiveIds((prior) => prior.filter((item) => item !== commandId));
      }
    },
    [commands.length, tenant, tenantId],
  );

  const clear = useCallback(() => {
    setCommands([]);
    setRunners([]);
    setActiveIds([]);
    setLastResult(null);
  }, []);

  const hasFailure = useMemo(
    () => runners.some((runner) => typeof runner.result !== 'object' || runner.result instanceof Error),
    [runners],
  );

  return {
    commandState: {
      tenantId: tenant,
      mode: commands[commands.length - 1]?.mode ?? 'analysis',
      commands,
      activeIds,
      hasFailure,
      lastResult,
    },
    queueCommand,
    clear,
    runners,
  };
};
