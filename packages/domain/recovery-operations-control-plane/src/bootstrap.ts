import { withBrand } from '@shared/core';
import type {
  RecoveryProgram,
  RecoveryProgramId,
  RecoveryPriority,
  RecoveryConstraint,
  RecoveryTopology,
  RecoveryWindow,
} from '@domain/recovery-orchestration';
import type { Brand } from '@shared/type-level';
import type { RecoverySignal, RunPlanSnapshot } from '@domain/recovery-operations-models';
import type { ControlPlaneRoute, ControlPlanePlanInput, PlanSchedule } from './types';
import { runControlPlaneEngine, buildDiagnostic } from './engine';
import { buildPlanSchedule } from './adapters';
import type { RunPlanId } from '@domain/recovery-operations-models';

type UrgencyMode = 'reactive' | 'planned' | 'defensive';

interface BootstrapPlanInput {
  readonly planId: string;
  readonly tenant: string;
  readonly urgency: UrgencyMode;
  readonly lookbackMinutes: number;
}

const buildRouteFromSeed = async function* (seed: string) {
  for (let index = 0; index < 3; index += 1) {
    const topic = `${seed}-${index}`;
    const routeId = withBrand(`${seed}-${index}-${Date.now()}`, 'ControlPlaneRoute');
    yield {
      routeId,
      topic,
      tenant: seed,
      payload: {
        position: index,
        seed: topic,
      },
    } satisfies ControlPlaneRoute;
    await Promise.resolve();
  }
};

const collectRoutes = async (seed: string): Promise<readonly ControlPlaneRoute[]> => {
  const out: ControlPlaneRoute[] = [];
  for await (const route of buildRouteFromSeed(seed)) {
    out.push(route);
  }
  return out;
};

export const bootstrapRuntime = {
  project: 'recovery-operations-control-plane',
  environment: 'UTC',
  maxInFlight: 16,
} as const;

const createWindow = (from: string, to: string): { readonly startsAt: string; readonly endsAt: string; readonly timezone: string } => ({
  startsAt: from,
  endsAt: to,
  timezone: bootstrapRuntime.environment,
});

const createTopology = (tenant: string): RecoveryTopology => ({
  rootServices: [`${tenant}-root`],
  fallbackServices: [`${tenant}-fallback`],
  immutableDependencies: [[`svc:${tenant}-a`, `svc:${tenant}-b`]],
});

const createProgram = (planId: string, tenant: string): RecoveryProgram => ({
  id: withBrand(`program-${planId}`, 'RecoveryProgramId'),
  tenant: withBrand(tenant, 'TenantId'),
  service: withBrand(`${tenant}-service`, 'ServiceId'),
  name: 'bootstrap',
  description: 'bootstrap recovery control program',
  priority: 'silver',
  mode: 'defensive',
  window: {
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 3600_000).toISOString(),
    timezone: bootstrapRuntime.environment,
  },
  topology: createTopology(tenant),
  constraints: [
    {
      name: 'bootstrap-cap',
      operator: 'lte',
      threshold: 32,
      description: 'bootstrap constraints',
    },
  ],
  steps: [
    {
      id: 'bootstrap-step-1',
      title: 'Collect diagnostics',
      command: 'snapshot',
      timeoutMs: 3_000,
      dependencies: [],
      requiredApprovals: 0,
      tags: ['bootstrap', 'runtime'],
    },
  ],
  owner: 'bootstrap-runtime',
  tags: ['bootstrap'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const createSnapshot = (planId: string, program: RecoveryProgram): RunPlanSnapshot => {
  const now = new Date().toISOString();
  return {
    id: withBrand(`snapshot-${planId}`, 'RunPlanId'),
    name: `snapshot-${planId}`,
    program,
    constraints: {
      maxParallelism: 2,
      maxRetries: 1,
      timeoutMinutes: 15,
      operatorApprovalRequired: false,
    },
    fingerprint: {
      tenant: withBrand(program.tenant, 'TenantId'),
      region: 'us-east-1',
      serviceFamily: 'recovery',
      impactClass: 'infrastructure',
      estimatedRecoveryMinutes: 12,
    },
    sourceSessionId: withBrand(`bootstrap-session-${planId}`, 'RunSessionId'),
    effectiveAt: now,
  };
};

export const bootstrapPlanInput = (input: BootstrapPlanInput): ControlPlanePlanInput => {
  const from = new Date(Date.now() - input.lookbackMinutes * 60_000).toISOString();
  const to = new Date().toISOString();
  const program = createProgram(input.planId, input.tenant);
  const snapshot = createSnapshot(input.planId, program);

  return {
    runId: snapshot.id,
    tenant: input.tenant,
    urgency: input.urgency,
    program,
    snapshot,
    window: {
      from,
      to,
      timezone: bootstrapRuntime.environment,
    },
    priority: 'silver',
  };
};

export const bootstrapManifest = async (input: BootstrapPlanInput) => {
  const runtimeInput = bootstrapPlanInput(input);
  return runControlPlaneEngine(runtimeInput, {
    runId: String(runtimeInput.runId),
    constraints: {
      runtimeGate: async () => true,
    },
    pluginCount: bootstrapRuntime.maxInFlight,
  });
};

export const bootstrapDiagnostics = async () => {
  const manifest = await bootstrapManifest({
    planId: bootstrapRuntime.project,
    tenant: 'tenant-a',
    urgency: 'planned',
    lookbackMinutes: 15,
  });

  return {
    project: bootstrapRuntime.project,
    routeCount: (await collectRoutes(bootstrapRuntime.project)).length,
    warningCount: buildDiagnostic(manifest).length,
    env: bootstrapRuntime.environment,
    schedule: (((): PlanSchedule | undefined => {
      const schedule = buildPlanSchedule(createProgram(bootstrapRuntime.project, 'tenant-a'));
      const windows: PlanSchedule['windows'] =
        schedule.windows as PlanSchedule['windows'];
      return windows.length > 0
        ? {
            planId: withBrand(bootstrapRuntime.project, 'RunPlanId'),
            windows,
            cadenceMinutes: schedule.cadenceMinutes,
          }
        : undefined;
    })()),
  };
};
