import type { ObserverNamespace, WindowMode, WindowPolicy, WindowPriority, ObserverWindowId } from './contracts';
import { asWindowPriority, observerNamespace, observerWindow } from './contracts';

export type LensRoute = `namespace:${string}` | `route:${string}`;

export type PolicyDescriptor<T extends string = string> = {
  readonly name: T;
  readonly enabled: boolean;
  readonly retries: number;
};

export type PolicyStage = 'ingest' | 'normalize' | 'enrich' | 'evaluate' | 'emit';

export interface PolicyContext<T extends string = string> {
  readonly stage: PolicyStage;
  readonly namespace: ObserverNamespace;
  readonly policy: `policy:${T}`;
  readonly window: ObserverWindowId;
  readonly mode: WindowMode;
  readonly priority: WindowPriority;
}

export type RouteMap<TPolicy extends string> = {
  [K in TPolicy as `policy:${K}`]: {
    name: K;
    stage: PolicyStage;
    enabled: boolean;
  };
};

export const makeRoute = <TPrefix extends string>(prefix: TPrefix, ...parts: readonly string[]): LensRoute => {
  const suffix = parts.filter(Boolean).join('/');
  return (`${prefix}:${suffix}` as LensRoute);
};

export const formatRoute = (namespace: string, ...parts: readonly string[]): LensRoute => {
  return makeRoute('namespace', namespace, ...parts);
};

export const policyToRoute = <TPolicy extends string>(policy: TPolicy): `policy:${TPolicy}` => {
  return `policy:${policy}` as `policy:${TPolicy}`;
};

export const routeTemplate: Record<WindowMode, LensRoute> = {
  realtime: 'route:realtime',
  snapshot: 'route:snapshot',
  backfill: 'route:backfill',
  simulation: 'route:simulation',
};

export const defaultPolicyContext = (namespace: ObserverNamespace): PolicyContext => ({
  stage: 'ingest',
  namespace,
  policy: policyToRoute('default'),
  window: observerWindow('window:default'),
  mode: 'realtime',
  priority: asWindowPriority(4),
});

export const buildWindowPolicy = <TNamespace extends string>(
  namespace: `namespace:${TNamespace}`,
  mode: WindowMode,
  ttlMs: number,
): WindowPolicy => ({
  namespace: observerNamespace(namespace),
  window: `window:${String(ttlMs)}:${mode}` as ObserverWindowId,
  mode,
  ttlMs: Math.max(1, Math.floor(ttlMs)),
  priority: asWindowPriority(6),
});
