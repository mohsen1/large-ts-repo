import { withBrand } from '@shared/core';
import type { Brand } from '@shared/core';

export type LabTenantId = Brand<string, 'LabTenantId'>;
export type LabRunId = Brand<string, 'LabRunId'>;
export type LabScenarioId = Brand<string, 'LabScenarioId'>;
export type LabPluginId = Brand<string, 'LabPluginId'>;
export type LabResourcePath = `/tenants/${string}/runs/${string}`;

export interface TenantEnvelope {
  readonly tenantId: LabTenantId;
  readonly runId: LabRunId;
}

export const asLabTenantId = (value: string): LabTenantId => withBrand(value.trim(), 'LabTenantId');
export const asLabRunId = (value: string): LabRunId => withBrand(value.trim(), 'LabRunId');
export const asLabScenarioId = (value: string): LabScenarioId => withBrand(value.trim(), 'LabScenarioId');
export const asLabPluginId = (value: string): LabPluginId => withBrand(value.trim(), 'LabPluginId');

export const createRunAddress = (tenant: LabTenantId, runId: LabRunId): LabResourcePath =>
  `/tenants/${tenant}/runs/${runId}`;

export const isLabRunAddress = (value: string): value is LabResourcePath =>
  /^\/tenants\/[\w-]+\/runs\/[\w-]+$/.test(value);

export const parseRunAddress = (value: LabResourcePath): TenantEnvelope => {
  const parts = value.split('/');
  return {
    tenantId: asLabTenantId(parts[2] ?? 'tenant-0'),
    runId: asLabRunId(parts[4] ?? 'run-0'),
  };
};
