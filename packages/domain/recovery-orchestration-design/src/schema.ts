import { z } from 'zod';
import type {
  RecoveryRun,
  RecoveryRunbook,
  RecoveryScenarioTemplate,
  ScenarioMeta,
  StageEdge,
  StageNode,
} from './models';
import {
  makeCommandId,
  makeScenarioId,
  makeTenantId,
  makeWorkspaceId,
} from './models';
import type { PolicyTag } from '@shared/orchestration-kernel';
import { withBrand } from '@shared/core';

const brandTenant = (value: string): ReturnType<typeof makeTenantId> => makeTenantId(value);
const brandWorkspace = (value: string): ReturnType<typeof makeWorkspaceId> => makeWorkspaceId(value);
const brandScenario = (rawTenant: string, value: string): ReturnType<typeof makeScenarioId> =>
  makeScenarioId(makeTenantId(rawTenant), value);
const brandRunId = (scenario: string, index: number): ReturnType<typeof makeCommandId> =>
  withBrand(`${scenario}:${index}`, 'CommandId');
const brandPolicyTag = (value: string): PolicyTag => `policy:${value}`;

const tenantIdSchema = z.string().min(3).transform(brandTenant);
const workspaceIdSchema = z.string().min(3).transform(brandWorkspace);
const scenarioIdSchema = z.object({
  tenant: z.string().min(3),
  id: z.string().min(3),
}).transform((value) => makeScenarioId(makeTenantId(value.tenant), value.id));

export const metaSchema = z
  .object({
    tenantId: tenantIdSchema,
    workspaceId: workspaceIdSchema,
    scenarioId: scenarioIdSchema,
    origin: z.string().min(1),
    labels: z.record(z.string(), z.string()),
  })
  .transform((value) => value as ScenarioMeta) as unknown as z.ZodType<ScenarioMeta>;

const stageKind = z.union([
  z.literal('discover'),
  z.literal('stabilize'),
  z.literal('mitigate'),
  z.literal('validate'),
  z.literal('document'),
]);

const nodeStatus = z.union([
  z.literal('pending'),
  z.literal('active'),
  z.literal('suppressed'),
  z.literal('complete'),
]);

const severity = z.union([z.literal('low'), z.literal('medium'), z.literal('high'), z.literal('critical')]);
const metricValue = z.number().min(0).max(1).default(0);
const metricRecord = z.object({
  slo: metricValue,
  capacity: metricValue,
  compliance: metricValue,
  security: metricValue,
});

export const stageNodeSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    phase: stageKind,
    severity,
    status: nodeStatus,
    metrics: metricRecord,
    prerequisites: z.array(z.string()),
  })
  .transform((value) => value as StageNode) as unknown as z.ZodType<StageNode>;

export const stageEdgeSchema = z
  .object({
    from: z.string().min(1),
    to: z.string().min(1),
    latencyMs: z.number().int().nonnegative(),
  })
  .transform((value) => value as StageEdge) as unknown as z.ZodType<StageEdge>;

export const policyDirectiveSchema = z
  .object({
    code: z.string().min(1).transform((value: string) => brandPolicyTag(value)),
    command: z.string().min(1),
    scope: z.string().min(1),
    requiredCapabilities: z.array(z.string()),
    metadata: z.record(z.string(), z.unknown()),
  })
  .transform((value) => value as { readonly code: PolicyTag; readonly command: string; readonly scope: string; readonly requiredCapabilities: readonly string[]; readonly metadata: Record<string, unknown> }) as unknown as z.ZodType<{
    readonly code: PolicyTag;
    readonly command: string;
    readonly scope: string;
    readonly requiredCapabilities: readonly string[];
    readonly metadata: Record<string, unknown>;
  }>;

export const runbookSchema = z
  .object({
    tenant: z.string().min(3),
    workspace: z.string().min(3),
    scenarioId: z.string().min(3),
  title: z.string().min(1),
  nodes: z.array(stageNodeSchema),
  edges: z.array(stageEdgeSchema),
    directives: z.array(policyDirectiveSchema),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .transform((value) => ({
    ...value,
    id: `${value.tenant}.${value.scenarioId}`,
    tenant: makeTenantId(value.tenant),
    workspace: makeWorkspaceId(value.workspace),
    scenarioId: makeScenarioId(makeTenantId(value.tenant), value.scenarioId),
  })) as unknown as z.ZodType<RecoveryRunbook>;

export const runSchema = z
  .object({
    runId: z.string().min(3),
    scenario: z.string().min(3),
    startedAt: z.string().datetime(),
  finishedAt: z.string().datetime().optional(),
    status: nodeStatus,
    observedNodes: z.array(z.string()),
    commandCount: z.number().int().nonnegative(),
  })
  .transform((value) => ({
    ...value,
    runId: brandRunId(value.scenario, value.commandCount),
    scenario: makeScenarioId(makeTenantId(value.scenario.split('.')[0] ?? 'tenant'), value.scenario.split('.')[1] ?? 'scenario'),
  })) as unknown as z.ZodType<RecoveryRun>;

export const scenarioTemplateSchema = z.object({
  phases: z.array(stageKind),
  tags: z.array(z.string()),
  policy: policyDirectiveSchema,
}) as unknown as z.ZodType<RecoveryScenarioTemplate>;

export const runTemplateSchema = z.object({
  tenant: z.string().min(3),
  workspace: z.string().min(3),
  scenarioId: z.string().min(3),
  phases: z.array(stageKind),
  tags: z.array(z.string()),
  directives: z.array(policyDirectiveSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}) as unknown as z.ZodType<{
  tenant: string;
  workspace: string;
  scenarioId: string;
  phases: readonly string[];
  tags: readonly string[];
  directives: readonly {
    readonly code: string;
    readonly command: string;
    readonly scope: string;
    readonly requiredCapabilities: readonly string[];
    readonly metadata: Record<string, unknown>;
  }[];
  createdAt: string;
  updatedAt: string;
}>;

export const parseRunbook = (value: unknown): RecoveryRunbook => runbookSchema.parse(value);
export const parseRun = (value: unknown): RecoveryRun => runSchema.parse(value);
export const parseTemplate = (value: unknown): RecoveryScenarioTemplate => scenarioTemplateSchema.parse(value);
export const parseRunTemplate = (value: unknown): unknown => runTemplateSchema.parse(value);

export type ParsedRunbook = z.output<typeof runbookSchema>;
export type ParsedRun = z.output<typeof runSchema>;
