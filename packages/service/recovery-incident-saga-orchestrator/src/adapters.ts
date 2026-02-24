import { z } from 'zod';
import { withBrand } from '@shared/core';
import { parseScenarioBundle, type ScenarioBundle, type SagaRunStepId } from '@domain/recovery-incident-saga';
import { buildPlanGraph } from '@domain/recovery-incident-saga';

export interface RuntimeInput {
  readonly input: unknown;
  readonly runtime: string;
  readonly topology?: readonly [string, string][];
}

export const runtimeInputSchema = z.object({
  input: z.unknown(),
  runtime: z.string().min(1),
  topology: z.array(z.tuple([z.string(), z.string()])).optional(),
});

export type RuntimeInputSnapshot = z.infer<typeof runtimeInputSchema>;

export interface RuntimeBundle {
  readonly bundle: ScenarioBundle;
  readonly topology: readonly [string, string][];
  readonly runtime: string;
}

export const normalizeRuntimeInput = (raw: RuntimeInput): RuntimeInputSnapshot => {
  const parsed = runtimeInputSchema.parse(raw);
  return {
    input: raw.input,
    runtime: parsed.runtime,
    topology: parsed.topology ?? [],
  };
};

export const bundleFromRuntimeInput = (raw: RuntimeInput): RuntimeBundle => {
  const snapshot = normalizeRuntimeInput(raw);
  const parsed = parseScenarioBundle(snapshot.input);
  const normalizedTopology = [...(snapshot.topology ?? [])];
  const hasTopology = normalizedTopology.length > 0;
  const edges = hasTopology
    ? normalizedTopology.map(([from, to]) => [withBrand(from, 'SagaRunStepId'), withBrand(to, 'SagaRunStepId')] as [SagaRunStepId, SagaRunStepId])
    : [...parsed.plan.edges];
  const builtPlan = buildPlanGraph(
    parsed.plan.steps.map((step: { readonly id: string; readonly actionType: 'automated' | 'manual'; readonly dependsOn: readonly string[] }) => ({
      source: step.id,
      target: step.dependsOn[0] ?? step.id,
      relation: step.actionType === 'automated' ? 'parallel' : 'before',
    })),
    {
      runId: parsed.run.id,
      namespace: parsed.run.domain,
      phase: parsed.run.phase,
    },
  );
  return {
    bundle: {
      ...parsed,
      plan: {
        ...builtPlan,
        edges,
        createdAt: parsed.plan.createdAt,
      },
    },
    topology: hasTopology
      ? normalizedTopology
      : [...parsed.plan.edges.map(([from, to]) => [String(from), String(to)] as [string, string])],
    runtime: snapshot.runtime,
  };
};

export const toRuntimeEnvelope = (bundle: RuntimeBundle): RuntimeBundle & { envelopeCount: number } => ({
  ...bundle,
  envelopeCount: bundle.topology.length,
});

export const summarizeBundle = (bundle: RuntimeBundle): string => {
  return `${bundle.runtime}|${bundle.bundle.run.id}|${bundle.topology.length}`;
};
