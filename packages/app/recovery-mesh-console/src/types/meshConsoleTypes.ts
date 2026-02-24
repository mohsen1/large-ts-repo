import { withBrand } from '@shared/core';
import { z } from 'zod';
import { parseTopology, type MeshPayloadFor, type MeshSignalKind, type MeshTopology, type MeshTopologyEdge } from '@domain/recovery-ops-mesh';

const defaultTopologyTemplate = parseTopology({
  id: 'default-topology-metadata',
  name: 'default-template',
  version: '1.0.0',
  nodes: [],
  links: [],
  createdAt: Date.now(),
  namespace: 'mesh:runtime',
});

export const runRequestSchema = z.object({
  kind: z.enum(['pulse', 'snapshot', 'alert', 'telemetry']),
  value: z.number().default(0),
  runId: z.string().default('run-auto'),
  planId: z.string(),
});

export type MeshRunRequestInput = z.infer<typeof runRequestSchema>;

export interface MeshTopologyCardProps {
  readonly title: string;
  readonly status: 'online' | 'offline' | 'degraded';
  readonly score: number;
  readonly tags: readonly string[];
}

export interface MeshTelemetryPoint {
  readonly at: number;
  readonly value: number;
}

export interface MeshConsoleConfig {
  readonly namespace: string;
  readonly enabled: boolean;
  readonly maxBatch: number;
  readonly sampleRate: number;
}

export interface MeshCommandDraft<TSignal extends MeshSignalKind = MeshSignalKind> {
  readonly runId: string;
  readonly planId: string;
  readonly signal: MeshPayloadFor<TSignal>;
}

export const describeRunRequest = (input: MeshRunRequestInput) => {
  const parsed = runRequestSchema.parse(input);
  const resolved = meshPayloadFor(parsed.kind, parsed.value);
  return {
    ...parsed,
    signal: resolved,
    value: parsed.value,
  };
};

const meshPayloadFor = (kind: MeshSignalKind, value: number): MeshPayloadFor<MeshSignalKind> => {
const topology: MeshTopology = {
    ...defaultTopologyTemplate,
    id: withBrand(`plan-snapshot-${value}`, 'MeshPlanId'),
    name: `snapshot-${value}`,
  };

  switch (kind) {
    case 'pulse':
      return { kind, payload: { value } };
    case 'snapshot':
      return { kind, payload: topology };
    case 'alert':
      return { kind, payload: { severity: 'critical', reason: `critical-${value}` } };
    case 'telemetry':
      return { kind, payload: { metrics: { value } } };
  }
};

export const summarizeConsoleConfig = (
  config: MeshConsoleConfig,
): Readonly<MeshConsoleConfig> => ({
  namespace: config.namespace,
  enabled: config.enabled,
  maxBatch: Math.max(1, Math.floor(config.maxBatch)),
  sampleRate: Math.min(1, Math.max(0.05, config.sampleRate)),
});

export const makeTagMap = <T extends readonly string[]>(tags: T): Record<T[number], true> =>
  Object.fromEntries(tags.map((tag) => [tag, true])) as Record<T[number], true>;

export type ConsoleSignal = MeshPayloadFor<MeshSignalKind>;
export type AlertSignals = Extract<ConsoleSignal, { kind: 'alert' }>;
export type SnapshotSignal = Extract<ConsoleSignal, { kind: 'snapshot' }>;

export const isHighPriority = (signal: MeshPayloadFor<MeshSignalKind>): boolean =>
  signal.kind === 'alert';

export const isAlertPayload = (
  signal: MeshPayloadFor<MeshSignalKind>,
): signal is Extract<MeshPayloadFor<MeshSignalKind>, { kind: 'alert' }> => signal.kind === 'alert';

export const flattenCommandDrafts = <T extends readonly MeshCommandDraft<MeshSignalKind>[]>(
  drafts: T,
): T[number]['runId'][] => drafts.map((draft) => draft.runId);

export const commandDigest = <T extends MeshCommandDraft<MeshSignalKind>>(draft: T): string => {
  return `${draft.planId}:${draft.runId}:${draft.signal.kind}`;
};

export const isStableTopology = (topology: MeshTopology): boolean =>
  topology.nodes.length > 0 && topology.links.length >= 0;

export const isTopologyEdge = (input: unknown): input is MeshTopologyEdge => {
  return typeof input === 'object' && input !== null && 'id' in input && 'from' in input && 'to' in input;
};
