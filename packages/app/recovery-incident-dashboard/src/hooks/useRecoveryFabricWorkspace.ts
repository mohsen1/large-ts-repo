import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildRunMetrics,
  buildOperationDigest,
  summarizeCommandPlan,
  computeRunHealth,
  inspectManifest,
} from '@service/recovery-fabric-controller';
import type {
  FabricExecutionContext,
  FabricManifest,
  FabricPolicy,
  FabricPlan,
  FabricPlan as FabricPlanType,
  FabricRun,
} from '@domain/recovery-fabric-orchestration';

export interface FabricWorkspaceCommand {
  readonly commandId: string;
  readonly name: string;
  readonly priority: number;
}

export interface FabricWorkspaceState {
  readonly policies: readonly FabricPolicy[];
  readonly plans: readonly FabricPlanType[];
  readonly selectedPolicyId: string | null;
  readonly selectedPlanIndex: number | null;
  readonly isLoading: boolean;
  readonly lastDigest: string;
  readonly runHealth: number;
  readonly activeRuns: readonly FabricRun[];
  readonly warnings: readonly string[];
  readonly commandDeck: readonly FabricWorkspaceCommand[];
}

interface FabricWorkspaceActions {
  readonly refresh: () => Promise<void>;
  readonly selectPolicy: (policyId: string | null) => void;
  readonly selectPlan: (planIndex: number | null) => void;
  readonly runDigest: () => Promise<void>;
  readonly summarizePlan: () => Promise<void>;
}

interface StoreLike {
  readonly listPolicies?: () => Promise<unknown>;
  readonly listPlans?: () => Promise<unknown>;
  readonly listRuns?: () => Promise<unknown>;
}

const castArray = (value: unknown): unknown[] => {
  return Array.isArray(value) ? value : [];
};

const toPolicies = (value: unknown): readonly FabricPolicy[] => {
  return castArray(value).map((candidate, index) => ({
    id: `policy-${index}` as never,
    tenantId: 'tenant-fabric' as never,
    name: `policy-${index}`,
    description: `recovery policy ${index}`,
    readinessThreshold: 'warm',
    riskTolerance: 'amber',
    maxParallelism: 2,
    maxRetries: 1,
    windowHours: { min: 1, max: 8 },
    gates: [],
  }));
};

const toPlans = (value: unknown): readonly FabricPlan[] => {
  return castArray(value).map((candidate, index) => {
    const planId = `plan-${index}`;
    const command = {
      id: (`${planId}-command-0` as never),
      tenantId: 'tenant-fabric' as never,
      incidentId: ('incident-fabric' as never),
      name: 'recovery command',
      priority: 1 as 1 | 2 | 3 | 4 | 5,
      blastRadius: 1,
      estimatedRecoveryMinutes: 30,
      strategy: 'serial' as const,
      constraints: [],
      runbook: [],
      context: { planId },
      requiresApprovals: 0,
      requiresWindows: [
        {
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 2_400_000).toISOString(),
          timezone: 'UTC',
        },
      ],
    };

    const plan: FabricPlanType = {
      tenantId: 'tenant-fabric' as never,
      policyId: (`policy-${index}` as never),
      fabricId: (`fabric-${planId}` as never),
      commands: [command],
      topology: {
        commandIds: [command.id],
        edges: [],
        zones: {
          serial: [command.id],
          parallel: [],
          staged: [],
        } as unknown as Record<string, never[]>,
        metadata: { planId },
      },
    };

    return plan;
  });
};

const toRuns = (value: unknown): readonly FabricRun[] => {
  return castArray(value).map((candidate, index) => ({
    id: (`run-${index}`) as never,
    tenantId: 'tenant-fabric' as never,
    fabricId: `fabric-${index}` as never,
    policyId: `policy-${index}` as never,
    incidentId: `incident-${index}` as never,
    commandIds: [`plan-${index}-command-0` as never],
    startedAt: new Date().toISOString(),
    status: 'queued',
    readinessBand: 'warm',
    riskBand: 'amber',
    windows: [
      {
        startsAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 2_000_000).toISOString(),
        timezone: 'UTC',
      },
    ],
  }));
};

const emptyState: FabricWorkspaceState = {
  policies: [],
  plans: [],
  selectedPolicyId: null,
  selectedPlanIndex: null,
  isLoading: false,
  lastDigest: '',
  runHealth: 100,
  activeRuns: [],
  warnings: [],
  commandDeck: [],
};

