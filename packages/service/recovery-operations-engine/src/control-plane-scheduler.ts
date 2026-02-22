import { withBrand } from '@shared/core';
import { fail, ok, type Result } from '@shared/result';
import type { ControlPlaneConstraint, ControlPlaneEnvelopeId, ControlPlaneManifest, ControlPlaneRunId } from '@domain/recovery-operations-control-plane';
import { buildManifest, evaluateRunConstraints, computeSchedule, normalizeScheduleWindows } from '@domain/recovery-operations-control-plane';
import type { InMemoryControlPlaneStore } from '@data/recovery-operations-control-plane-store';
import type { RunPlanSnapshot } from '@domain/recovery-operations-models';
import type { RecoveryProgram } from '@domain/recovery-orchestration';

export interface ScheduleInput {
  readonly tenant: string;
  readonly runId: ControlPlaneRunId;
  readonly planId: RunPlanSnapshot['id'];
  readonly program: RecoveryProgram;
  readonly snapshot: RunPlanSnapshot;
  readonly signals: readonly unknown[];
  readonly store: InMemoryControlPlaneStore;
}

export interface ScheduleResult {
  readonly scheduleId: ControlPlaneEnvelopeId;
  readonly runId: string;
  readonly conflicts: readonly string[];
  readonly manifest: ControlPlaneManifest;
}

const asControlConstraint = (tenant: string, limit: number): ControlPlaneConstraint => ({
  kind: 'strict',
  name: `${tenant}:signal-cap`,
  limit,
  warningThreshold: Math.max(1, Math.floor(limit * 0.75)),
});

const dedupe = (items: readonly string[]): string[] => {
  const set = new Set(items);
  return [...set];
};

const buildInput = (input: ScheduleInput) => ({
  runId: withBrand(input.planId, 'RunPlanId'),
  program: input.program,
  snapshot: input.snapshot,
  window: {
    from: new Date(Date.now() - 10 * 60_000).toISOString(),
    to: new Date().toISOString(),
    timezone: 'UTC',
  },
  priority: input.program.priority,
  tenant: input.tenant,
  urgency: input.program.mode === 'emergency' ? ('reactive' as const) : ('defensive' as const),
});

export const buildSchedulePlan = async (input: ScheduleInput): Promise<ScheduleResult> => {
  const planInput = buildInput(input);
  const manifest = await buildManifest(String(input.runId), planInput, input.signals as never);
  const schedule = computeSchedule({
    runId: input.runId,
    program: input.program,
    timezone: 'UTC',
    minimumCadenceMinutes: 4,
    maxConcurrent: 2,
  });
  const windows = normalizeScheduleWindows({
    planId: planInput.snapshot.id,
    windows: schedule.windows,
    cadenceMinutes: 4,
  });
  const conflicts = windows.flatMap((window, index) =>
    window.label.includes('conflict') ? [`${index}-${window.label}`] : [],
  );

  return {
    scheduleId: withBrand(`${input.runId}-schedule`, 'ControlPlaneEnvelopeId'),
    runId: String(input.runId),
    conflicts: dedupe(conflicts),
    manifest,
  };
};

export const executeSchedule = async (input: ScheduleInput): Promise<Result<ScheduleResult, string>> => {
  const planInput = buildInput(input);
  const policy = evaluateRunConstraints(
    {
      tenant: input.tenant,
      run: {
        id: withBrand(String(input.runId), 'RunSessionId'),
        runId: withBrand(String(input.planId), 'RecoveryRunId'),
        ticketId: withBrand(`${input.planId}-ticket`, 'RunTicketId'),
        planId: input.planId,
        status: 'warming',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        constraints: {
          maxParallelism: input.program.steps.length,
          maxRetries: 2,
          timeoutMinutes: 90,
          operatorApprovalRequired: false,
        },
        signals: [],
      },
      signals: input.signals as never,
      constraints: [asControlConstraint(input.tenant, 12)],
      urgency: 'defensive',
    },
    {},
  );

  const decision = await policy;
  if (!decision.allowed) {
    return fail('policy blocked');
  }

  const manifest = await buildManifest(String(input.runId), planInput, input.signals as never);
  const persisted = await input.store.save(manifest);
  if (!persisted.ok) {
    return fail('store-failed');
  }

  return ok({
    scheduleId: withBrand(`${input.runId}-plan`, 'ControlPlaneEnvelopeId'),
    runId: String(input.runId),
    conflicts: manifest.plan.gates.filter((gate) => gate.includes('warn')),
    manifest,
  });
};
