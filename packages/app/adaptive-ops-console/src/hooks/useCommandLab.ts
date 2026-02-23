import { useCallback, useMemo, useState } from 'react';
import { type CommandTemplateOptions } from '@domain/incident-command-core';
import { CommandLabOrchestrator } from '@service/recovery-incident-command-orchestrator';
import type { CommandLabDraft, CommandLabRun } from '@service/recovery-incident-command-orchestrator';

export interface CommandLabFilter {
  readonly tenantId: string;
  readonly templateHints: readonly string[];
  readonly maxParallelism: number;
  readonly minimumReadinessScore: number;
  readonly maxRiskScore: number;
  readonly includeRollbackWindowMinutes: number;
}

export interface CommandLabState {
  readonly loading: boolean;
  readonly filter: CommandLabFilter;
  readonly snapshot: readonly string[];
  readonly candidates: readonly string[];
  readonly order: readonly string[];
  readonly runLog: readonly string[];
  readonly drafts: readonly CommandLabDraft[];
  readonly runs: readonly CommandLabRun[];
}

const defaultFilter: CommandLabFilter = {
  tenantId: 'tenant-a',
  templateHints: ['readiness', 'rollback', 'escalate'],
  maxParallelism: 3,
  minimumReadinessScore: 6,
  maxRiskScore: 8,
  includeRollbackWindowMinutes: 30,
};

const templateSeed = (tenantId: string, templateHints: readonly string[]): string =>
  `${tenantId}-${templateHints.join('-') || 'default'}`;

export const useCommandLab = (initialFilter: CommandLabFilter = defaultFilter) => {
  const [filter, setFilter] = useState<CommandLabFilter>(initialFilter);
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<readonly string[]>([]);
  const [candidates, setCandidates] = useState<readonly string[]>([]);
  const [order, setOrder] = useState<readonly string[]>([]);
  const [runLog, setRunLog] = useState<readonly string[]>([]);
  const [drafts, setDrafts] = useState<readonly CommandLabDraft[]>([]);
  const [runs, setRuns] = useState<readonly CommandLabRun[]>([]);

  const setTenant = useCallback((tenantId: string) => {
    setFilter((current) => ({ ...current, tenantId }));
  }, []);
  const setHints = useCallback((templateHints: readonly string[]) => {
    setFilter((current) => ({ ...current, templateHints }));
  }, []);
  const setMaxParallelism = useCallback((maxParallelism: number) => {
    setFilter((current) => ({ ...current, maxParallelism }));
  }, []);
  const setRollbackWindow = useCallback((includeRollbackWindowMinutes: number) => {
    setFilter((current) => ({ ...current, includeRollbackWindowMinutes }));
  }, []);
  const setReadinessCutoff = useCallback((minimumReadinessScore: number) => {
    setFilter((current) => ({ ...current, minimumReadinessScore }));
  }, []);
  const setRiskCutoff = useCallback((maxRiskScore: number) => {
    setFilter((current) => ({ ...current, maxRiskScore }));
  }, []);

  const labOrchestrator = useMemo(
    () => CommandLabOrchestrator.create(filter.tenantId, 'adaptive-ops-console'),
    [filter.tenantId],
  );

  const runTemplate = useCallback(async () => {
    setLoading(true);
    const options: CommandTemplateOptions = {
      includeNotifyOnly: filter.templateHints.length > 0,
      maxParallelism: filter.maxParallelism,
      minimumReadinessScore: filter.minimumReadinessScore,
      maxRiskScore: filter.maxRiskScore,
      includeRollbackWindowMinutes: filter.includeRollbackWindowMinutes,
    };

    try {
      const templateId = templateSeed(filter.tenantId, filter.templateHints);
      const draft = await labOrchestrator.draft(templateId, options);
      if (!draft.ok) {
        setSnapshot((current) => [...current, `draft-failed:${draft.error.message}`].slice(0, 40));
        return;
      }

      setSnapshot((current) => [
        `draft-ok:${draft.value.runId}`,
        `summary:${draft.value.snapshot}`,
        `tenant=${filter.tenantId}`,
        ...current,
      ].slice(0, 40));
      setCandidates(draft.value.candidates);
      setOrder(draft.value.order);
      setDrafts((current) => [...current, draft.value].slice(0, 8));
      setRunLog((current) => [
        `tenant=${filter.tenantId}`,
        `candidates=${draft.value.candidates.length}`,
        `order=${draft.value.order.join(',')}`,
        ...current,
      ].slice(0, 40));
    } finally {
      setLoading(false);
    }
  }, [filter, labOrchestrator]);

  const runExecute = useCallback(async () => {
    setLoading(true);
    try {
      const execution = await labOrchestrator.execute({
        planId: `${filter.tenantId}:${Date.now()}` as any,
        tenantId: filter.tenantId,
        commandIds: [...candidates],
        force: false,
      });
      if (!execution.ok) {
        setRunLog((current) => [...current, `execute-failed:${execution.error.message}`].slice(0, 40));
        return;
      }

      setRuns((current) => [
        ...current,
        {
          runId: execution.value.runId,
          tenantId: filter.tenantId,
          commandIds: [...execution.value.commandIds],
          catalog: [...execution.value.catalog],
          audits: [...execution.value.audits],
        },
      ].slice(0, 8));
      setRunLog((current) => [...current, `execute-ok:${execution.value.runId}`].slice(0, 40));
    } finally {
      setLoading(false);
    }
  }, [filter.tenantId, labOrchestrator, candidates]);

  const refreshSummary = useCallback(async () => {
    const plans = await labOrchestrator.surfaceState();
    if (plans.ok) {
      setRunLog((current) => [...current, ...plans.value.slice(0, 3)].slice(0, 60));
    }
  }, [labOrchestrator]);

  const clearState = useCallback(() => {
    setSnapshot([]);
    setCandidates([]);
    setOrder([]);
    setRunLog([]);
    setDrafts([]);
    setRuns([]);
  }, []);

  return {
    state: {
      loading,
      filter,
      snapshot,
      candidates,
      order,
      runLog,
      drafts,
      runs,
    },
    setTenant,
    setHints,
    setMaxParallelism,
    setRollbackWindow,
    setReadinessCutoff,
    setRiskCutoff,
    runTemplate,
    runExecute,
    refreshSummary,
    clearState,
  };
};