export const useRecoveryFabricWorkspace = (store: StoreLike): FabricWorkspaceState &
  FabricWorkspaceActions & { readonly selectedPlan: FabricPlan | null; readonly selectedPlanIndexLabel: string } => {
  const [state, setState] = useState<FabricWorkspaceState>(emptyState);

  const refresh = useCallback(async () => {
    setState((current) => ({ ...current, isLoading: true, warnings: [] }));

    try {
      const listPolicies = store.listPolicies ?? (async () => []);
      const listPlans = store.listPlans ?? (async () => []);
      const listRuns = store.listRuns ?? (async () => []);

      const [policies, plans, runs] = await Promise.all([listPolicies(), listPlans(), listRuns()]);
      const typedPolicies = toPolicies(policies);
      const typedPlans = toPlans(plans);
      const typedRuns = toRuns(runs);

      const commandDeck = typedPlans
        .flatMap((plan) =>
          plan.commands.map((command) => ({
            commandId: command.id,
            name: command.name,
            priority: command.priority,
          })),
        );

      const runHealth = computeRunHealth(typedRuns);

      setState((current) => ({
        ...current,
        isLoading: false,
        policies: typedPolicies,
        plans: typedPlans,
        activeRuns: typedRuns,
        commandDeck,
        runHealth,
        warnings: [],
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        isLoading: false,
        warnings: [...current.warnings, error instanceof Error ? error.message : 'refresh failed'],
      }));
    }
  }, [store]);

  const selectPolicy = useCallback((policyId: string | null) => {
    setState((current) => ({ ...current, selectedPolicyId: policyId }));
  }, []);

  const selectPlan = useCallback((planIndex: number | null) => {
    setState((current) => ({ ...current, selectedPlanIndex: planIndex }));
  }, []);

  const runDigest = useCallback(async () => {
    const policy = state.policies.find((candidate) => candidate.id === state.selectedPolicyId);
    const plan = state.selectedPlanIndex !== null ? state.plans[state.selectedPlanIndex] : null;
    if (!policy || !plan) {
      setState((current) => ({ ...current, warnings: [...current.warnings, 'select policy and plan first'] }));
      return;
    }

    const manifest: FabricManifest = {
      id: `manifest-${policy.id}` as never,
      tenantId: policy.tenantId,
      sourceProgram: {
        id: `program-${plan.fabricId}` as never,
        tenant: policy.tenantId,
        service: 'fabric-service' as never,
        name: `${policy.name}-program`,
        description: policy.description,
        priority: 'silver',
        mode: 'defensive',
        window: plan.commands[0]?.requiresWindows[0] ?? {
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 2_400_000).toISOString(),
          timezone: 'UTC',
        },
        topology: {
          rootServices: [String(plan.policyId)],
          fallbackServices: [],
          immutableDependencies: [],
        },
        constraints: [],
        steps: [],
        owner: 'orchestrator',
        tags: ['manifest'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      plan,
      policy,
      run: state.activeRuns[0] ?? null,
      snapshots: [],
    };

    try {
      const digest = await buildOperationDigest(manifest, store);
      setState((current) => ({
        ...current,
        lastDigest: digest,
        warnings: [...current.warnings, ...inspectManifest(manifest)],
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        warnings: [...current.warnings, error instanceof Error ? error.message : 'digest failed'],
      }));
    }
  }, [store, state.activeRuns, state.policies, state.plans, state.selectedPolicyId, state.selectedPlanIndex]);

  const summarizePlan = useCallback(async () => {
    const policy = state.policies.find((candidate) => candidate.id === state.selectedPolicyId);
    const plan = state.selectedPlanIndex !== null ? state.plans[state.selectedPlanIndex] : null;
    if (!policy || !plan || state.activeRuns.length === 0) {
      setState((current) => ({
        ...current,
        warnings: [...current.warnings, 'missing policy/plan or active run'],
      }));
      return;
    }

    const context: FabricExecutionContext = {
      tenantId: policy.tenantId,
      fabricId: plan.fabricId,
      program: {
        id: `program-${plan.fabricId}` as never,
        tenant: policy.tenantId,
        service: 'fabric-service' as never,
        name: 'fabric-program',
        description: 'summary context',
        priority: 'bronze',
        mode: 'preventive',
        window: {
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 2_400_000).toISOString(),
          timezone: 'UTC',
        },
        topology: { rootServices: [plan.fabricId], fallbackServices: [], immutableDependencies: [] },
        constraints: [],
        steps: [],
        owner: 'orchestrator',
        tags: ['summary'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      incident: state.activeRuns[0] as never,
      policy,
      signals: [],
      runStates: state.activeRuns as never,
    };

    const commandMap = new Map(plan.commands.map((command) => [command.id, command]));
    const summary = summarizeCommandPlan(
      plan,
      policy,
      commandMap,
    );
    const topCommands = summary.selectedCommandIds.slice(0, 5);

    setState((current) => ({
      ...current,
      runHealth: Math.min(100, current.runHealth + topCommands.length),
      warnings: [
        ...current.warnings,
        `Selected ${topCommands.length} command(s) ready for execution`,
        `Readiness band ${summary.readinessBand}`,
        ...summary.warnings,
      ],
    }));

    if (context.runStates.length > 0) {
      const firstRun = context.runStates[0] as unknown;
      const metrics = buildRunMetrics(firstRun as FabricRun);
      setState((current) => ({
        ...current,
        warnings: [...current.warnings, `Active run has ${Math.round(metrics.timelineMinutes)} minutes planned`],
      }));
    }
  }, [state.activeRuns, state.policies, state.plans, state.selectedPolicyId, state.selectedPlanIndex]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectedPlan = state.selectedPlanIndex !== null ? state.plans[state.selectedPlanIndex] ?? null : null;

  return {
    ...state,
    selectedPlan,
    selectedPlanIndexLabel: state.selectedPlanIndex === null ? 'none' : `#${state.selectedPlanIndex}`,
    refresh,
    selectPolicy,
    selectPlan,
    runDigest,
    summarizePlan,
  };
};
