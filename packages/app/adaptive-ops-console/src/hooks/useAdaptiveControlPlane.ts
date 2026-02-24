import { useCallback, useEffect, useMemo, useState } from 'react';
import { withBrand } from '@shared/core';
import {
  runControlPlaneEngine,
  buildDiagnostic,
  type EngineOutput,
} from '@domain/recovery-operations-control-plane';
import type {
  ControlPlanePlanInput,
  ControlPlaneRoute,
  ControlPlaneManifest,
  ControlPlanePlan,
  ControlPlaneRunId,
} from '@domain/recovery-operations-control-plane';

export interface ControlPlaneFilters {
  tenant: string;
  urgency: 'reactive' | 'planned' | 'defensive';
  lookbackMinutes: number;
  maxRoutes: number;
}

export interface ControlPlaneRow {
  id: string;
  status: 'idle' | 'running' | 'errored' | 'done';
  commandCount: number;
  gateCount: number;
}

interface ControlPlaneState {
  running: boolean;
  summary: ControlPlaneFilters;
  rows: readonly ControlPlaneRow[];
  manifest: ControlPlaneManifest | null;
  plan: ControlPlanePlan | null;
  timeline: readonly ControlPlaneRoute[];
  logs: readonly string[];
  lastError: string | null;
}

const baseInput = (tenant: string): ControlPlanePlanInput => {
  const now = new Date().toISOString();
  const earlier = new Date(Date.now() - 15 * 60_000).toISOString();
  return {
    runId: withBrand(`run-${tenant}`, 'RunPlanId'),
    tenant,
    urgency: 'planned',
    program: {
      id: withBrand(`program-${tenant}`, 'RecoveryProgramId'),
      tenant: withBrand(tenant, 'TenantId'),
      service: withBrand(`${tenant}-svc`, 'ServiceId'),
      name: 'console-control-plane',
      description: 'adaptive control plane scenario',
      priority: 'silver',
      mode: 'defensive',
      window: {
        startsAt: earlier,
        endsAt: now,
        timezone: 'UTC',
      },
      topology: {
        rootServices: [`${tenant}-root`],
        fallbackServices: [`${tenant}-fallback`],
        immutableDependencies: [[`${tenant}-root`, `${tenant}-fallback`]],
      },
      constraints: [
        {
          name: 'defensive-min-threads',
          operator: 'lte',
          threshold: 20,
          description: 'default defensive cap',
        },
      ],
      steps: [],
      owner: 'adaptive-console',
      tags: ['console'],
      createdAt: now,
      updatedAt: now,
    },
    snapshot: {
      id: withBrand(`snapshot-${tenant}`, 'RunPlanId'),
      name: 'console-snapshot',
      program: {
        id: withBrand(`program-${tenant}`, 'RecoveryProgramId'),
        tenant: withBrand(tenant, 'TenantId'),
        service: withBrand(`${tenant}-svc`, 'ServiceId'),
        name: 'console-control-plane',
        description: 'adaptive control plane scenario',
        priority: 'silver',
        mode: 'defensive',
        window: {
          startsAt: earlier,
          endsAt: now,
          timezone: 'UTC',
        },
        topology: {
          rootServices: [`${tenant}-root`],
          fallbackServices: [`${tenant}-fallback`],
          immutableDependencies: [[`${tenant}-root`, `${tenant}-fallback`]],
        },
        constraints: [
          {
            name: 'defensive-min-threads',
            operator: 'lte',
            threshold: 20,
            description: 'default defensive cap',
          },
        ],
        steps: [],
        owner: 'adaptive-console',
        tags: ['console'],
        createdAt: now,
        updatedAt: now,
      },
      constraints: {
        maxParallelism: 8,
        maxRetries: 1,
        timeoutMinutes: 60,
        operatorApprovalRequired: false,
      },
      fingerprint: {
        tenant: withBrand(tenant, 'TenantId'),
        region: 'global',
        serviceFamily: 'recovery',
        impactClass: 'application',
        estimatedRecoveryMinutes: 22,
      },
      sourceSessionId: withBrand(`session-${tenant}`, 'RunSessionId'),
      effectiveAt: now,
    },
    window: {
      from: earlier,
      to: now,
      timezone: 'UTC',
    },
    priority: 'silver',
  } satisfies ControlPlanePlanInput;
};

