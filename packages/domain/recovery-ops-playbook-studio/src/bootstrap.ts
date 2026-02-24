import { parseManifest, parseManifestWithIssues } from './validation';
import type { PlaybookCatalogManifest } from './types';

const defaultCatalogSeed = {
  namespace: 'playbook:default',
  tenantId: 'tenant:default',
  workspaceId: 'workspace:default',
  entries: [
    {
      key: 'playbook:default/plugin:discoverer:v1.0.0',
      namespace: 'playbook:default',
      name: 'plugin:discoverer',
      version: 'v1.0.0',
      stage: 'discover',
      priority: 10,
      labels: ['baseline', 'discovery'],
      description: 'baseline discovery plugin',
    },
    {
      key: 'playbook:default/plugin:planner:v1.0.0',
      namespace: 'playbook:default',
      name: 'plugin:planner',
      version: 'v1.0.0',
      stage: 'plan',
      priority: 20,
      labels: ['baseline', 'planner'],
      description: 'baseline planning plugin',
    },
    {
      key: 'playbook:default/plugin:simulator:v1.0.0',
      namespace: 'playbook:default',
      name: 'plugin:simulator',
      version: 'v1.0.0',
      stage: 'simulate',
      priority: 30,
      labels: ['baseline', 'simulation'],
      description: 'baseline simulation plugin',
    },
    {
      key: 'playbook:default/plugin:executor:v1.0.0',
      namespace: 'playbook:default',
      name: 'plugin:executor',
      version: 'v1.0.0',
      stage: 'execute',
      priority: 40,
      labels: ['baseline', 'execution'],
      description: 'baseline execution plugin',
    },
    {
      key: 'playbook:default/plugin:verifier:v1.0.0',
      namespace: 'playbook:default',
      name: 'plugin:verifier',
      version: 'v1.0.0',
      stage: 'verify',
      priority: 50,
      labels: ['baseline', 'quality'],
      description: 'baseline verification plugin',
    },
    {
      key: 'playbook:default/plugin:finalizer:v1.0.0',
      namespace: 'playbook:default',
      name: 'plugin:finalizer',
      version: 'v1.0.0',
      stage: 'finalize',
      priority: 60,
      labels: ['baseline', 'cleanup'],
      description: 'baseline cleanup plugin',
    },
  ],
} as const;

const parseSeed = (seed: unknown): PlaybookCatalogManifest => {
  const parsed = parseManifest(seed);
  if (parsed.invalidEntries.length === 0) {
    return parsed.manifest;
  }
  const withIssues = parseManifestWithIssues(seed);
  return {
    ...withIssues.parsed,
    entries: withIssues.parsed.entries,
  };
};

const buildBootstrap = () => ({
  manifest: parseSeed(defaultCatalogSeed),
  loadedAt: new Date().toISOString(),
  issues: parseManifestWithIssues(defaultCatalogSeed).issues,
});

export const bootstrap = buildBootstrap();

export const defaultCatalogManifest = bootstrap.manifest;
export const catalogLoadedAt = bootstrap.loadedAt;
export const hasCatalogEntries = bootstrap.manifest.entries.length > 0;

export const catalogSignature = `${defaultCatalogManifest.namespace}:${defaultCatalogManifest.tenantId}`;
export * from './types';
export * from './graph';
export * from './registry';
export * from './validation';
