import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { withBrand } from '@shared/core';
import type { ForgeExecutionReport, ForgeScenario, ForgeRuntimeConfig } from '@domain/recovery-command-forge';
import { buildExecutionReport } from '@domain/recovery-command-forge';
import type { RunSession, RunPlanSnapshot, RecoverySignal } from '@domain/recovery-operations-models';
import type { RecoveryReadinessPlan, ReadinessSloProfile } from '@domain/recovery-readiness';
import type { ForgeNode } from '@domain/recovery-command-forge';

export interface UseRecoveryCommandForgeWorkspaceParams {
  readonly tenant: string;
  readonly readinessPlan: RecoveryReadinessPlan;
  readonly session: RunSession;
  readonly planSnapshot: RunPlanSnapshot;
  readonly signals: readonly RecoverySignal[];
  readonly slaProfile: ReadinessSloProfile;
}

export interface RecoveryCommandForgeState {
  readonly tenant: string;
  readonly busy: boolean;
  readonly report?: ForgeExecutionReport;
  readonly simulationSummary: string;
  readonly error?: string;
}

export interface RecoveryCommandForgeWorkspace {
  readonly state: RecoveryCommandForgeState;
  readonly run: () => void;
  readonly reset: () => void;
  readonly planNodes: readonly ForgeNode[];
  readonly signalCount: number;
}

const defaultNodes = (): ForgeNode[] => [
  {
    id: 'default-init',
    label: 'Initialize command context',
    commandType: 'control-plane',
    expectedDurationMinutes: 10,
    ownerTeam: 'recovery-control',
    dependencies: [],
    resourceTags: ['bootstrap'],
  },
  {
    id: 'default-validate',
    label: 'Validate readiness assumptions',
    commandType: 'readiness-check',
    expectedDurationMinutes: 14,
    ownerTeam: 'recovery-control',
    dependencies: [
      {
        dependencyId: withBrand('dep-default-validate', 'RecoveryForgeDependencyId'),
        dependencyName: 'init-ready',
        criticality: 4,
        coupling: 0.75,
      },
    ],
    resourceTags: ['validation'],
  },
];

const buildScenario = ({ tenant, readinessPlan, session, planSnapshot, signals, slaProfile }: UseRecoveryCommandForgeWorkspaceParams): ForgeScenario => ({
  tenant,
  readinessPlan,
  session,
  planSnapshot,
  signals,
  budget: {
    parallelismLimit: 4,
    retryLimit: 2,
    maxDurationMinutes: 120,
    approvalRequired: true,
  },
  slaProfile,
});

export const useRecoveryCommandForgeWorkspace = ({ tenant, readinessPlan, session, planSnapshot, signals, slaProfile }: UseRecoveryCommandForgeWorkspaceParams): RecoveryCommandForgeWorkspace => {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ForgeExecutionReport>();
  const [summary, setSummary] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const scenario = useMemo<ForgeScenario>(() => buildScenario({ tenant, readinessPlan, session, planSnapshot, signals, slaProfile }), [tenant, readinessPlan, session, planSnapshot, signals, slaProfile]);
  const baseNodes = useMemo<readonly ForgeNode[]>(() => defaultNodes(), []);

  const run = useCallback(() => {
    setBusy(true);
    setError(undefined);
    try {
      const forgeReport = buildExecutionReport(tenant, scenario, {
        defaultUrgency: scenario.slaProfile.windowMinutes < 45 ? 'critical' : 'urgent',
        maxBudgetMinutes: scenario.budget.maxDurationMinutes,
        minConfidence: 60,
        policyGateEnabled: true,
      } as Partial<ForgeRuntimeConfig>);
      setReport(forgeReport);
      setSummary(`${forgeReport.policy.summary} | score=${forgeReport.policy.riskScore}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to run recovery command forge');
    } finally {
      setBusy(false);
    }
  }, [tenant, scenario]);

  const reset = useCallback(() => {
    setBusy(false);
    setReport(undefined);
    setSummary('');
    setError(undefined);
  }, []);

  return {
    state: {
      tenant,
      busy,
      report,
      simulationSummary: summary,
      error,
    },
    run,
    reset,
    planNodes: baseNodes,
    signalCount: signals.length,
  };
};
