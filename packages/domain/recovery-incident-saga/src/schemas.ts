import { z } from 'zod';
import { sagaPhases, type SagaPriority, type SagaRunId, type SagaRunStepId, type SagaRunPolicyId } from './constants';
import type { SagaPlan, SagaRun, SagaPolicy } from './model';
import { parsePlanPayload, parsePolicyPayload, parseRunPayload } from './adapter';

const runSchema = z.object({
  id: z.string().min(1),
  domain: z.string().min(1),
  region: z.string().min(1),
  policyId: z.string().min(1),
  createdAt: z.string(),
  priority: z.union([z.literal('critical'), z.literal('high'), z.literal('normal'), z.literal('low')]),
  phase: z.enum(sagaPhases),
  timeline: z.array(
    z.object({
      at: z.string(),
      phase: z.enum(sagaPhases),
      message: z.string(),
      metadata: z.record(z.string(), z.unknown()),
    }),
  ),
  steps: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      weight: z.number().min(0),
      command: z.string().min(1),
      actionType: z.union([z.literal('automated'), z.literal('manual')]),
      dependsOn: z.array(z.string().min(1)),
    }),
  ),
});

const planSchema = z.object({
  runId: z.string().min(1),
  namespace: z.string().min(1),
  policyId: z.string().min(1),
  steps: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      weight: z.number().min(0),
      command: z.string().min(1),
      actionType: z.union([z.literal('automated'), z.literal('manual')]),
      dependsOn: z.array(z.string().min(1)),
    }),
  ),
  edges: z.array(z.tuple([z.string().min(1), z.string().min(1)])),
  createdAt: z.string(),
});

const policySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  domain: z.string().min(1),
  enabled: z.boolean(),
  confidence: z.number().min(0).max(1),
  threshold: z.number().min(0).max(1),
  steps: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      weight: z.number().min(0),
      command: z.string().min(1),
      actionType: z.union([z.literal('automated'), z.literal('manual')]),
      dependsOn: z.array(z.string().min(1)),
    }),
  ),
});

export type ScenarioBundle = {
  readonly run: SagaRun;
  readonly plan: SagaPlan;
  readonly policy: SagaPolicy;
};
const scenarioBundleSchema = z.object({
  run: runSchema,
  plan: planSchema,
  policy: policySchema,
});

export interface ParsedScenarioRun {
  readonly kind: 'run';
  readonly payload: SagaRun;
}

export interface ParsedScenarioPlan {
  readonly kind: 'plan';
  readonly payload: SagaPlan;
}

export interface ParsedScenarioPolicy {
  readonly kind: 'policy';
  readonly payload: SagaPolicy;
}

export const parseScenarioBundle = (value: unknown): ScenarioBundle => {
  const parsed = scenarioBundleSchema.parse(value);
  return {
    run: parseRunPayload(parsed.run),
    plan: parsePlanPayload(parsed.plan),
    policy: parsePolicyPayload(parsed.policy),
  };
};
export const parseScenarioRun = (input: unknown): ParsedScenarioRun => ({ kind: 'run', payload: parseRunPayload(input) });
export const parseScenarioPlan = (input: unknown): ParsedScenarioPlan => ({ kind: 'plan', payload: parsePlanPayload(input) });
export const parseScenarioPolicy = (input: unknown): ParsedScenarioPolicy => ({
  kind: 'policy',
  payload: parsePolicyPayload(input),
});

export const createDefaultBundle = (): ScenarioBundle => ({
  run: {
    id: 'run-incident-demo' as SagaRunId,
    domain: 'incident-saga',
    region: 'us-east-1',
    policyId: 'policy-demo' as SagaRunPolicyId,
    createdAt: new Date().toISOString(),
    priority: 'normal' as SagaPriority,
    phase: 'prepare',
    timeline: [],
    steps: [
      {
        id: 'incident-saga::step:0:default' as SagaRunStepId,
        title: 'default-step',
        weight: 10,
        command: 'fallback::prepare',
        actionType: 'automated',
        dependsOn: [],
      },
    ],
  },
  plan: {
    runId: 'run-incident-demo' as SagaRunId,
    namespace: 'incident-saga',
    policyId: 'policy-demo' as SagaRunPolicyId,
    steps: [],
    edges: [],
    createdAt: new Date().toISOString(),
  },
  policy: {
    id: 'policy-demo' as SagaRunPolicyId,
    name: 'default-policy',
    domain: 'incident-saga',
    enabled: true,
    confidence: 0.8,
    threshold: 0.5,
    steps: [],
  },
});