export const useAdaptiveControlPlane = (initialFilters: ControlPlaneFilters = {
  tenant: 'tenant-a',
  urgency: 'defensive',
  lookbackMinutes: 15,
  maxRoutes: 12,
}) => {
  const [state, setState] = useState<ControlPlaneState>({
    running: false,
    summary: initialFilters,
    rows: [],
    manifest: null,
    plan: null,
    timeline: [],
    logs: [],
    lastError: null,
  });

  const setTenant = useCallback((tenant: string) => {
    setState((current) => ({
      ...current,
      summary: {
        ...current.summary,
        tenant,
      },
    }));
  }, []);

  const setUrgency = useCallback((urgency: ControlPlaneFilters['urgency']) => {
    setState((current) => ({
      ...current,
      summary: {
        ...current.summary,
        urgency,
      },
    }));
  }, []);

  const setLookback = useCallback((lookbackMinutes: number) => {
    setState((current) => ({
      ...current,
      summary: {
        ...current.summary,
        lookbackMinutes: Math.max(1, Math.floor(lookbackMinutes)),
      },
    }));
  }, []);

  const setMaxRoutes = useCallback((maxRoutes: number) => {
    setState((current) => ({
      ...current,
      summary: {
        ...current.summary,
        maxRoutes: Math.max(1, Math.floor(maxRoutes)),
      },
    }));
  }, []);

  const clear = useCallback(() => {
    setState((current) => ({
      ...current,
      manifest: null,
      plan: null,
      timeline: [],
      rows: [],
      logs: ['state reset'],
      lastError: null,
    }));
  }, []);

  const planInput = useMemo(() => {
    const base = baseInput(state.summary.tenant);
    const from = new Date(Date.now() - state.summary.lookbackMinutes * 60_000).toISOString();
    const to = new Date().toISOString();
    return {
      ...base,
      urgency: state.summary.urgency,
      window: {
        from,
        to,
        timezone: 'UTC',
      },
      snapshot: {
        ...base.snapshot,
        id: withBrand(`${base.snapshot.id}-${state.summary.lookbackMinutes}`, 'RunPlanId'),
      },
    } satisfies ControlPlanePlanInput;
  }, [state.summary]);

  const run = useCallback(async () => {
    setState((current) => ({
      ...current,
      running: true,
      logs: [...current.logs, `run.start ${state.summary.tenant}`],
      lastError: null,
    }));

    try {
      const report = (await runControlPlaneEngine(planInput, {
        runId: String(planInput.runId),
        constraints: {
          commandDensity: async () => true,
          hasCommands: () => planInput.program.steps.length >= 0,
        },
        pluginCount: Math.max(1, state.summary.maxRoutes),
      })) as EngineOutput;

      const diagnostics = buildDiagnostic(report);
      const rows: readonly ControlPlaneRow[] = report.routes.slice(0, state.summary.maxRoutes).map((entry, index) => ({
        id: String(entry.routeId),
        status: report.report.warnings.length > index ? 'done' : 'done',
        commandCount: report.plan.commands.length,
        gateCount: report.plan.gates.length,
      })) as readonly ControlPlaneRow[];

      setState((current) => ({
        ...current,
        running: false,
        manifest: report.manifest,
        plan: report.plan,
        timeline: report.routes,
        rows,
        logs: [...current.logs, `run.complete routes=${diagnostics.length}`, `report.score=${report.report.score}`],
      }));
    } catch (error) {
      setState((current) => ({
        ...current,
        running: false,
        lastError: error instanceof Error ? error.message : String(error),
        logs: [...current.logs, 'run failed'],
      }));
    }
  }, [planInput, state.summary.tenant, state.summary.maxRoutes, state.summary]);

  useEffect(() => {
    void run();
  }, [state.summary.tenant]);

  const runSummary = useMemo(() => {
    const summaryRoutes = state.timeline.length;
    return `tenant=${state.summary.tenant} routes=${summaryRoutes} plugins=${summaryRoutes}`;
  }, [state.summary.tenant, state.timeline]);

  return {
    state,
    run,
    clear,
    setTenant,
    setUrgency,
    setLookback,
    setMaxRoutes,
    runSummary,
  } satisfies {
    state: ControlPlaneState;
    run: () => Promise<void>;
    clear: () => void;
    setTenant: (tenant: string) => void;
    setUrgency: (urgency: ControlPlaneFilters['urgency']) => void;
    setLookback: (lookbackMinutes: number) => void;
    setMaxRoutes: (maxRoutes: number) => void;
    runSummary: string;
  };
};
