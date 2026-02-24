import { z } from 'zod';

import type { ConductorPluginPhase } from '@shared/recovery-orchestration-runtime';

const pluginPhaseValues = [
  'discover',
  'assess',
  'simulate',
  'actuate',
  'verify',
  'finalize',
] as const;

const pluginManifestItem = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  namespace: z.string().min(1),
  phase: z.enum(pluginPhaseValues),
  tags: z.array(z.string().min(1)).default([]),
  dependencies: z.array(z.string().min(1)).default([]),
  enabled: z.boolean().default(true),
  config: z.record(z.unknown()).default({}),
});

const studioManifestSchema = z.object({
  namespace: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  manifestGeneratedAt: z.string().transform((value) => new Date(value).toISOString()),
  plugins: z.array(pluginManifestItem).default([]),
});

type StudioManifest = z.infer<typeof studioManifestSchema>;

const bootstrapManifest = {
  namespace: 'incident-orchestration-studio',
  version: '1.0.0',
  manifestGeneratedAt: '2026-02-24T00:00:00.000Z',
  plugins: [
    {
      id: 'discover-incidents',
      name: 'incident-discovery',
      namespace: 'incident-orchestration-studio',
      phase: 'discover' as ConductorPluginPhase,
      tags: ['discovery', 'inventory'],
      dependencies: [],
      enabled: true,
      config: {
        sourceLimit: 12,
        minConfidence: 0.2,
      },
    },
    {
      id: 'assess-candidates',
      name: 'candidate-assessment',
      namespace: 'incident-orchestration-studio',
      phase: 'assess' as ConductorPluginPhase,
      tags: ['assessment', 'scoring'],
      dependencies: ['discover-incidents'],
      enabled: true,
      config: {
        minimumCoverage: 0.72,
        maxCandidates: 7,
      },
    },
    {
      id: 'simulate-actions',
      name: 'simulation-runner',
      namespace: 'incident-orchestration-studio',
      phase: 'simulate' as ConductorPluginPhase,
      tags: ['simulation', 'forecast'],
      dependencies: ['assess-candidates'],
      enabled: true,
      config: {
        seed: 17,
        fallbackBudgetMinutes: 22,
      },
    },
    {
      id: 'verify-control-plane',
      name: 'control-plane-verify',
      namespace: 'incident-orchestration-studio',
      phase: 'verify' as ConductorPluginPhase,
      tags: ['controls', 'policy'],
      dependencies: ['simulate-actions'],
      enabled: true,
      config: {
        approvalRequired: true,
        maxPlanWindowMinutes: 55,
      },
    },
  ],
} satisfies StudioManifest;

const STUDIO_MANIFEST_RAW = studioManifestSchema.parse(bootstrapManifest);

export const STUDIO_MANIFEST = STUDIO_MANIFEST_RAW satisfies StudioManifest;
export const STUDIO_NAMESPACE = STUDIO_MANIFEST.namespace;

const ordered =
  (globalThis as {
    Iterator?: {
      from: (
        value: Iterable<unknown>,
      ) => { map: (mapper: (item: unknown) => string) => { toArray: () => readonly string[] } };
    };
  }).Iterator?.from?.(STUDIO_MANIFEST.plugins)?.map((plugin) => (plugin as { id: string }).id)?.toArray?.() as
    | readonly string[]
    | undefined;

export const STUDIO_PLUGIN_ORDER = (ordered ?? STUDIO_MANIFEST.plugins.map((plugin) => plugin.id)) satisfies readonly string[];
