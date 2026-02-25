import { z } from 'zod';
import type { PlaybookTemplateBase, PlaybookTemplateRecord, StageKind } from './models';
import { artifactId, tenantId, type ArtifactId, workspaceId } from '@shared/playbook-studio-runtime';

export const studioTemplateStepSchema = z.object({
  id: z.string().min(3),
  label: z.string().min(3),
  dependencies: z.array(z.string()),
  durationMs: z.number().nonnegative(),
});

export const studioTemplateSchema = z.object({
  tenantId: z.string(),
  workspaceId: z.string(),
  artifactId: z.string(),
  strategy: z.enum(['reactive', 'predictive', 'safety']),
  title: z.string().min(1),
  tags: z.array(z.string()).default([]),
  steps: z.array(studioTemplateStepSchema).default([]),
});

export const stageSequenceSchema = z.array(
  z.enum(['plan', 'validate', 'execute', 'observe', 'review']),
);

export const studioRecordSchema = z.object({
  templateId: z.string(),
  template: studioTemplateSchema,
  label: z.string(),
});

export type StudioTemplateInput = z.infer<typeof studioTemplateSchema>;
export type StudioTemplateOutput = PlaybookTemplateBase;
export type StudioRecord = PlaybookTemplateRecord;
export type StageManifest = StageKind[];

export const parseStudioTemplate = (value: unknown): StudioTemplateOutput => {
  const parsed = studioTemplateSchema.safeParse(value);
  if (!parsed.success) {
    throw parsed.error;
  }

  const data = parsed.data;
  return {
    tenantId: tenantId(data.tenantId),
    workspaceId: workspaceId(data.workspaceId),
    artifactId: artifactId(data.artifactId),
    strategy: data.strategy,
    title: data.title,
    tags: [...data.tags],
    steps: [...data.steps],
  };
};

export const parseTemplateRecord = (value: unknown): StudioRecord => {
  const parsed = studioRecordSchema.safeParse(value);
  if (!parsed.success) {
    throw parsed.error;
  }
  return {
    templateId: parsed.data.templateId,
    template: parseStudioTemplate(parsed.data.template),
    label: parsed.data.label,
  };
};

export const parseTemplatesByArtifact = (value: Record<string, unknown>): ReadonlyMap<ArtifactId, StudioTemplateOutput> => {
  const out = new Map<ArtifactId, StudioTemplateOutput>();
  for (const [artifact, raw] of Object.entries(value)) {
    const record = parseStudioTemplate(raw);
    out.set(artifactId(artifact), record);
  }
  return out;
};
