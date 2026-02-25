import { z } from 'zod';
import type { SynthesisPluginName, StageName, SynthesisNamespace, SynthesisTraceId, PipelineMode } from './types';

export const pluginNameSchema = z
  .string()
  .min(1)
  .regex(/^plugin:[a-z0-9-]+$/);

export const namespaceSchema = z
  .string()
  .min(1)
  .regex(/^namespace:[a-z0-9-]+$/);

export const stageSchema = z
  .string()
  .min(1)
  .regex(/^stage:[a-z0-9-]+$/);

export const stageRouteSchema = z.object({
  stage: stageSchema,
  plugin: pluginNameSchema,
  namespace: namespaceSchema,
  dependsOn: z.array(pluginNameSchema),
});

export const runtimeConfigSchema = z.object({
  mode: z.enum(['online', 'dry-run', 'shadow']),
  modeLabel: z.string().min(1),
  tenantId: z.string().uuid(),
  namespace: namespaceSchema,
});

export type PluginManifestShape = z.infer<typeof stageRouteSchema>;
export type RuntimeConfigShape = z.infer<typeof runtimeConfigSchema>;

export const parsePluginManifest = (value: unknown): PluginManifestShape => {
  return stageRouteSchema.parse(value);
};

export const parseRuntimeConfig = (value: unknown): RuntimeConfigShape => {
  return runtimeConfigSchema.parse(value);
};

export const createSignedTrace = (tenant: string, traceId: string): SynthesisTraceId => {
  return `${tenant}.trace.${traceId}` as SynthesisTraceId;
};

export const asPluginName = (value: string): SynthesisPluginName => value as SynthesisPluginName;
export const asStageName = (value: string): StageName => value as StageName;
export const asNamespace = (value: string): SynthesisNamespace => value as SynthesisNamespace;
export const asRuntimeMode = (value: string): PipelineMode => value as PipelineMode;
