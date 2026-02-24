import { z } from 'zod';
import {
  type PluginName,
  type PluginNamespace,
  type PluginTag,
  type PluginVersion,
  type PlaybookCatalogEntry,
  type PlaybookCatalogManifest,
  type TenantId,
  type WorkspaceId,
} from './types';

const PluginVersionSchema = z
  .string()
  .regex(/^v\d+\.\d+\.\d+$/)
  .transform((raw) => raw as PluginVersion);

const PluginNamespaceSchema = z
  .string()
  .min(12)
  .regex(/^playbook:[a-z0-9-]+$/)
  .transform((raw) => raw as PluginNamespace);

const PluginNameSchema = z
  .string()
  .min(8)
  .regex(/^plugin:[a-z0-9-]+$/)
  .transform((raw) => raw as PluginName);

const PluginTagSchema = z
  .string()
  .min(20)
  .regex(/^playbook:[a-z0-9-]+\/plugin:[a-z0-9-]+:v\d+\.\d+\.\d+$/)
  .transform((raw) => raw as PluginTag);

const toTenantId = (raw: string): TenantId => `tenant:${raw}` as TenantId;
const toWorkspaceId = (raw: string): WorkspaceId => `workspace:${raw}` as WorkspaceId;

const StageSchema = z.union([
  z.literal('discover'),
  z.literal('plan'),
  z.literal('simulate'),
  z.literal('execute'),
  z.literal('verify'),
  z.literal('finalize'),
]);

const ManifestEntrySchema = z.object({
  key: PluginTagSchema,
  namespace: PluginNamespaceSchema,
  name: PluginNameSchema,
  version: PluginVersionSchema,
  stage: StageSchema,
  priority: z.number().min(0).max(999),
  labels: z.array(z.string().min(1)),
  description: z.string().max(240),
});

export const PlaybookCatalogManifestSchema = z.object({
  namespace: PluginNamespaceSchema,
  tenantId: z.string().transform((raw) => toTenantId(raw)),
  workspaceId: z.string().transform((raw) => toWorkspaceId(raw)),
  entries: z.array(ManifestEntrySchema).default([]),
});

export type PlaybookCatalogManifestParsed = z.infer<typeof PlaybookCatalogManifestSchema> & {
  readonly namespace: ReturnType<typeof PluginNamespaceSchema.parse>;
};

export interface CatalogValidationResult {
  readonly manifest: PlaybookCatalogManifestParsed;
  readonly validEntries: readonly PlaybookCatalogEntry[];
  readonly invalidEntries: readonly {
    readonly key: string;
    readonly reason: string;
  }[];
}

const parseEntry = (input: unknown): PlaybookCatalogEntry | null => {
  const parsed = ManifestEntrySchema.safeParse(input);
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
};

export const parseManifest = (input: unknown): CatalogValidationResult => {
  const manifestResult = PlaybookCatalogManifestSchema.safeParse(input);
  if (!manifestResult.success) {
    const fallback = PlaybookCatalogManifestSchema.parse({
      namespace: 'playbook:default',
      tenantId: toTenantId('default'),
      workspaceId: toWorkspaceId('default'),
      entries: [],
    });
    return {
      manifest: fallback as PlaybookCatalogManifestParsed,
      validEntries: [],
      invalidEntries: [{
        key: 'manifest.parse.failure',
        reason: manifestResult.error.issues.at(0)?.message ?? 'manifest-unknown-error',
      }],
    };
  }

  const validEntries: PlaybookCatalogEntry[] = [];
  const invalidEntries: Array<{ key: string; reason: string }> = [];
  for (const entry of manifestResult.data.entries) {
    const parsed = parseEntry(entry);
    if (!parsed) {
      invalidEntries.push({ key: entry?.key ?? 'unknown-key', reason: 'entry-schema-failed' });
      continue;
    }
    validEntries.push(parsed);
  }

  return {
    manifest: manifestResult.data as PlaybookCatalogManifestParsed,
    validEntries,
    invalidEntries,
  };
};

const summarizeFailures = (issues: readonly z.ZodIssue[]) => {
  return issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .toSorted((left, right) => left.localeCompare(right));
};

export const parseManifestWithIssues = (input: unknown): {
  parsed: PlaybookCatalogManifest;
  issues: readonly string[];
} => {
  const result = PlaybookCatalogManifestSchema.safeParse(input);
  if (result.success) {
    return {
      parsed: result.data,
      issues: [],
    };
  }

  return {
    parsed: {
      namespace: 'playbook:default' as ReturnType<typeof PluginNamespaceSchema.parse>,
      tenantId: toTenantId('default'),
      workspaceId: toWorkspaceId('default'),
      entries: [],
    },
    issues: summarizeFailures(result.error.issues),
  };
};
