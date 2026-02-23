import { z } from 'zod';

import type { PlaybookBlueprint, PlaybookAction, PlaybookRun, PlaybookStepTemplate } from './types';

const actionSchema = z.object({
  type: z.string().min(1),
  target: z.string().min(1),
  parameters: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])),
});

const id = z.string().min(1);

const stepTemplateSchema = z.object({
  id,
  title: z.string().min(3),
  kind: z.enum(['assess', 'notify', 'isolate', 'restore', 'verify', 'postmortem']),
  scope: z.enum(['global', 'region', 'service', 'workload']),
  ownerTeam: z.string().min(1),
  dependencies: z.array(id),
  expectedLatencyMinutes: z.number().positive(),
  riskDelta: z.number().min(-100).max(100),
  automationLevel: z.number().min(0).max(10),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])),
  actions: z.array(actionSchema),
});

const blueprintSchema = z.object({
  id,
  title: z.string().min(3),
  service: z.string().min(1),
  severity: z.enum(['minor', 'major', 'catastrophic']),
  tier: z.enum(['none', 'low', 'medium', 'high', 'critical']),
  timeline: z.object({
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    timezone: z.string().min(2),
  }),
  owner: z.string().min(2),
  labels: z.array(z.string()),
  steps: z.array(stepTemplateSchema).min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().positive(),
});

const outcomeSchema = z.object({
  status: z.enum(['pending', 'running', 'passed', 'failed', 'skipped']),
  attempt: z.number().min(0),
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().optional(),
  details: z.record(z.string()),
  nextStepIds: z.array(id),
});

const runSchema = z.object({
  id,
  playbookId: id,
  triggeredBy: z.string().min(1),
  startedAt: z.string().datetime(),
  window: z.object({
    startAt: z.string().datetime(),
    endAt: z.string().datetime(),
    timezone: z.string(),
  }),
  status: z.enum(['draft', 'active', 'paused', 'completed', 'aborted']),
  outcomeByStep: z.record(outcomeSchema),
  notes: z.array(z.string()),
});

export const parsePlaybookBlueprint = (input: unknown): PlaybookBlueprint => {
  const parsed = (blueprintSchema.parse(input) as unknown) as PlaybookBlueprint;

  const steps = parsed.steps;
  for (const step of steps) {
    for (const dep of step.dependencies) {
      if (!steps.some((candidate) => candidate.id === dep)) {
        throw new Error(`Step dependency ${dep} missing for ${step.id}`);
      }
    }
  }

  return parsed;
};

export const parsePlaybookRun = (input: unknown): PlaybookRun => {
  return (runSchema.parse(input) as unknown) as PlaybookRun;
};

export const ensureCyclicSafe = (steps: readonly PlaybookStepTemplate[]): void => {
  const byId = new Map(steps.map((step) => [step.id, step] as const));
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const walk = (step: PlaybookStepTemplate): void => {
    if (visited.has(step.id)) {
      return;
    }
    if (visiting.has(step.id)) {
      throw new Error(`cycle detected at ${step.id}`);
    }

    visiting.add(step.id);
    for (const dep of step.dependencies) {
      const resolved = byId.get(dep);
      if (!resolved) {
        throw new Error(`unresolved dependency ${dep} in ${step.id}`);
      }
      walk(resolved);
    }
    visiting.delete(step.id);
    visited.add(step.id);
  };

  for (const step of steps) {
    walk(step);
  }
};
