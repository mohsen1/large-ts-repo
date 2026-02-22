import { withBrand } from '@shared/core';
import type { RecoveryPriority, RecoveryProgram } from '@domain/recovery-orchestration';
import type { RunPlanSnapshot } from '@domain/recovery-operations-models';
import { buildPlanBlueprint, buildManifest, manifestFromSchedule } from './manifest';
import { computeSchedule } from './scheduling';
import { parseManifest, parsePlan, parseWindow } from './schema';
import type {
  ControlPlaneCheckpoint,
  ControlPlaneManifest,
  ControlPlanePlan,
  ControlPlanePlanInput,
  ControlPlaneRoute,
  PlanSchedule,
} from './types';

export interface ExternalControlPlaneEnvelope {
  readonly id: string;
  readonly tenant: string;
  readonly kind: string;
  readonly payload: unknown;
  readonly createdAt: string;
}

export const toExternalEnvelope = (
  manifest: ControlPlaneManifest,
): ExternalControlPlaneEnvelope => ({
  id: manifest.envelopeId,
  tenant: manifest.tenant,
  kind: 'control-plane.manifest',
  payload: manifest,
  createdAt: manifest.createdAt,
});

export const fromExternalEnvelope = (input: ExternalControlPlaneEnvelope): ControlPlaneManifest =>
  parseManifest(input.payload);

const normalizeTenant = (tenant: string): string => tenant.toLowerCase();

export const controlPlanToRoute = (input: {
  tenant: string;
  planId: string;
  namespace: string;
}): ControlPlaneRoute => ({
  routeId: withBrand(`${input.tenant}:${input.planId}`, 'ControlPlaneRunId'),
  topic: `${input.namespace}.recovery.operations.plan.${input.tenant}`,
  tenant: input.tenant,
  payload: {
    planId: input.planId,
    issuedAt: new Date().toISOString(),
  },
});

export const buildRouteForManifest = (manifest: ControlPlaneManifest, namespace: string): ControlPlaneRoute =>
  controlPlanToRoute({ tenant: manifest.tenant, planId: String(manifest.run), namespace });

export const asPlanInput = (
  program: RecoveryProgram,
  snapshot: RunPlanSnapshot,
  tenant: string,
  priority?: RecoveryPriority,
): ControlPlanePlanInput => ({
  runId: snapshot.id,
  program,
  snapshot,
  window: {
    from: new Date(Date.now() - 30 * 60_000).toISOString(),
    to: new Date().toISOString(),
    timezone: 'UTC',
  },
  priority: priority ?? program.priority,
  tenant,
  urgency: 'planned',
});

export const blueprintToManifest = (plan: ControlPlanePlan): ControlPlaneManifest => {
  const timeline: ControlPlaneManifest['timeline'] = plan.commands.map((command, index) => ({
    at: new Date(Date.now() + index * 5_000).toISOString(),
    stage: index % 4 === 0 ? 'prepare' : index % 4 === 1 ? 'execute' : index % 4 === 2 ? 'verify' : 'closeout',
    event: `command-${String(command.id)}`,
    tags: ['blueprint'],
  }));

  const checkpoints: readonly ControlPlaneCheckpoint[] = plan.commands.map((command, index) => ({
    id: withBrand(`${String(command.id)}-${index}`, 'ControlPlaneArtifactId'),
    runId: command.runId,
    commandId: command.id,
    stage: index % 4 === 0 ? 'prepare' : index % 4 === 1 ? 'execute' : index % 4 === 2 ? 'verify' : 'closeout',
    status: index % 2 === 0 ? 'completed' : 'pending',
    startedAt: new Date(Date.now() + index * 1000).toISOString(),
    details: {
      command: command.command,
      payload: command.payload,
    },
  }));

  return {
    envelopeId: withBrand(`${String(plan.id)}-manifest`, 'ControlPlaneEnvelopeId'),
    tenant: 'default',
    run: plan.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    plan,
    checkpoints,
    timeline,
  };
};

export const planFromInput = (input: { runId: string; tenant: string; program: RecoveryProgram; snapshot: RunPlanSnapshot }): ControlPlanePlan =>
  buildPlanBlueprint(asPlanInput(input.program, input.snapshot, input.tenant));

export const manifestFromInput = async (
  input: {
    runId: string;
    tenant: string;
    program: RecoveryProgram;
    snapshot: RunPlanSnapshot;
    signals: readonly unknown[];
  },
): Promise<ControlPlaneManifest> =>
  buildManifest(input.runId, asPlanInput(input.program, input.snapshot, input.tenant), input.signals as never);

export const parseRoutePayload = (input: unknown): ControlPlaneRoute => {
  const route = input as { routeId?: string; topic?: string; tenant?: string; payload?: unknown };
  return {
    routeId: normalizeTenant(String(route.routeId ?? 'default')),
    topic: normalizeTenant(String(route.topic ?? 'control-plane')),
    tenant: normalizeTenant(String(route.tenant ?? 'default')),
    payload: route.payload,
  };
};

export const buildPlanSchedule = (program: RecoveryProgram): PlanSchedule => {
  const schedule = computeSchedule({
    runId: withBrand(`${program.id}-schedule`, 'ControlPlaneRunId'),
    program,
    timezone: 'UTC',
    minimumCadenceMinutes: 15,
    maxConcurrent: 4,
  });

  return {
    planId: withBrand(program.id, 'RunPlanId'),
      windows: schedule.windows.map(parseWindow),
      cadenceMinutes: schedule.windows.length === 0 ? 0 : 4,
  };
};

export const manifestFromRoute = (route: ControlPlaneRoute): ControlPlaneManifest => {
  const payload = route.payload as { planId?: string; program?: RecoveryProgram; snapshot?: RunPlanSnapshot; tenant?: string; runId?: string };
  if (!payload.program || !payload.snapshot) {
    return {
      envelopeId: withBrand(`${route.routeId}-fallback`, 'ControlPlaneEnvelopeId'),
      tenant: route.tenant,
      run: withBrand(`${route.routeId}`, 'ControlPlaneRunId'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      plan: parsePlan({
        id: route.routeId,
        programId: `${route.routeId}-program`,
        snapshotId: `${route.routeId}-snapshot`,
        commands: [],
        graph: { runId: `${route.routeId}-graph`, nodes: [], edges: [], rootNodes: [], terminalNodes: [] },
        gates: [route.topic],
        window: { from: new Date().toISOString(), to: new Date().toISOString(), timezone: 'UTC' },
      } as never),
      checkpoints: [],
      timeline: [
        {
          at: new Date().toISOString(),
          stage: 'verify',
          event: `missing payload for ${route.routeId}`,
          tags: ['fallback'],
        },
      ],
    };
  }

  return manifestFromSchedule(withBrand(`${route.routeId}-fallback`, 'RunPlanId'), {
    runId: withBrand(`${route.routeId}-run`, 'ControlPlaneRunId'),
    scheduleId: withBrand(`${route.routeId}-schedule`, 'ControlPlaneEnvelopeId'),
    windows: buildPlanSchedule(payload.program).windows,
    conflicts: [],
    maxConcurrent: 3,
  });
};
