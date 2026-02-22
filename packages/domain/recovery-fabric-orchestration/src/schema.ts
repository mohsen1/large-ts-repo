import { Brand } from '@shared/core';
import type {
  FabricCommand,
  FabricPolicy,
  FabricPlan,
  FabricTopology,
  FabricRun,
  FabricPolicyId,
  FabricCommandId,
  FabricRunId,
} from './types';

const asText = (value: unknown): string => {
  return typeof value === 'string' && value.length > 0 ? value : '';
};

const asNumber = (value: unknown): number => {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const asCommandId = (value: unknown): FabricCommandId => {
  const id = asText(value) || `command-${Date.now()}`;
  return id as never as FabricCommandId;
};

const asTenantId = (value: unknown): Brand<string, 'TenantId'> => {
  return (asText(value) || 'tenant-default') as never;
};

const asPolicyId = (value: unknown): FabricPolicyId => {
  return (asText(value) || `policy-${Date.now()}`) as never;
};

const asRunId = (value: unknown): FabricRunId => {
  return (asText(value) || `run-${Date.now()}`) as never;
};

const asFabricId = (value: unknown): Brand<string, 'FabricId'> => {
  return (asText(value) || `fabric-${Date.now()}`) as never;
};

export const parseCommand = (value: unknown): FabricCommand => {
  const record = isRecord(value) ? value : {};
  return {
    id: asCommandId(record.id),
    tenantId: asTenantId(record.tenantId),
    incidentId: (asText(record.incidentId) || `incident-${Date.now()}`) as never,
    name: asText(record.name) || 'synthetic command',
    priority: (Math.max(1, Math.min(5, Math.floor(asNumber(record.priority) || 1))) as 1 | 2 | 3 | 4 | 5),
    blastRadius: Math.max(1, Math.floor(asNumber(record.blastRadius) || 1)),
    estimatedRecoveryMinutes: Math.max(1, Math.floor(asNumber(record.estimatedRecoveryMinutes) || 1)),
    strategy: (asText(record.strategy) as FabricCommand['strategy']) || 'serial',
    constraints: [],
    runbook: [],
    context: isRecord(record.context) ? record.context : {},
    requiresApprovals: Math.max(0, Math.min(10, Math.floor(asNumber(record.requiresApprovals) || 0))),
    requiresWindows: Array.isArray(record.requiresWindows)
      ? record.requiresWindows.map((entry) => {
          const window = isRecord(entry) ? entry : {};
          return {
            startsAt: asText(window.startsAt) || new Date().toISOString(),
            endsAt: asText(window.endsAt) || new Date(Date.now() + 3_600_000).toISOString(),
            timezone: asText(window.timezone) || 'UTC',
          };
        })
      : [
        {
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 3_600_000).toISOString(),
          timezone: 'UTC',
        },
      ],
  };
};

export const parsePolicy = (value: unknown): FabricPolicy => {
  const record = isRecord(value) ? value : {};
  return {
    id: asPolicyId(record.id),
    tenantId: asTenantId(record.tenantId),
    name: asText(record.name) || 'Synthetic policy',
    description: asText(record.description),
    readinessThreshold: (asText(record.readinessThreshold) as FabricPolicy['readinessThreshold']) || 'warm',
    riskTolerance: (asText(record.riskTolerance) as FabricPolicy['riskTolerance']) || 'amber',
    maxParallelism: Math.max(1, Math.floor(asNumber(record.maxParallelism) || 2)),
    maxRetries: Math.max(0, Math.floor(asNumber(record.maxRetries) || 1)),
  windowHours: {
      min: Math.max(
        0,
        Math.floor(asNumber((record.windowHours && isRecord(record.windowHours) ? record.windowHours.min : 0) || 1)),
      ),
      max: Math.max(
        1,
        Math.floor(asNumber((record.windowHours && isRecord(record.windowHours) ? record.windowHours.max : 0) || 8)),
      ),
    },
    gates: [],
  };
};

const normalizeCommandIds = (record: Record<string, unknown>): FabricCommandId[] => {
  const values = Array.isArray(record.commandIds) ? (record.commandIds as unknown[]) : [];
  return values.map((entry) => asCommandId(asText(entry)));
};

export const parseTopology = (value: unknown): FabricTopology => {
  const record = isRecord(value) ? value : {};
  const commandIds = normalizeCommandIds(record);
  return {
    commandIds,
    edges: [],
    zones: {
      serial: commandIds,
      parallel: [],
      staged: [],
    },
    metadata: isRecord(record.metadata) ? record.metadata : {},
  };
};

export const parseRun = (value: unknown): FabricRun => {
  const record = isRecord(value) ? value : {};
  return {
    id: asRunId(record.id),
    tenantId: asTenantId(record.tenantId),
    fabricId: asFabricId(record.fabricId),
    policyId: asPolicyId(record.policyId),
    incidentId: (asText(record.incidentId) || `incident-${Date.now()}`) as never,
    commandIds: normalizeCommandIds(record),
    startedAt: asText(record.startedAt) || new Date().toISOString(),
    status: (asText(record.status) as FabricRun['status']) || 'queued',
    readinessBand: (asText(record.readinessBand) as FabricRun['readinessBand']) || 'warm',
    riskBand: (asText(record.riskBand) as FabricRun['riskBand']) || 'amber',
    windows: Array.isArray(record.windows)
      ? (record.windows as Record<string, unknown>[]).map((entry) => ({
        startsAt: asText((entry as Record<string, unknown>).startsAt),
        endsAt: asText((entry as Record<string, unknown>).endsAt),
        timezone: asText((entry as Record<string, unknown>).timezone) || 'UTC',
      }))
      : [
        {
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 3_600_000).toISOString(),
          timezone: 'UTC',
        },
      ],
  };
};

export const parsePlan = (value: unknown): FabricPlan => {
  const record = isRecord(value) ? value : {};
  const rawCommands = Array.isArray(record.commands) ? (record.commands as unknown[]) : [];
  return {
    tenantId: asTenantId(record.tenantId),
    policyId: asPolicyId(record.policyId),
    fabricId: asFabricId(record.fabricId),
    commands: rawCommands.map(parseCommand),
    topology: parseTopology(record.topology),
  };
};
