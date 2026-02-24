import { z } from 'zod';
import type {
  ControlPlaneConstraint,
  ControlPlaneLane,
  ControlPlaneMode,
  ControlPlaneRunId,
  ControlPlaneTenantId,
} from './types';

export interface ControlPlaneWindow {
  readonly from: string;
  readonly to: string;
  readonly timezone: string;
}

export interface ControlPlaneInput {
  readonly tenantId: ControlPlaneTenantId;
  readonly lane: ControlPlaneLane;
  readonly mode: ControlPlaneMode;
  readonly runId: ControlPlaneRunId;
  readonly window: ControlPlaneWindow;
  readonly constraints: readonly ControlPlaneConstraint[];
  readonly context: Record<string, unknown>;
  readonly stream: string;
}

export interface ControlPlaneConfig {
  readonly namespace: string;
  readonly lane: ControlPlaneLane;
  readonly mode: ControlPlaneMode;
  readonly enabled: boolean;
  readonly maxParallelism: number;
  readonly throttleWindowMs: number;
  readonly window: ControlPlaneWindow;
  readonly artifacts: {
    readonly enabled: boolean;
    readonly bucket?: string;
    readonly prefix?: string;
  };
  readonly tags: readonly string[];
}

const constraintSchema = z.object({
  name: z.string(),
  required: z.boolean().default(true),
  weight: z.number().min(0).max(1),
});

const controlWindowSchema = z.object({
  from: z.string(),
  to: z.string(),
  timezone: z.string(),
});

const laneSchema = z.enum([
  'signal',
  'topology',
  'policy',
  'safety',
  'simulation',
  'governance',
  'postmortem',
]);

const modeSchema = z.enum([
  'discovery',
  'control',
  'simulation',
  'policy-what-if',
  'audit',
  'rollback',
]);

const configSchema = z.object({
  namespace: z.string().trim().min(3).transform((value: string) => value.toLowerCase()),
  lane: laneSchema,
  mode: modeSchema,
  enabled: z.boolean().default(true),
  maxParallelism: z.number().int().min(1).max(32),
  throttleWindowMs: z.number().int().min(0).default(0),
  window: controlWindowSchema,
  artifacts: z
    .object({
      enabled: z.boolean().default(false),
      bucket: z.string().optional(),
      prefix: z.string().optional(),
    })
    .default({ enabled: false }),
  tags: z.array(z.string()).default([]),
});

export const parseControlConfig = (input: unknown): ControlPlaneConfig => {
  return configSchema.parse(input) as ControlPlaneConfig;
};

export const parseControlInput = (
  input: {
    tenantId: string;
    lane: string;
    mode: string;
    runId: string;
    window: ControlPlaneWindow;
    constraints: readonly { name: string; required: boolean; weight: number }[];
    context: Record<string, unknown>;
    stream: string;
  },
): ControlPlaneInput => {
  const lane = laneSchema.parse(input.lane) as ControlPlaneLane;
  const mode = modeSchema.parse(input.mode) as ControlPlaneMode;
  const runId = input.runId as ControlPlaneRunId;
  const tenantId = input.tenantId as ControlPlaneTenantId;
  const stream = String(input.stream ?? `${tenantId}::${Date.now()}`);
  return {
    tenantId,
    lane,
    mode,
    runId,
    window: input.window,
    constraints: input.constraints.map((constraint) => ({
      ...constraintSchema.parse(constraint),
      weight: Number(constraint.weight.toFixed(6)),
    })) as readonly ControlPlaneConstraint[],
    context: input.context,
    stream,
  };
};

const normalizeTag = (value: string): string => value.toLowerCase().trim().replace(/\\s+/g, '-');

export const normalizeConfigTags = (tags: readonly string[]): readonly string[] =>
  tags.toSorted().map((entry) => normalizeTag(entry)).filter((entry) => entry.length > 0);

export const isControlEnabled = (config: ControlPlaneConfig): boolean =>
  config.enabled && config.window.from < config.window.to;

export const buildControlSignature = (config: ControlPlaneConfig): string =>
  `${config.namespace}::${config.lane}::${config.mode}::${config.maxParallelism}::${normalizeConfigTags(config.tags).join(',')}`;
