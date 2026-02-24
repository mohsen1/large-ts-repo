import { z } from 'zod';

import { fail, ok, type Result } from '@shared/result';
import { createSignalId, createTenantId, createWorkloadId, createRunbookId, type WorkloadTarget } from './models';
import {
  type WorkflowWorkspaceSeed,
  type WorkspaceSeedInput,
  normalizeAdvancedWorkspace,
} from './advanced-workflow-models';

const severityBand = ['low', 'medium', 'high', 'critical'] as const;
const workflowModes = ['conservative', 'adaptive', 'agile'] as const;
const signalClasses = ['availability', 'integrity', 'performance', 'compliance'] as const;

const signalSchema = z.object({
  id: z.string().min(1),
  class: z.enum(signalClasses),
  severity: z.enum(severityBand),
  title: z.string().min(1),
  createdAt: z.string().datetime(),
  metadata: z.record(z.unknown()).default({}),
});

const targetSchema = z.object({
  tenantId: z.string().min(1).optional(),
  workloadId: z.string().min(1).optional(),
  commandRunbookId: z.string().min(1).optional(),
  name: z.string().min(1),
  criticality: z.number().int().min(1).max(5),
  region: z.string().default('us-east-1'),
  azAffinity: z.array(z.string()).default([]),
  baselineRtoMinutes: z.number().min(0).max(600).default(30),
  dependencies: z.array(z.string()).default([]),
});

const workspaceSchema = z.object({
  tenantId: z.string().min(1),
  runbooks: z
    .array(
      z.object({
        id: z.string().min(1),
        severityBand: z.enum(severityBand).default('medium'),
        runbookTitle: z.string().min(1),
      }),
    )
    .default([]),
  signals: z.array(signalSchema).default([]),
  targets: z.array(targetSchema).default([]),
  requestedBand: z.enum(severityBand),
  mode: z.enum(workflowModes),
});

export const workflowInputSchema = z.object({
  runId: z.string().optional(),
  workspace: workspaceSchema,
});

export type WorkflowInputDocument = z.infer<typeof workflowInputSchema>;
export type ParsedWorkflowInput = WorkflowInputDocument;

const formatIssue = (path: readonly (string | number)[], message: string): string =>
  `${path.length === 0 ? 'root' : path.join('.')}: ${message}`;

export const parseWorkflowDocument = (payload: unknown): Result<ParsedWorkflowInput, string> => {
  const result = workflowInputSchema.safeParse(payload);
  if (!result.success) {
    return fail(result.error.issues.map((issue) => formatIssue(issue.path as (string | number)[], issue.message)).join('\n'));
  }
  return ok(result.data);
};

const toCriticality = (value: number): WorkloadTarget['criticality'] => {
  const safe = Math.max(1, Math.min(5, Math.floor(value)));
  return safe as WorkloadTarget['criticality'];
};

const mapTarget = (
  value: z.infer<typeof targetSchema>,
  fallbackTenantId: string,
): WorkspaceSeedInput['targets'][number] => ({
  tenantId: createTenantId(value.tenantId ?? fallbackTenantId),
  workloadId: value.workloadId,
  commandRunbookId: value.commandRunbookId,
  name: value.name,
  criticality: toCriticality(value.criticality),
  region: value.region,
  azAffinity: value.azAffinity,
  baselineRtoMinutes: value.baselineRtoMinutes,
  dependencies: value.dependencies,
});

export const parseWorkspaceSeed = (value: unknown): Result<WorkflowWorkspaceSeed, string> => {
  const parsed = parseWorkflowDocument(value);
  if (!parsed.ok) {
    return fail(parsed.error);
  }

  const workspaceTenantId = createTenantId(String(parsed.value.workspace.tenantId));
  const workspaceSeed: WorkspaceSeedInput = {
    tenantId: workspaceTenantId,
    runbooks: parsed.value.workspace.runbooks,
    signals: parsed.value.workspace.signals.map((signal) => ({
      id: signal.id,
      class: signal.class,
      severity: signal.severity,
      title: signal.title,
      createdAt: signal.createdAt,
      metadata: signal.metadata,
    })),
    targets: parsed.value.workspace.targets.map((target) => mapTarget(target, String(workspaceTenantId))),
    requestedBand: parsed.value.workspace.requestedBand,
    mode: parsed.value.workspace.mode,
  };

  return ok(normalizeAdvancedWorkspace(workspaceSeed));
};
