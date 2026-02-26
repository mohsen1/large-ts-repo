import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FlowCommand, FlowCommandId, LatticeInput } from '@domain/recovery-lab-stress-lab-core';
import {
  type BoardBuckets,
  type StressBoardInput,
  type StressCommandDraft,
  type StressControlPanelConfig,
  type StressControlPanelState,
  type StressPanelMode,
  type StressRunId,
  type StressRunSeed,
  bucketCommands,
  defaultStressPanelConfig,
  toRoute,
} from '../types';
import { executeFlow } from '@domain/recovery-lab-stress-lab-core/src/flow-control-graph';
import { evaluateLattice } from '@domain/recovery-lab-stress-lab-core/src/class-lattice';

const seed = (tenant: string, mode: StressPanelMode, route: string, index: number): StressRunSeed => ({
  tenant: `${tenant}` as StressRunSeed['tenant'],
  mode,
  route: toRoute(tenant, route, mode),
  weight: (index + 1) * 11,
});

export interface UseStressControlStudioResult {
  readonly state: StressControlPanelState;
  readonly setMode: (mode: StressPanelMode) => void;
  readonly refresh: () => void;
  readonly run: () => Promise<void>;
  readonly config: StressControlPanelConfig;
  readonly buckets: BoardBuckets<['low', 'medium', 'high']>;
}

export const useStressControlStudio = (tenant: string, mode: StressPanelMode): UseStressControlStudioResult => {
  const [state, setState] = useState<StressControlPanelState>(() => {
    const seeds: StressRunSeed[] = [
      seed(tenant, mode, 'orchestration', 0),
      seed(tenant, mode, 'continuity', 1),
      seed(tenant, mode, 'telemetry', 2),
      seed(tenant, mode, 'policy', 3),
      seed(tenant, mode, 'simulation', 4),
    ];
    return {
      mode,
      runId: `${tenant}-${mode}-run` as StressRunId,
      seed: seeds[0]!,
      running: false,
      commands: seeds.map((entry, index): StressCommandDraft => ({
        id: `cmd-${tenant}-${index}-${entry.route}` as FlowCommandId,
        tenant: `${tenant}` as StressRunSeed['tenant'],
        route: entry.route,
        active: true,
        severity: ((index + 1) * 2) as StressCommandDraft['severity'],
      })),
      lattice: [],
      latticeInput: [],
      refreshToken: 0,
    };
  });
  const [config, setConfig] = useState<StressControlPanelConfig>(defaultStressPanelConfig(tenant));

  const commandsForMode = useMemo(() => {
    if (mode === 'audit') {
      return state.commands.filter((command) => command.severity > 7);
    }
    if (mode === 'trace') {
      return [...state.commands].filter((command) => command.severity >= 4);
    }
    return state.commands;
  }, [mode, state.commands]);

  const commandBuckets = useMemo(() => bucketCommands(commandsForMode), [commandsForMode]);

  const latticeInput = useMemo<readonly LatticeInput[]>(() => {
    const out: LatticeInput[] = [];
    for (let index = 0; index < state.commands.length; index += 1) {
      const command = state.commands[index];
      if (!command) {
        continue;
      }
      out.push({
        tenant: `${tenant}-${command.severity}` as unknown as LatticeInput['tenant'],
        mode: index % 3 === 0 ? 'discovery' : index % 3 === 1 ? 'validation' : 'execution',
        route: command.route as unknown as LatticeInput['route'],
        limit: Math.max(config.batchSize * (index + 1), 3),
      });
    }
    return out;
  }, [config.batchSize, state.commands, tenant]);

  const run = useCallback(async () => {
    setState((prev) => ({ ...prev, running: true }));
    const flowInputs = state.commands.map((command, index): FlowCommand => {
      const severity = ((index + command.severity) % 10) as FlowCommand['severity'];
      return {
      commandId: command.id,
      phase: index % 8 === 0 ? 'init' : index % 8 === 1 ? 'dispatch' : index % 8 === 2 ? 'validate' : index % 8 === 3 ? 'coordinate' : index % 8 === 4 ? 'execute' : index % 8 === 5 ? 'sweep' : index % 8 === 6 ? 'finalize' : 'done',
      domain: index % 2 === 0 ? 'fabric' : index % 3 === 0 ? 'cadence' : index % 3 === 1 ? 'quantum' : 'ops',
      domainIndex: index,
      severity,
      };
    });
    const score = executeFlow(flowInputs);
    const lattice = evaluateLattice(latticeInput);

    setState((prev) => ({
      ...prev,
      running: false,
      lattice,
      latticeInput,
      refreshToken: prev.refreshToken + score + lattice.length,
      seed: seed(tenant, mode, `run-${score}`, 0),
    }));
  }, [latticeInput, mode, state.commands, tenant]);

  const refresh = useCallback(() => {
    setState((prev) => ({
      ...prev,
      refreshToken: prev.refreshToken + 1,
      seed: seed(tenant, mode, `refresh-${Date.now()}`, prev.refreshToken),
    }));
  }, [mode, tenant]);

  const setMode = useCallback(
    (nextMode: StressPanelMode) => {
      setConfig((previous) => ({
        ...previous,
        ...(nextMode === 'audit' ? { includeAudit: true, includeSimulation: false } : {}),
        ...(nextMode === 'planner' ? { batchSize: 8, includeSimulation: true } : {}),
      }));
      setState((prev) => ({
        ...prev,
        mode: nextMode,
      }));
    },
    [],
  );

  useEffect(() => {
    if (state.commands.length === 0) {
      setState((prev) => ({
        ...prev,
        commands: [
          {
            id: `${tenant}:seed` as FlowCommandId,
            tenant: `${tenant}` as StressRunSeed['tenant'],
            route: toRoute(tenant, 'seed', mode),
            active: true,
            severity: 1,
          },
        ],
      }));
    }
  }, [mode, state.commands.length, tenant]);

  useEffect(() => {
    const interval = setInterval(() => {
      refresh();
    }, 15000);
    return () => clearInterval(interval);
  }, [refresh]);

  return {
    state,
    setMode,
    refresh,
    run,
    config,
    buckets: commandBuckets,
  };
};
