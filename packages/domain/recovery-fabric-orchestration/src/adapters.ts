import type { RecoveryRunState, RecoveryWindow, RecoveryProgram } from '@domain/recovery-orchestration';
import type { IncidentRecord, IncidentId } from '@domain/incident-management';
import type { FabricCommand, FabricExecutionContext, FabricPolicy, FabricPlan, FabricManifest, FabricSignal, FabricPlanSnapshot, FabricRun } from './types';

export const adaptRecoveryToCommand = (record: RecoveryRunState, incident: IncidentRecord, window: RecoveryWindow): FabricCommand => {
  const commandId = `cmd-${record.runId}-${record.currentStepId ?? 'start'}` as never;
  const incidentId: IncidentId = incident.id;
  const priorityRaw = (record.estimatedRecoveryTimeMinutes % 5) + 1;
  return {
    id: commandId,
    tenantId: incident.tenantId,
    incidentId,
    name: `run:${record.runId}`,
    priority: Math.min(Math.max(priorityRaw, 1), 5) as 1 | 2 | 3 | 4 | 5,
    blastRadius: Math.max(record.estimatedRecoveryTimeMinutes, 1),
    estimatedRecoveryMinutes: record.estimatedRecoveryTimeMinutes,
    strategy: record.status === 'running' ? 'parallel' : record.status === 'draft' ? 'serial' : 'staged',
    constraints: [
      {
        name: 'minimum-impact-window',
        weight: 75,
        requiredWhen: 'amber',
        policyId: `policy-${incidentId}` as never,
      },
    ],
    runbook: [],
    context: {
      runStatus: record.status,
      program: incidentId,
    },
    requiresApprovals: incident.runbook ? Math.min(incident.runbook.steps.length, 2) : 1,
    requiresWindows: [window],
  };
};

export const adaptPolicyEnvelope = (policy: FabricPolicy, tenantId: string): FabricPolicy => ({
  ...policy,
  tenantId: tenantId as never,
});

export const buildExecutionContext = (
  tenantId: string,
  incident: IncidentRecord,
  program: RecoveryProgram,
  policy: FabricPolicy,
  signals: readonly FabricSignal[],
  runStates: readonly RecoveryRunState[],
): FabricExecutionContext => ({
  tenantId: tenantId as never,
  fabricId: `fabric-${tenantId}-ctx` as never,
  program,
  incident,
  policy,
  signals,
  runStates,
});

export const buildManifest = (incidentId: IncidentId, program: RecoveryProgram, plan: FabricPlan, policy: FabricPolicy, run: FabricRun | null): FabricManifest => ({
  id: `manifest-${incidentId}` as never,
  tenantId: program.tenant,
  sourceProgram: program,
  plan,
  policy,
  run,
  snapshots: [] as readonly FabricPlanSnapshot[],
});

export const normalizeWindows = (windows: readonly RecoveryWindow[]): readonly RecoveryWindow[] => {
  return windows
    .map((window) => ({
      ...window,
      startsAt: new Date(window.startsAt).toISOString(),
      endsAt: new Date(window.endsAt).toISOString(),
    }))
    .filter((window) => new Date(window.startsAt).getTime() < new Date(window.endsAt).getTime())
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime());
};
