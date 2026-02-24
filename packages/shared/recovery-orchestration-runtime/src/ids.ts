import { Brand, NoInfer } from '@shared/type-level';

export type ConductorNamespace = Brand<string, 'RecoveryOrchestratorNamespace'>;
export type ConductorWorkflowId = Brand<string, 'RecoveryOrchestratorWorkflowId'>;
export type ConductorRunId = Brand<string, 'RecoveryOrchestratorRunId'>;
export type ConductorPluginId = Brand<string, 'RecoveryOrchestratorPluginId'>;
export type ConductorManifestKey<T extends string> = `conductor:${T}`;

export type RouteSegments<Path extends string> = Path extends `${infer Head}/${infer Tail}`
  ? [Head, ...RouteSegments<Tail>]
  : [Path];

export type RouteTemplate<Path extends string> = Path extends `${infer _Prefix}:${infer Token}/${infer Tail}`
  ? Token | RouteTemplate<Tail>
  : Path extends `${infer _Prefix}:${infer Token}`
    ? Token
    : never;

export type RouteValueSet<Path extends string> = RouteSegments<Path>;
export type NamespaceCatalog<T extends string> = Record<T, string>;

export interface ParsedRoute {
  readonly normalized: string;
  readonly segments: readonly string[];
  readonly keys: readonly string[];
}

export const ROUTE_TEMPLATES = {
  workspace: '/tenants/:tenantId/workspaces/:workspaceId/plan/:planId',
  diagnostics: '/tenants/:tenantId/diagnostics/:phase',
  simulation: '/tenants/:tenantId/simulate/:scenarioId',
} as const satisfies NamespaceCatalog<'workspace' | 'diagnostics' | 'simulation'>;

const stripEdge = (path: string): string =>
  path.startsWith('/') ? path.slice(1) : path.endsWith('/') ? path.slice(0, -1) : path;

export const canonicalizeRoute = <T extends string>(raw: T): string => {
  const sanitized = stripEdge(raw.trim().toLowerCase());
  return sanitized.replace(/\/{2,}/g, '/');
};

export const parseRoute = <T extends string>(value: T): ParsedRoute => {
  const normalized = canonicalizeRoute(value);
  const segments = normalized.split('/').filter((segment) => segment.length > 0);
  const keys = segments.filter((segment) => segment.startsWith(':'));
  return { normalized, segments, keys };
};

export const extractTemplateKeys = <T extends string>(template: T): readonly RouteTemplate<T>[] =>
  parseRoute(template).keys as readonly RouteTemplate<T>[];

export const buildConductorNamespace = <T extends string>(value: T): ConductorNamespace => {
  const normalized = canonicalizeRoute(value).replace(/\//g, ':');
  return `${normalized}` as ConductorNamespace;
};

export const buildWorkflowId = (
  namespace: ConductorNamespace,
  seed: string,
): ConductorWorkflowId => `${namespace}::${seed}` as ConductorWorkflowId;

export const buildRunId = (
  namespace: ConductorNamespace,
  runCounter: number,
  seed: string,
): ConductorRunId => `${namespace}::run::${runCounter}::${seed}` as ConductorRunId;

export const buildManifestKey = <TNamespace extends string, TFeature extends string>(
  namespace: Brand<TNamespace, 'RecoveryOrchestratorNamespace'>,
  feature: TFeature,
): ConductorManifestKey<`${TNamespace}:${TFeature}`> => `${namespace}:${feature}` as ConductorManifestKey<
  `${TNamespace}:${TFeature}`
>;

export const splitNamespace = <T extends ConductorNamespace>(namespace: T): RouteSegments<T> => {
  const text = namespace.toString();
  return text.split(':') as RouteSegments<T>;
};

export const buildPluginId = <TNamespace extends ConductorNamespace, TPhase extends string>(
  namespace: NoInfer<TNamespace>,
  phase: TPhase,
): ConductorPluginId =>
  `${namespace}:${phase}:${Math.floor(Math.random() * 100000)
    .toString(36)
    .padStart(6, '0')}` as ConductorPluginId;

export const templateToTokens = <TTemplate extends string>(template: TTemplate): RouteValueSet<TTemplate> => {
  const segments = parseRoute(template).keys;
  return segments.map((token) => token.slice(1)) as RouteValueSet<TTemplate>;
};
