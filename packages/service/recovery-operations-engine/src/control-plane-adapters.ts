import type { ControlPlaneManifest, ControlPlanePlanInput } from '@domain/recovery-operations-control-plane';
import { buildManifest, toExternalEnvelope } from '@domain/recovery-operations-control-plane';
import type { InMemoryControlPlaneStore } from '@data/recovery-operations-control-plane-store';
import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import { withBrand } from '@shared/core';
import type { RecoveryProgram } from '@domain/recovery-orchestration';
import type { RunPlanSnapshot } from '@domain/recovery-operations-models';

export interface ControlPlaneAdapterInput {
  readonly tenant: string;
  readonly runId: string;
  readonly program: RecoveryProgram;
  readonly snapshot: RunPlanSnapshot;
}

const defaultPlanInput = (input: ControlPlaneAdapterInput): ControlPlanePlanInput => ({
  runId: withBrand(input.snapshot.id, 'RunPlanId'),
  program: input.program,
  snapshot: input.snapshot,
  window: {
    from: new Date(Date.now() - 120_000).toISOString(),
    to: new Date().toISOString(),
    timezone: 'UTC',
  },
  priority: input.program.priority,
  tenant: input.tenant,
  urgency: 'planned',
});

export const buildManifestEnvelope = async (input: ControlPlaneAdapterInput): Promise<{ topic: string; payload: string }> => {
  const planInput = defaultPlanInput(input);
  const manifest = await buildManifest(String(input.runId), planInput, []);
  const envelope = toExternalEnvelope(manifest);
  return {
    topic: `recovery-operations.control-plane.${input.tenant}`,
    payload: JSON.stringify(envelope.payload),
  };
};

export const parseManifestFromEnvelope = (payload: string): ControlPlaneManifest => {
  return JSON.parse(payload) as ControlPlaneManifest;
};

export const parsePayloadToManifest = (payload: unknown): ControlPlaneManifest => {
  if (typeof payload === 'string') {
    return parseManifestFromEnvelope(payload);
  }
  return payload as ControlPlaneManifest;
};

export const publishManifest = async (input: ControlPlaneAdapterInput): Promise<{ topic: string; payload: string }> => {
  const serialized = toExternalEnvelope(await buildManifest(String(input.runId), defaultPlanInput(input), []));
  const payload = serialized.payload as ControlPlaneManifest;
  return {
    topic: `recovery-operations.control-plane.${input.tenant}`,
    payload: JSON.stringify(payload),
  };
};

export const persistManifest = async (
  store: InMemoryControlPlaneStore,
  manifest: ControlPlaneManifest,
): Promise<Result<boolean, string>> => {
  const result = await store.save(manifest);
  return result.ok ? ok(true) : fail('failed-to-save');
};
