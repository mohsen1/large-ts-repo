import type { RuntimeWindow, WindowType } from './runtime-window';
import type { SignalObservation, IncidentForecastPlan } from './types';
import { z } from 'zod';

const Step = z.object({
  name: z.string().min(1),
  owner: z.string().min(1),
  command: z.string().min(1),
});

const PlanMetadata = z.object({
  planId: z.string().min(1).transform((value): IncidentForecastPlan['planId'] => value as IncidentForecastPlan['planId']),
  tenantId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  generatedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  playbookSteps: z.array(Step),
  triggers: z.array(z.string().min(1)),
});

const WindowPolicy = z.object({
  strategy: z.union([z.literal('eager'), z.literal('throttled')]),
  windows: z.array(z.object({
    type: z.string(),
    startedAt: z.string().datetime(),
    endedAt: z.string().datetime(),
    overlapPolicy: z.enum(['replace', 'merge', 'accumulate']),
  })),
});

export type PlanWindowPolicy = z.infer<typeof WindowPolicy>;

export const buildPlanTitle = (tenantId: string, severity: SignalObservation['severity']): string =>
  `${tenantId} incident-response-${severity}`;

export const buildWindows = (seed: Date, type: WindowType): RuntimeWindow[] => {
  const start = new Date(seed);
  const windows: RuntimeWindow[] = [];
  for (let i = 0; i < 3; i += 1) {
    const startTime = new Date(start.getTime() + i * 15 * 60 * 1000);
    const endTime = new Date(startTime.getTime() + 10 * 60 * 1000);
    windows.push({
      type,
      startedAt: startTime.toISOString(),
      endedAt: endTime.toISOString(),
      overlapPolicy: i === 0 ? 'accumulate' : 'merge',
    });
  }
  return windows;
};

export const buildForecastPlan = (
  tenantId: string,
  severity: SignalObservation['severity'],
  signals: readonly SignalObservation[],
): IncidentForecastPlan => {
  const generatedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const title = buildPlanTitle(tenantId, severity);
  const schema = PlanMetadata.parse({
    planId: `${tenantId}-${Date.now()}`,
    tenantId,
    title,
    description: `Automated plan for ${title}`,
    generatedAt,
    expiresAt,
    triggers: signals.map((signal) => signal.eventType),
    playbookSteps: [
      { name: 'stabilize', owner: 'platform', command: 'scale-out-critical-services' },
      { name: 'verify', owner: 'sre', command: 'run-health-checks' },
      { name: 'recover', owner: 'incident', command: 'execute-playbook' },
    ],
  });

  return {
    planId: schema.planId,
    tenantId: schema.tenantId,
    title: schema.title,
    description: schema.description,
    triggers: schema.triggers,
    playbookSteps: schema.playbookSteps.map((step) => `${step.owner}:${step.name}:${step.command}`),
    generatedAt: schema.generatedAt,
    expiresAt: schema.expiresAt,
  };
};

export const planWindowPolicy = (
  policy: PlanWindowPolicy,
  plan: IncidentForecastPlan,
): PlanWindowPolicy => {
  return WindowPolicy.parse({
    strategy: policy.windows.length > 0 ? 'eager' : 'throttled',
    windows: policy.windows,
  });
};
