import type { SynthesisWorkspaceEvent } from '@domain/recovery-scenario-lens';
import type { OrchestratorEnvelope } from './types';

export const isWellFormedEnvelope = (value: unknown): value is OrchestratorEnvelope => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return (
    'runId' in value &&
    'status' in value &&
    'model' in value &&
    'warnings' in value &&
    'metrics' in value
  );
};

export const isWorkspaceEvent = (value: unknown): value is SynthesisWorkspaceEvent => {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return (
    'traceId' in value &&
    'kind' in value &&
    'payload' in value &&
    'when' in value
  );
};

export const groupByStage = <T extends { readonly kind: string }>(items: readonly T[]): Record<string, number> => {
  return items.reduce<Record<string, number>>((acc, item) => {
    const kind = item.kind as string;
    acc[kind] = (acc[kind] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
};
