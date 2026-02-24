import type { Brand } from '@shared/core';

export const syntheticDomain = 'recovery-synthetic-orchestration' as const;

export const syntheticPhases = ['ingest', 'synthesize', 'simulate', 'assess', 'actuate', 'reconcile', 'cleanup'] as const;
export type SyntheticPhase = (typeof syntheticPhases)[number];

export const syntheticPhaseBudgetsMs = {
  ingest: 1_000,
  synthesize: 1_500,
  simulate: 2_200,
  assess: 1_100,
  actuate: 1_600,
  reconcile: 900,
  cleanup: 400,
} satisfies Record<SyntheticPhase, number>;

export type SyntheticDomainNamespace = Brand<string, 'SyntheticDomainNamespace'>;
export type SyntheticTenantId = Brand<string, 'SyntheticTenantId'>;
export type SyntheticWorkspaceId = Brand<string, 'SyntheticWorkspaceId'>;
export type SyntheticRunId = Brand<string, 'SyntheticRunId'>;
export type SyntheticBlueprintId = Brand<string, 'SyntheticBlueprintId'>;
export type SyntheticPluginId = Brand<string, 'SyntheticPluginId'>;
export type SyntheticCorrelationId = Brand<string, 'SyntheticCorrelationId'>;

export const syntheticPriorityBands = ['low', 'medium', 'high', 'critical'] as const;
export type SyntheticPriorityBand = (typeof syntheticPriorityBands)[number];

export const syntheticStatuses = ['queued', 'running', 'succeeded', 'degraded', 'failed', 'cancelled'] as const;
export type SyntheticStatus = (typeof syntheticStatuses)[number];

export const syntheticPluginNamespacePrefix = `${syntheticDomain}-plugin`;
export type SyntheticEventPath = `${SyntheticDomainNamespace}:${SyntheticPhase}:${string}`;

export const defaultSyntheticActor = 'system' as const;
export const syntheticBuildDefaults = {
  maxConcurrency: 4,
  defaultTimeoutMs: 15_000,
  maxRetries: 2,
} as const;

export const syntheticRunPrefix = `${syntheticDomain}:run:` as const;
