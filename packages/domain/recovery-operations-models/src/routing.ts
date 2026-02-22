import type { Brand } from '@shared/core';
import type { RunSession, RecoverySignal, RunPlanSnapshot } from './types';
import type { RecoveryProgram } from '@domain/recovery-orchestration';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';

export type RecoveryRouteKey = Brand<string, 'RecoveryRouteKey'>;
export type RecoveryEnvelopeTopic = Brand<string, 'RecoveryEnvelopeTopic'>;

export interface RecoveryRouteDescriptor<TContext = Record<string, unknown>> {
  readonly key: RecoveryRouteKey;
  readonly topic: RecoveryEnvelopeTopic;
  readonly context: TContext;
  readonly tags: readonly string[];
}

export type RoutePolicy<TContext = Record<string, unknown>> = (
  session: RunSession,
  context: TContext,
) => boolean;

export interface RouteDecision<TContext> {
  readonly route: RecoveryRouteDescriptor<TContext>;
  readonly selected: boolean;
  readonly reason: string;
}

export interface RouteTable<TContext = Record<string, unknown>> extends Map<RecoveryRouteKey, RecoveryRouteDescriptor<TContext>> {}

export interface RecoveryCommandContext {
  readonly tenant: string;
  readonly program: RecoveryProgram;
  readonly readinessPlan: RecoveryReadinessPlan;
  readonly createdAt: string;
}

export const buildRouteKey = (seed: string): RecoveryRouteKey => {
  return `${seed}-${Date.now()}` as RecoveryRouteKey;
};

export const createRouteDescriptor = <TContext>(
  key: string,
  topic: string,
  context: TContext,
  tags: readonly string[] = [],
): RecoveryRouteDescriptor<TContext> => ({
  key: `${topic}:${key}` as RecoveryRouteKey,
  topic: `${topic}` as RecoveryEnvelopeTopic,
  context,
  tags,
});

const normalizePlanFingerprint = (planId: RunPlanSnapshot['id']): string => String(planId);

export const routeCandidates = (
  context: RecoveryCommandContext,
): RouteTable<RecoveryCommandContext> => {
  const routes: RouteTable<RecoveryCommandContext> = new Map();
  const keys = normalizePlanFingerprint(`${context.program.id}` as RunPlanSnapshot['id']);
  const main = createRouteDescriptor(
    `${keys}-primary`,
    `operations.${context.tenant}.primary`,
    context,
    ['primary', context.tenant],
  );
  const fallback = createRouteDescriptor(
    `${keys}-fallback`,
    `operations.${context.tenant}.fallback`,
    context,
    ['fallback', context.readinessPlan.riskBand],
  );
  routes.set(main.key, main);
  routes.set(fallback.key, fallback);
  return routes;
};

export const evaluateRoute = <TContext>(
  descriptor: RecoveryRouteDescriptor<TContext>,
  rule: RoutePolicy<TContext>,
  session: RunSession,
): RouteDecision<TContext> => {
  const selected = rule(session, descriptor.context);
  return {
    route: descriptor,
    selected,
    reason: selected ? 'rule matched' : 'rule skipped',
  };
};

export const extractSignalIds = (signals: readonly RecoverySignal[]): readonly string[] =>
  signals.map((signal) => signal.id);

export const routeBySignalDensity = (session: RunSession): number => {
  if (!session.signals.length) {
    return 0;
  }

  const score = session.signals.reduce((acc, signal) => acc + signal.severity, 0);
  return Number((score / session.signals.length).toFixed(2));
};

export const mergeRouteTables = <TContext>(
  base: RouteTable<TContext>,
  addendum: RouteTable<TContext>,
): RouteTable<TContext> => {
  const merged = new Map(base);
  for (const [key, descriptor] of addendum) {
    merged.set(key, descriptor);
  }
  return merged;
};

export const summarizeRoutes = <TContext>(routes: RouteTable<TContext>): string[] => {
  return Array.from(routes.values()).map((entry) => `${entry.topic}:${entry.key}`);
};
