import { useCallback, useMemo, useState } from 'react';
import {
  createCadenceOrchestrator,
  type CadenceOrchestrator,
  type OrchestratorAction,
  mapToCadenceRunId,
} from '@domain/recovery-operations-cadence';
import type {
  CadencePlanCandidate,
  CadenceRunPlan,
} from '@domain/recovery-operations-cadence';
import type { RecoveryIncidentId, RecoveryProgramId, RecoveryRunId, RecoveryRunState, RecoveryStep } from '@domain/recovery-orchestration';
import { withBrand } from '@shared/core';
import type { RunSession } from '@domain/recovery-operations-models';

export type CadenceWorkspaceState = {
  readonly orchestrator: CadenceOrchestrator;
  readonly candidates: readonly CadencePlanCandidate[];
  readonly plans: readonly CadenceRunPlan[];
  readonly selectedCandidateId: string;
  readonly audit: readonly OrchestratorAction[];
};

export type CadenceAction =
  | { readonly kind: 'loading' }
  | { readonly kind: 'candidate-added'; readonly candidate: CadencePlanCandidate }
  | { readonly kind: 'plan-added'; readonly plan: CadenceRunPlan }
  | { readonly kind: 'error'; readonly message: string };

const makeSession = (runId: RecoveryRunId, constraints = 2): RunSession => ({
  id: withBrand(`session-${runId}`, 'RunSessionId'),
  runId,
  ticketId: withBrand(`${runId}-ticket`, 'RunTicketId'),
  planId: withBrand(`${runId}-plan`, 'RunPlanId'),
  status: 'running',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  constraints: {
    maxParallelism: Math.max(1, constraints),
    maxRetries: constraints,
    timeoutMinutes: 120,
    operatorApprovalRequired: false,
  },
  signals: [],
});

const buildStepsFromRun = (run: RecoveryRunState): RecoveryStep[] =>
  run.currentStepId
    ? [
        {
          id: run.currentStepId,
          title: `step-${run.currentStepId}`,
          command: 'execute --step',
          timeoutMs: 12_000,
          dependencies: [],
          requiredApprovals: 1,
          tags: ['run-step', run.programId],
        },
      ]
    : [
        {
          id: `${run.runId}-seed`,
          title: 'seed',
          command: 'prepare',
          timeoutMs: 8_000,
          dependencies: [],
          requiredApprovals: 1,
          tags: ['seed', run.programId],
        },
      ];

export const useCadenceOrchestrator = () => {
  const [orchestrator] = useState(() => createCadenceOrchestrator());
  const [events, setEvents] = useState<string[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');

  const candidates = useMemo(
    () =>
      orchestrator.auditLog
        .filter((entry): entry is { kind: 'candidate-built'; candidate: CadencePlanCandidate } =>
          entry.kind === 'candidate-built',
        )
        .map((entry) => entry.candidate),
    [orchestrator.auditLog],
  );

  const plans = useMemo(() => {
    return orchestrator.auditLog
      .filter((entry): entry is { kind: 'plan-computed'; plan: CadenceRunPlan } => entry.kind === 'plan-computed')
      .map((entry) => entry.plan)
      .filter((plan, index, list) => index === list.findIndex((entry) => entry.id === plan.id));
  }, [orchestrator.auditLog]);

  const publishEvent = (event: CadenceAction) => {
    if (event.kind === 'loading') return;
    if (event.kind === 'error') {
      setEvents((values) => [...values, `error:${event.message}`]);
      return;
    }

    if (event.kind === 'candidate-added') {
      setEvents((values) => [...values, `candidate:${event.candidate.profile.programRun}:${event.candidate.revision}`]);
      return;
    }

    setEvents((values) => [...values, `plan:${event.plan.id}`]);
  };

  const addRun = useCallback(
    (run: RecoveryRunState) => {
      try {
        const session = makeSession(run.runId);
        const steps = buildStepsFromRun(run);
      const candidate = orchestrator.buildCandidateFromRun(
          run,
          session,
          steps,
          [],
          [
            {
              policyId: `policy-${run.runId}`,
              maxSignalsPerMinute: 120,
              minimumActiveTargets: 1,
              maxDirectiveRetries: 3,
              blackoutWindows: [],
            },
          ],
        );
        const readinessRunId = withBrand(String(run.runId), 'ReadinessRunId');
        const cadenceRunId = mapToCadenceRunId(readinessRunId);
        const plan = orchestrator.buildPlan(candidate, 'dry-run', cadenceRunId);

        publishEvent({ kind: 'candidate-added', candidate });
        setSelectedCandidateId(candidate.profile.programRun);
        publishEvent({ kind: 'plan-added', plan });
        return plan;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'failed to build run';
        publishEvent({ kind: 'error', message });
        return null;
      }
    },
    [orchestrator, publishEvent],
  );

  const executePlan = useCallback(
    (plan: CadenceRunPlan): string => {
      const run: RecoveryRunState = {
        runId: withBrand(`${plan.runId}`, 'RecoveryRunId'),
        programId: withBrand(`${plan.id}-program`, 'RecoveryProgramId'),
        incidentId: withBrand(`${plan.id}-incident`, 'RecoveryIncidentId'),
        status: 'running',
        estimatedRecoveryTimeMinutes: plan.profile.windows.length * 10,
      };

      const session = makeSession(run.runId);
      const context = {
        runPlan: plan,
        run: {
          ...run,
          runId: withBrand(`${plan.runId}`, 'RecoveryRunId'),
          currentStepId: run.currentStepId ?? 'seed',
        },
        session,
        seed: 42,
      };

      const executed = orchestrator.executePlan(context);
      publishEvent({ kind: 'plan-added', plan: executed });
      return executed.id;
    },
    [orchestrator, publishEvent],
  );

  const workspace: CadenceWorkspaceState = useMemo(
    () => ({
      orchestrator,
      candidates: [...candidates],
      plans: [...plans],
      selectedCandidateId,
      audit: [...orchestrator.auditLog],
    }),
    [orchestrator, candidates, plans, selectedCandidateId],
  );

  return {
    workspace,
    selectedCandidateId,
    setSelectedCandidateId,
    plans,
    candidates,
    events,
    addRun,
    executePlan,
  };
};
