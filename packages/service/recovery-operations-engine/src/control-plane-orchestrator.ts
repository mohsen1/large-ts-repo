import { withBrand } from '@shared/core';
import type { Result } from '@shared/result';
import { ok, fail } from '@shared/result';
import { buildManifest, manifestFromRoute, buildRouteForManifest, toExternalEnvelope } from '@domain/recovery-operations-control-plane';
import type { ControlPlaneManifest, ControlPlanePlanInput, ControlPlaneRunId } from '@domain/recovery-operations-control-plane';
import { InMemoryControlPlaneStore } from '@data/recovery-operations-control-plane-store';
import type { RunPlanSnapshot } from '@domain/recovery-operations-models';
import type { RecoveryProgram } from '@domain/recovery-orchestration';

export interface ControlPlaneOrchestratorDeps {
  readonly store: InMemoryControlPlaneStore;
  readonly tenant: string;
}

export interface ControlPlaneOrchestrateInput {
  readonly runId: ControlPlaneRunId;
  readonly tenant: string;
  readonly store: InMemoryControlPlaneStore;
  readonly planId: RunPlanSnapshot['id'];
  readonly program: RecoveryProgram;
  readonly snapshot: RunPlanSnapshot;
  readonly signals: readonly unknown[];
}

export interface ControlPlaneOrchestrateOutput {
  readonly runId: string;
  readonly manifestId: string;
  readonly snapshotId: string;
  readonly routeTopic: string;
  readonly persisted: boolean;
}

const resolvePlanInput = (input: ControlPlaneOrchestrateInput): ControlPlanePlanInput => ({
  runId: withBrand(input.planId, 'RunPlanId'),
  program: input.program,
  snapshot: input.snapshot,
  window: {
    from: new Date(Date.now() - 60_000).toISOString(),
    to: new Date().toISOString(),
    timezone: 'UTC',
  },
  priority: input.program.priority,
  tenant: input.tenant,
  urgency: input.program.mode === 'emergency' ? 'reactive' : 'planned',
});

export const buildControlPlaneManifest = async (input: ControlPlaneOrchestrateInput): Promise<ControlPlaneManifest> => {
  const planInput = resolvePlanInput(input);
  const manifest = await buildManifest(
    String(input.runId),
    planInput,
    input.signals as never,
  );
  return manifest;
};

export const routeManifest = (manifest: ControlPlaneManifest): string => {
  const route = buildRouteForManifest(manifest, 'recovery-ops');
  return route.topic;
}

export const runControlPlaneOrchestrator = async (
  input: ControlPlaneOrchestrateInput,
): Promise<Result<ControlPlaneOrchestrateOutput, string>> => {
  const planInput = resolvePlanInput(input);
  const manifest = await buildManifest(String(input.runId), planInput, input.signals as never);
  const persisted = await input.store.save(manifest);

  if (!persisted.ok) {
    return fail(persisted.error ?? 'persist-failed');
  }

  const route = routeManifest(manifest);
  const envelope = toExternalEnvelope(manifest);
  manifestFromRoute({
    routeId: String(input.runId),
    topic: route,
    tenant: input.tenant,
    payload: envelope,
  });

  return ok({
    runId: String(input.runId),
    manifestId: manifest.envelopeId,
    snapshotId: String(input.snapshot.id),
    routeTopic: route,
    persisted: persisted.ok,
  });
};
