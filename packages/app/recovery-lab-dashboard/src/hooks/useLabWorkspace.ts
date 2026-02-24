import { useEffect, useMemo, useState } from 'react';
import {
  type LabExecution,
  type LabExecutionResult,
  type LabPlanTemplate,
  type LabScenario,
  WorkflowAssembler,
} from '@domain/recovery-simulation-lab-core';
import { MemoryRecoveryLabStore } from '@data/recovery-lab-simulation-store';
import { RecoveryLabRuntime } from '@service/recovery-lab-orchestrator';
import { asLabTenantId } from '@shared/recovery-lab-kernel';

export interface LabWorkspaceState {
  readonly loading: boolean;
  readonly scenarios: readonly LabScenario[];
  readonly selectedScenarioId: string;
  readonly executions: readonly LabExecution[];
  readonly selectedExecutionId: string | null;
  readonly logs: readonly string[];
  readonly latestResult: LabExecutionResult | null;
  readonly refresh: () => void;
}

const store = new MemoryRecoveryLabStore();
const runtime = new RecoveryLabRuntime(store, [(event, payload) => {
  void payload;
  void event;
}]);

export const useLabWorkspace = (tenant: string): LabWorkspaceState => {
  const [loading, setLoading] = useState(true);
  const [scenarios, setScenarios] = useState<readonly LabScenario[]>([]);
  const [executions, setExecutions] = useState<readonly LabExecution[]>([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState('');
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [latestResult, setLatestResult] = useState<LabExecutionResult | null>(null);
  const [logs, setLogs] = useState<readonly string[]>([]);
  const tenantId = useMemo(() => asLabTenantId(tenant), [tenant]);

  const assembler = useMemo(() => new WorkflowAssembler({
    tenant: tenantId,
    scenarios,
    plans: [],
  }, 'strict'), [tenantId, scenarios]);

  const refresh = async (): Promise<void> => {
    setLoading(true);
    const snapshot = await store.queryStore({ tenant });
    setScenarios(snapshot.scenarios);

    const runEntries: LabExecution[] = [];
    for (const id of snapshot.runIds) {
      const run = await store.runs.getRun(tenant, id);
      if (run) {
        runEntries.push(run);
      }
    }
    setExecutions(runEntries);

    const selected = runEntries[0]?.executionId ?? null;
    setSelectedExecutionId(selected);

    if (selected) {
      const result = await store.results.getResult(tenant, selected);
      setLatestResult(result);
    }

    if (scenarios.length === 0 && snapshot.scenarios.length > 0) {
      setSelectedScenarioId(snapshot.scenarios[0]?.scenarioId ?? '');
    }

    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, [tenant]);

  useEffect(() => {
    if (!selectedScenarioId && scenarios[0]) {
      setSelectedScenarioId(scenarios[0].scenarioId);
    }
  }, [scenarios, selectedScenarioId]);

  const logsMemo = useMemo(() => {
    const seen = new Map<string, number>();
    const entries = logs.slice(0, 20);
    for (const entry of entries) {
      seen.set(entry, (seen.get(entry) ?? 0) + 1);
    }
    return [...seen.entries()].map(([message, count]) => `${message} x${count}`);
  }, [logs]);

  useEffect(() => {
    if (!selectedScenarioId) {
      return;
    }

    const scenario = scenarios.find((entry) => entry.scenarioId === selectedScenarioId);
    if (!scenario) {
      return;
    }

    const routeMap = assembler.buildExecutionMap();
    const plans: readonly LabPlanTemplate[] = [];
    void runtime.bootstrap(tenantId, scenario, plans[0] ?? null);
    setLogs((previous) => [...previous, `loaded:${selectedScenarioId}`, ...[...routeMap.keys()]]);
  }, [selectedScenarioId, assembler, tenant, scenarios]);

  return {
    loading,
    scenarios,
    selectedScenarioId,
    executions,
    selectedExecutionId,
    logs: logsMemo,
    latestResult,
    refresh: () => {
      void refresh();
    },
  };
};
