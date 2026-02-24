import {
  type OrchestrationInput,
  type OrchestrationOutput,
  type IncidentIntentPolicy,
  type IncidentContext,
  type IncidentTenantId,
  type IncidentIntentSignal,
  type IncidentIntentRecord,
  type IncidentIntentRoute,
  buildOrchestrationPlan,
  createIntentRunId,
  createIntentStepId,
  buildPolicies as buildPoliciesFrom,
} from '@domain/recovery-incident-intent';
import { ok, fail, type Result } from '@shared/result';
import type { OrchestratorTelemetryCollector } from './observability';
import { createStoreHandle } from '@data/recovery-incident-intent-store';
import { normalizeSignalsInput } from './adapter';

export interface DispatcherInput {
  readonly tenantId: IncidentTenantId;
  readonly context: IncidentContext;
}

export const dispatchPlan = async (
  input: OrchestrationInput,
  telemetry: OrchestratorTelemetryCollector,
): Promise<Result<OrchestrationOutput, Error>> => {
  try {
    const normalizedSignals = normalizeSignalsInput(input.signals);
    const normalizedInput: OrchestrationInput = {
      ...input,
      signals: normalizedSignals,
      policies: input.policies.length > 0
        ? input.policies
        : buildPoliciesFrom([
            { title: 'bootstrap', minimumConfidence: 0.5, tags: ['bootstrap'] },
          ]),
    };

    const output = await buildOrchestrationPlan({
      tenantId: normalizedInput.tenantId,
      context: normalizedInput.context,
      signals: normalizedInput.signals,
      policies: normalizedInput.policies,
    });
    const manifest = buildManifest(output);
    const store = createStoreHandle();
    const stored = await store.writeSignalBatch(
      output.tenantId as string,
      normalizedInput.signals,
      output.topPlan.phases.flatMap((phase) => {
        const candidate = phase.output;
        if (!candidate) return [];
        return [
          {
            policyId: createIntentStepId(candidate.stepId, candidate.durationMs),
            title: candidate.kind,
            minimumConfidence: 0.5,
            tags: [candidate.kind],
            weight: { severity: 1, freshness: 1, confidence: 1, cost: 0 },
          } satisfies IncidentIntentPolicy,
        ];
      }),
      manifest,
      normalizedInput.context,
    );
    if (!stored.ok) {
      telemetry.emit('runtime:store:error', 'failed', normalizedInput.context);
      return fail(stored.error);
    }

    telemetry.emit('runtime:store:ok', 'succeeded', normalizedInput.context);
    return ok(output);
  } catch (error) {
    telemetry.emit('runtime:dispatch:error', 'failed', input.context);
    return fail(error instanceof Error ? error : new Error(String(error)));
  }
};

const buildManifest = (input: OrchestrationOutput): IncidentIntentRecord => {
  const route = input.route;
  const nodes = input.snapshots.flatMap((snapshot) => snapshot.nodes);
  const edges = input.snapshots.flatMap((snapshot) => snapshot.edges);
  const context: IncidentContext = input.topPlan.phases[0]?.input.context ?? {
    tenantId: input.tenantId,
    incidentId: `incident-${input.tenantId}`,
    startedAt: new Date().toISOString(),
    affectedSystems: ['api-gateway'],
    severity: 'p2',
    tags: ['runtime'],
    meta: {
      tenantId: input.tenantId,
      owner: 'runtime',
      region: 'global',
      team: 'recovery',
    },
  };

  return {
    catalogId: createIntentRunId('manifest') as IncidentIntentRecord['catalogId'],
    tenantId: input.tenantId,
    title: `${route.steps[0]?.path ?? 'intent'} manifest`,
    summary: `${input.topPlan.runId}::${route.steps.length}`,
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    nodes,
    edges,
    context,
    manifestType: 'incident-intent',
    route,
  };
};

export const createDispatcherSeed = (): readonly IncidentIntentSignal[] => [
  {
    id: createIntentRunId('seed') as IncidentIntentSignal['id'],
    kind: 'telemetry',
    source: 'dispatcher',
    value: 1,
    unit: 'ratio',
    observedAt: new Date().toISOString(),
    labels: { source: 'dispatcher' },
  },
];
