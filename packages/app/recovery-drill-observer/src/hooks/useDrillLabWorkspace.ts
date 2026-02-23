import { useCallback, useEffect, useMemo, useState } from 'react';
import { createRepository } from '@data/recovery-drill-lab-store';
import {
  buildSummaryLine,
  describeRiskBand,
  type DrillRunQuery,
  type DrillRunSnapshot,
  type DrillRunStatus,
  type DrillWorkspaceId,
  type DrillScenarioId,
} from '@domain/recovery-drill-lab';
import { withBrand } from '@shared/core';

interface WorkspaceSignals {
  readonly query: DrillRunQuery;
  readonly snapshots: readonly DrillRunSnapshot[];
  readonly mode: 'idle' | 'loading' | 'failed';
  readonly summaries: readonly string[];
  readonly commandCount: number;
  readonly refresh: () => void;
  readonly toggle: () => void;
  readonly updateStatuses: (status?: DrillRunStatus) => void;
}

const toWorkspaceId = (value: string): DrillWorkspaceId => withBrand(value, 'DrillWorkspaceId');
const toScenarioId = (value: string): DrillScenarioId => withBrand(value, 'DrillScenarioId');

export const useDrillLabWorkspace = (workspaceId: string, scenarioId: string): WorkspaceSignals => {
  const [mode, setMode] = useState<WorkspaceSignals['mode']>('idle');
  const [query, setQuery] = useState<DrillRunQuery>({
    workspaceId: toWorkspaceId(workspaceId),
    scenarioId: toScenarioId(scenarioId),
  });
  const [snapshots, setSnapshots] = useState<readonly DrillRunSnapshot[]>([]);

  const repository = useMemo(() => createRepository(), []);

  const refresh = useCallback(() => {
    setMode('loading');
    const found = repository.listRuns(query);
    setSnapshots(found);
    setMode('idle');
  }, [query, repository]);

  const toggle = useCallback(() => {
    setMode((current) => (current === 'idle' ? 'loading' : 'idle'));
  }, []);

  useEffect(() => {
    if (!workspaceId || !scenarioId) {
      setMode('failed');
      return;
    }

    const next: DrillRunQuery = {
      workspaceId: toWorkspaceId(workspaceId),
      scenarioId: toScenarioId(scenarioId),
    };
    setQuery(next);
    refresh();
  }, [workspaceId, scenarioId, refresh]);

  const updateStatuses = useCallback((status?: DrillRunStatus) => {
    setQuery((current) => ({
      ...current,
      status: status ? [status] : undefined,
    }));
  }, []);

  const summaries = useMemo(
    () =>
      snapshots.map((snapshot) => {
        const summary = buildSummaryLine(snapshot);
        return `${summary.scenario} ${snapshot.id} health=${summary.healthScore} risk=${summary.riskScore} band=${describeRiskBand(100 - summary.riskScore)} status=${summary.status}`;
      }),
    [snapshots],
  );

  return {
    query,
    snapshots,
    mode,
    summaries,
    commandCount: snapshots.length,
    refresh,
    toggle,
    updateStatuses,
  };
};
