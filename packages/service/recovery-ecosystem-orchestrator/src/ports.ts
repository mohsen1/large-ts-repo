import type { EcosystemStorePort } from '@data/recovery-ecosystem-store';
import type { RunId, TenantId, NamespaceTag } from '@domain/recovery-ecosystem-core';
import type { Result } from '@shared/result';

export interface TelemetrySink {
  publish(payload: Record<string, unknown>): Promise<void>;
  trace(event: string, metadata: Record<string, unknown>): Promise<void>;
}

export interface OrchestratorPort {
  open(runId: RunId): Promise<Result<boolean>>;
  close(runId: RunId): Promise<void>;
  signal(runId: RunId, event: string, details: Record<string, unknown>): Promise<void>;
}

export interface ServiceDependencies {
  readonly store: EcosystemStorePort;
  readonly telemetry: TelemetrySink;
  readonly adapter: OrchestratorPort;
  readonly tenant: TenantId;
  readonly namespace: NamespaceTag;
}

export interface ServiceEnvelope<TPayload = unknown> {
  readonly tenant: TenantId;
  readonly namespace: NamespaceTag;
  readonly payload: TPayload;
}

export const defaultDependencies = (tenant: TenantId, namespace: NamespaceTag): ServiceDependencies => ({
  store: undefined as unknown as EcosystemStorePort,
  telemetry: {
    publish: async () => {},
    trace: async () => {},
  },
  adapter: {
    open: async () => ({ ok: true, value: true }),
    close: async () => {},
    signal: async () => {},
  },
  tenant,
  namespace,
});
