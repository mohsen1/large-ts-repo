import { useCallback, useMemo, useState } from 'react';
import { AdaptiveAction, AdaptivePolicy, AdaptiveDecision } from '@domain/adaptive-ops';
import { AdaptiveOpsOrchestrator, type CommandResult } from '@service/adaptive-ops-orchestrator';
import type { SignalKind } from '@domain/adaptive-ops';
import { UiRunSummary, UiPolicyRecord, UiActionRecord } from '../types';

interface SignalDraft {
  kind: SignalKind;
  value: number;
  unit: string;
  at: string;
}

export interface AdaptiveOpsRunFilter {
  tenantId: string;
  windowMs: number;
  maxActions: number;
  dryRun: boolean;
  policySearch: string;
}

export interface AdaptiveOpsDashboardState {
  running: boolean;
  summaries: readonly UiRunSummary[];
  policies: readonly AdaptivePolicy[];
  selectedPolicies: readonly AdaptivePolicy[];
  errors: readonly string[];
  lastError: string | null;
}

export const defaultFilter: AdaptiveOpsRunFilter = {
  tenantId: 'tenant-a',
  windowMs: 300000,
  maxActions: 8,
  dryRun: false,
  policySearch: '',
};

const mockPolicies: AdaptivePolicy[] = [
  {
    id: 'policy-1' as never,
    tenantId: 'tenant-a' as never,
    name: 'Primary route protection',
    active: true,
    dependencies: [],
    window: {
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 3_600_000).toISOString(),
      zone: 'utc',
    },
    allowedSignalKinds: ['error-rate', 'availability'],
    driftProfile: {
      dimensions: ['error-rate', 'latency'],
      expectedDirection: 'up',
      threshold: 1,
      tolerance: 0.2,
    },
  },
  {
    id: 'policy-2' as never,
    tenantId: 'tenant-a' as never,
    name: 'Latency guardrails',
    active: true,
    dependencies: [],
    window: {
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 3_600_000).toISOString(),
      zone: 'utc',
    },
    allowedSignalKinds: ['latency', 'cost-variance'],
  },
];

const toSummary = (
  tenantId: string,
  run: CommandResult,
): UiRunSummary => {
  const decisions = run.plan?.decisions ?? [];
  return {
    tenantId,
    ok: run.ok,
    runId: run.plan?.runId ?? undefined,
    status: run.ok ? 'queued' : 'failed',
    decisionCount: decisions.length,
    topActionType: run.plan?.topAction?.type ?? null,
    conflictCount: run.ok
      ? new Set(decisions.flatMap((decision: AdaptiveDecision) => decision.selectedActions.map((action: AdaptiveAction) => action.type))).size
      : 0,
    policyNames: [...new Set(decisions.map((decision) => decision.policyId))],
  };
};

export const useAdaptiveOpsDashboard = (initialFilter: AdaptiveOpsRunFilter = defaultFilter) => {
  const [filter, setFilter] = useState<AdaptiveOpsRunFilter>(initialFilter);
  const [selectedPolicies, setSelectedPolicies] = useState<readonly AdaptivePolicy[]>(mockPolicies);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [running, setRunning] = useState(false);
  const [summaries, setSummaries] = useState<readonly UiRunSummary[]>([]);

  const clearErrors = useCallback(() => setErrors([]), []);
  const togglePolicy = useCallback((policyId: string) => {
    setSelectedPolicies((current) =>
      current.some((policy: AdaptivePolicy) => policy.id === policyId)
        ? current.filter((policy: AdaptivePolicy) => policy.id !== policyId)
        : [...current, mockPolicies.find((policy: AdaptivePolicy) => policy.id === policyId)].filter((policy): policy is AdaptivePolicy => policy !== undefined),
    );
  }, []);

  const setWindowMs = useCallback((windowMs: number) => {
    setFilter((current) => ({
      ...current,
        windowMs,
    }));
  }, []);

  const setDryRun = useCallback((dryRun: boolean) => {
    setFilter((current) => ({
      ...current,
      dryRun,
    }));
  }, []);

  const setMaxActions = useCallback((maxActions: number) => {
    setFilter((current) => ({
      ...current,
      maxActions,
    }));
  }, []);

  const state: AdaptiveOpsDashboardState = useMemo(
    () => ({
      running,
      summaries,
      policies: mockPolicies,
      selectedPolicies,
      errors,
      lastError: errors.at(-1) ?? null,
    }),
    [running, summaries, selectedPolicies, errors],
  );

  const execute = useCallback(async () => {
    setRunning(true);
    const orchestrator = AdaptiveOpsOrchestrator.create();
    const rows: readonly SignalDraft[] = [
      { kind: 'error-rate', value: 0.24, unit: 'ratio', at: new Date().toISOString() },
      { kind: 'latency', value: 230, unit: 'ms', at: new Date().toISOString() },
      { kind: 'availability', value: 99.1, unit: 'percent', at: new Date().toISOString() },
    ];

    try {
      const result = await orchestrator.execute({
        tenantId: filter.tenantId,
        windowMs: filter.windowMs,
        policies: selectedPolicies,
        dryRun: filter.dryRun,
        maxActions: filter.maxActions,
        signals: rows.map((row: SignalDraft) => ({ kind: row.kind, value: row.value, unit: row.unit, at: row.at })),
      });
      const nextSummary = toSummary(filter.tenantId, result);
      setSummaries((current) => [nextSummary, ...current].slice(0, 6));
      if (!result.ok) {
        setErrors((current) => [...current, result.error ?? 'execution failed']);
      }
    } catch (error) {
      setErrors((current) => [...current, error instanceof Error ? error.message : 'unknown']);
    } finally {
      setRunning(false);
    }
  }, [filter, selectedPolicies]);

  const actionCounts = useMemo(() => {
    const policyRecords = summaries.map<UiPolicyRecord>((summary: UiRunSummary) => ({
      policyId: summary.policyNames.join(',') || 'n/a',
      tenantId: summary.tenantId,
      confidence: summary.decisionCount,
    }));

    const actionRecords = summaries.flatMap<UiActionRecord>((summary: UiRunSummary) =>
      summary.policyNames.map((policyName) => ({
        type: summary.topActionType ?? 'none',
        intensity: summary.decisionCount,
        target: policyName,
        justification: 'aggregated',
      })),
    );

    return {
      policyRecords,
      actionRecords,
      decisionsInWindow: summaries.reduce((acc: number, summary: UiRunSummary) => acc + summary.decisionCount, 0),
      conflictsTotal: summaries.reduce((acc: number, summary: UiRunSummary) => acc + summary.conflictCount, 0),
    };
  }, [summaries]);

  return {
    state,
    filter,
    setWindowMs,
    setDryRun,
    setMaxActions,
    togglePolicy,
    execute,
    clearErrors,
    actionCounts,
  };
};
