import type { SagaRun, SagaPlan, SagaPolicy } from '@domain/recovery-incident-saga';
import { buildTopology } from '@domain/recovery-incident-saga';
import type { SagaWorkspaceOutcome } from '../types';
import type { SagaEventEnvelope, SagaPhase } from '@shared/incident-saga-core';
import { withBrand } from '@shared/core';
import type { SagaRuntimeSnapshot } from '@service/recovery-incident-saga-orchestrator';
import { toNamespace } from '@shared/incident-saga-core';

export interface SagaApiAdapter<T> {
  adapt(input: T): T;
}

const isObjectRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

export const toOutcomeBundle = (run: SagaRun, plan: SagaPlan, policy: SagaPolicy): SagaWorkspaceOutcome => {
  const topology = buildTopology(plan);
  const eventCount = topology.nodes.length + topology.order.length;
  const base = JSON.stringify({
    runId: run.id,
    planSteps: plan.steps.length,
    policyId: policy.id,
  });

  return {
    bundle: {
      run,
      plan,
      policy,
    },
    result: isObjectRecord(run) && run.id.length > 0 && topology.nodes.length >= 0
      ? {
          ok: true,
          value: {
            ok: true,
            summary: base,
            runCount: topology.nodes.length,
            warningCount: eventCount % 2 === 0 ? 1 : 0,
          },
        }
      : {
          ok: false,
          error: 'invalid-scenario-bundle',
        },
    startedAt: new Date().toISOString(),
  };
};

export const summarizeNode = (
  node: ReturnType<typeof buildTopology>['nodes'][number],
): { readonly id: string; readonly degree: number } => ({
  id: node.id,
  degree: node.inbound.length + node.outbound.length,
});

export const mapOutcomeToView = (outcome: SagaWorkspaceOutcome): string[] => {
  return [outcome.bundle.run.id, outcome.bundle.plan.runId, outcome.bundle.policy.id, String(outcome.result.ok)];
};

const eventFrom = (kind: SagaPhase, run: SagaRun): SagaEventEnvelope => {
  const namespace = toNamespace(run.domain);
  const namespaceEvent = `event:${namespace}` as const;
  return {
    eventId: withBrand(`${run.id}::${kind}`, namespaceEvent),
    namespace,
    kind: `${namespace}::${kind}`,
    payload: { eventKind: kind, runId: run.id },
    recordedAt: new Date().toISOString(),
    tags: ['tag:prepare'],
  };
};

export const viewToRuntimeEvents = (outcome: SagaWorkspaceOutcome): SagaRuntimeSnapshot['events'] => {
  return [
    eventFrom('prepare', outcome.bundle.run),
    eventFrom('execute', outcome.bundle.run),
    eventFrom('audit', outcome.bundle.run),
  ];
};

export const mergeViews = <T>(left: readonly T[], right: readonly T[], selector: (value: T) => string): T[] => {
  const known = new Set(right.map(selector));
  return [...left, ...right.filter((item) => !known.has(selector(item)))];
};

export const normalizeOutcome = <T extends { startedAt: string }>(value: T): T => ({
  ...value,
  startedAt: new Date(value.startedAt).toISOString(),
});

export const isOutcomeReady = (value: SagaWorkspaceOutcome | undefined): value is SagaWorkspaceOutcome =>
  Boolean(value && value.result.ok);
