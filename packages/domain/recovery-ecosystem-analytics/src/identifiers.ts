import type { Brand } from '@shared/type-level';

const sanitizeSegment = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/(^[-.]|[-.]$)/g, '') || 'default';

export type AnalyticsTenant = Brand<`tenant:${string}`, 'AnalyticsTenant'>;
export type AnalyticsRun = Brand<`run:${string}`, 'AnalyticsRun'>;
export type AnalyticsPlan = Brand<`plan:${string}`, 'AnalyticsPlan'>;
export type AnalyticsSession = Brand<`session:${string}`, 'AnalyticsSession'>;
export type AnalyticsSignal = Brand<`signal:${string}`, 'AnalyticsSignal'>;
export type SignalNamespace = Brand<`namespace:${string}`, 'SignalNamespace'>;
export type AnalyticsWindow = Brand<`window:${string}`, 'AnalyticsWindow'>;
export type SignalKind = `signal:${string}`;
export type RunNamespace = SignalNamespace;
export type EventKind = 'ingest' | 'normalize' | 'evaluate' | 'aggregate' | 'resolve';
export type PlanPhase = 'ingest' | 'score' | 'synthesize' | 'publish' | 'archive';
export type SignalNamespaceTag = SignalNamespace;

type ParsedSegment<TKind extends string> = `${TKind}:${string}`;

export type BrandedId<TKind extends string> = Brand<ParsedSegment<TKind>, `Branded${Capitalize<TKind>}Id`>;

export interface IdentityDescriptor {
  readonly kind: string;
  readonly value: string;
  readonly namespace: SignalNamespace;
}

export const asTenant = (value: string): AnalyticsTenant => (`tenant:${sanitizeSegment(value)}` as AnalyticsTenant);

export const asRun = (runId: string): AnalyticsRun =>
  (`run:${sanitizeSegment(runId)}` as AnalyticsRun);

export const asPlan = (plan: string): AnalyticsPlan => (`plan:${sanitizeSegment(plan)}` as AnalyticsPlan);

export const asSession = (runId: string, stamp = Date.now()): AnalyticsSession =>
  (`session:${sanitizeSegment(runId)}-${stamp}` as AnalyticsSession);

export const asSignal = (signal: string): AnalyticsSignal =>
  (`signal:${sanitizeSegment(signal)}` as AnalyticsSignal);

export const asNamespace = (namespace: string): SignalNamespace =>
  (`namespace:${sanitizeSegment(namespace)}` as SignalNamespace);

export const asWindow = (windowId: string): AnalyticsWindow =>
  (`window:${sanitizeSegment(windowId)}` as AnalyticsWindow);

export const isSignal = (value: string): value is AnalyticsSignal => value.startsWith('signal:');

export const isTenant = (value: string): value is AnalyticsTenant => value.startsWith('tenant:');

export const isRun = (value: string): value is AnalyticsRun => value.startsWith('run:');

export const parseSignalNamespace = (namespace: SignalNamespace): string => namespace.replace(/^namespace:/, '');

export const signalToRuntimeToken = (signal: AnalyticsSignal): `${typeof signal}::token` =>
  `${signal}::token`;

export const resolveIdentityDescriptor = (value: string): IdentityDescriptor => {
  const namespace = asNamespace(value.includes('::') ? value.split('::')[1] ?? 'global' : 'global');
  const parts = value.replace(/^signal:/, '').split(':');
  return {
    kind: parts[0] ?? 'signal',
    value: parts.slice(1).join(':') || 'default',
    namespace,
  };
};

export const withTenantNamespace = (tenant: string, namespace: string): AnalyticsTenant & SignalNamespace =>
  `${asTenant(tenant)}:${asNamespace(namespace)}` as never;

