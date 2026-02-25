import { z } from 'zod';
import type { ZodIssue } from 'zod';
import { flow } from './iterator-tools';
import type { NoInfer } from '@shared/type-level';
import type {
  PluginWindow,
  SessionDescriptor,
  StudioPolicySpec,
} from './advanced-types';
import { normalizeScenarioId, normalizeTenantId, normalizeWorkspaceId } from './advanced-types';

const workspaceSchema = z.object({
  tenant: z.string().trim().min(1),
  workspace: z.string().trim().min(1),
  scenario: z.string().trim().min(1),
});

const policySchema = z.object({
  id: z.string().trim().min(1),
  weight: z.number().min(0).max(100),
  lane: z.enum(['simulate', 'verify', 'restore', 'recover']).optional(),
  tags: z.array(z.string()).optional(),
});

const windowSchema = z.object({
  start: z.number(),
  end: z.number(),
  values: z.array(z.number()),
});

const sessionSchema = z.object({
  tenant: z.string().trim().min(1),
  workspace: z.string().trim().min(1),
  scenario: z.string().trim().min(1),
  runId: z.string().trim().min(1),
  pluginWeight: z.number().min(0).max(100),
  windows: z.array(windowSchema),
});

const payloadSchema = z.object({
  tenant: z.string().trim().min(1),
  workspace: z.string().trim().min(1),
  scenario: z.string().trim().min(1),
  runId: z.string().trim().min(1),
  policies: z.array(policySchema).default([]),
  windows: z.array(windowSchema).default([]),
});

interface ParseOk<T> {
  readonly ok: true;
  readonly value: T;
}

interface ParseErr {
  readonly ok: false;
  readonly errors: readonly string[];
}

export type ParseResult<T> = ParseOk<T> | ParseErr;

export interface SessionEnvelope {
  readonly tenant: string;
  readonly workspace: string;
  readonly scenario: string;
  readonly runId: string;
  readonly policies: readonly StudioPolicySpec[];
  readonly windows: readonly PluginWindow[];
}

export interface PolicyEnvelope {
  readonly id: string;
  readonly weight: number;
  readonly tags: readonly string[];
}

export const parseWorkspaceEnvelope = (value: unknown): ParseResult<SessionDescriptor> => {
  const parsed = workspaceSchema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue: ZodIssue) => issue.path.join('.')),
    };
  }

  return {
    ok: true,
    value: {
      tenant: `${normalizeTenantId(parsed.data.tenant)}`,
      workspace: `${normalizeWorkspaceId(parsed.data.workspace)}`,
      runRef: `${parsed.data.tenant}:${parsed.data.workspace}:${parsed.data.scenario}`,
    },
  };
};

export const parsePolicyEnvelope = (value: unknown): ParseResult<readonly PolicyEnvelope[]> => {
  const parsed = z.array(policySchema).safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue: ZodIssue) => issue.path.join('.')),
    };
  }

  return {
    ok: true,
    value: parsed.data.map((item) => ({
      id: item.id,
      weight: item.weight,
      tags: item.tags ?? [],
    })),
  };
};

export const parseSessionEnvelope = (raw: unknown): ParseResult<SessionEnvelope> => {
  const parsed = sessionSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue: ZodIssue) => issue.message),
    };
  }

  return {
    ok: true,
    value: {
      tenant: parsed.data.tenant,
      workspace: parsed.data.workspace,
      scenario: parsed.data.scenario,
      runId: parsed.data.runId,
      policies: [],
      windows: parsed.data.windows.map((entry) => ({
        start: entry.start,
        end: entry.end,
        values: entry.values,
      })),
    },
  };
};

export const parsePayloadEnvelope = <TInput>(
  raw: unknown,
): ParseResult<{
  readonly tenant: string;
  readonly workspace: string;
  readonly scenario: string;
  readonly runId: string;
  readonly policies: readonly StudioPolicySpec[];
  readonly windows: readonly PluginWindow[];
  readonly payload: TInput;
}> => {
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue: ZodIssue) => issue.path.join('.')),
    };
  }

  return {
    ok: true,
    value: {
      tenant: `${normalizeTenantId(parsed.data.tenant)}`,
      workspace: `${normalizeWorkspaceId(parsed.data.workspace)}`,
      scenario: `${normalizeScenarioId(parsed.data.scenario)}`,
      runId: `${parsed.data.runId}`,
      policies: parsed.data.policies.map((policy) => ({
        id: policy.id,
        weight: policy.weight,
        lane: policy.lane,
        tags: policy.tags,
      })),
      windows: parsed.data.windows.map((window) => ({
        start: window.start,
        end: window.end,
        values: window.values,
      })),
      payload: parsed.data as unknown as TInput,
    },
  };
};

export const toPolicySpecs = (items: readonly PolicyEnvelope[]): readonly StudioPolicySpec[] => {
  const normalized = flow(items)
    .map((item: PolicyEnvelope) => ({
      id: `${item.id}`,
      weight: Math.min(100, Math.max(0, item.weight)),
      tags: item.tags,
      lane: 'simulate' as const,
    }))
    .toSorted((left, right) => right.weight - left.weight)
    .toArray();

  return normalized;
};

export const parsePolicyBundle = <TInput>(
  tenant: string,
  workspace: string,
  scenario: string,
  raw: NoInfer<TInput>,
): ParseResult<{
  readonly tenant: string;
  readonly workspace: string;
  readonly scenario: string;
  readonly payload: TInput;
}> => {
  if (!tenant || !workspace || !scenario) {
    return {
      ok: false,
      errors: ['missing:tenant-workspace-scenario'],
    };
  }

  if (raw === undefined) {
    return {
      ok: false,
      errors: ['missing:raw-payload'],
    };
  }

  return {
    ok: true,
    value: {
      tenant,
      workspace,
      scenario: `${scenario}`,
      payload: raw,
    },
  };
};
