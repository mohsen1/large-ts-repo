import { Brand, ResultState } from '@shared/core';
import { createValidator } from '@shared/validation';
import { z } from 'zod';
import {
  AlertMatch,
  AlertSeverity,
  PolicyRule,
  RouteRule,
  SignalKind,
  TenantId,
  TimestampMs,
  WindowBoundary,
} from './types';

export const tenantId = createValidator(z.string().uuid().transform((value): Brand<string, 'TenantId'> => value as TenantId));
export const streamId = createValidator(z.string().min(3));
export const signalKind = createValidator(z.union([z.literal('metric'), z.literal('span'), z.literal('event'), z.literal('log')]));
export const alertSeverity = createValidator(z.union([
  z.literal('low'),
  z.literal('medium'),
  z.literal('high'),
  z.literal('critical'),
]));

export const alertMatch = createValidator(
  z.object({
    id: z.string(),
    ruleId: z.string(),
    policyName: z.string().min(1),
    tenantId: z.string(),
    score: z.number().min(0).max(1),
    severity: z.union([z.literal('low'), z.literal('medium'), z.literal('high'), z.literal('critical')]),
    reason: z.string().min(1),
    createdAt: z.number().int().nonnegative(),
  }).transform((value): AlertMatch => ({
    ...value,
    id: value.id as AlertMatch['id'],
    ruleId: value.ruleId as AlertMatch['ruleId'],
    tenantId: value.tenantId as AlertMatch['tenantId'],
    createdAt: value.createdAt as TimestampMs,
  }))
);

export const routeRule = createValidator(
  z.object({
    id: z.string(),
    tenantId: z.string(),
    signal: z.union([z.literal('metric'), z.literal('span'), z.literal('event'), z.literal('log')]),
    include: z.array(z.string()),
    exclude: z.array(z.string()),
    target: z.array(z.string()),
  }).transform((value): RouteRule => ({
    ...value,
    id: value.id as RouteRule['id'],
    tenantId: value.tenantId as TenantId,
    signal: value.signal as SignalKind,
  }))
);

export const policyRuleSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string().min(1),
  severity: z.union([z.literal('low'), z.literal('medium'), z.literal('high'), z.literal('critical')]),
  signal: z.union([z.literal('metric'), z.literal('span'), z.literal('event'), z.literal('log')]),
  window: z.object({
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    grainMs: z.number().int().positive(),
  }),
  conditions: z.array(z.object({
    expression: z.string().min(1),
    path: z.string(),
    operator: z.union([
      z.literal('eq'),
      z.literal('lt'),
      z.literal('lte'),
      z.literal('gt'),
      z.literal('gte'),
      z.literal('contains'),
    ]),
    threshold: z.union([z.number(), z.string()]),
  })),
  enabled: z.boolean(),
  tags: z.record(z.string(), z.string()),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const policyRule = createValidator(policyRuleSchema);

export const assertSignalKind = (candidate: string): candidate is SignalKind =>
  candidate === 'metric' || candidate === 'span' || candidate === 'event' || candidate === 'log';

export const parseGrainLabel = <TWindow extends PolicyRule['window']>(window: TWindow): WindowBoundary<TWindow> => {
  if (window.grainMs === 1000) return 'second' as WindowBoundary<TWindow>;
  if (window.grainMs === 60000) return 'minute' as WindowBoundary<TWindow>;
  if (window.grainMs === 3600000) return 'hour' as WindowBoundary<TWindow>;
  return 'custom' as WindowBoundary<TWindow>;
};

export const withValidation = <T>(
  candidate: unknown,
  validator: (value: unknown) => ResultState<T, Error>,
): ResultState<T, Error> => validator(candidate);
