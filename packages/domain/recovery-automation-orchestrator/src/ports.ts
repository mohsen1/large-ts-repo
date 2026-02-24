import type { NoInfer } from '@shared/typed-orchestration-core';
import type { AutomationSummary, AutomationExecutionConfig, AutomationTenantId, AutomationRunId } from './types';

export interface RunPort {
  readonly send: (runId: AutomationRunId, event: string) => Promise<boolean>;
  readonly receive: (runId: AutomationRunId) => Promise<readonly string[]>;
  readonly close: (runId: AutomationRunId) => Promise<void>;
}

export interface TelemetryPort {
  readonly publish: (tenant: AutomationTenantId, topic: string, payload: Readonly<Record<string, unknown>>) => Promise<void>;
  readonly snapshot: (tenant: AutomationTenantId) => Promise<Record<string, unknown>>;
}

export interface PlanPort {
  readonly validate: (payload: unknown) => Promise<boolean>;
  readonly persistSummary: (summary: AutomationSummary) => Promise<void>;
}

export interface AutomationPorts {
  readonly runPort: RunPort;
  readonly telemetryPort: TelemetryPort;
  readonly planPort: PlanPort;
}

export const defaultTelemetryPort: TelemetryPort = {
  publish: async () => {},
  snapshot: async () => ({
    timestamp: new Date().toISOString(),
    status: 'ok',
  }),
};

export const defaultRunPort = (tenant: AutomationTenantId): RunPort => ({
  send: async () => true,
  receive: async () => [`tenant:${tenant}:events`],
  close: async () => {},
});

export const defaultPlanPort = {
  validate: async () => true,
  persistSummary: async () => {},
} satisfies PlanPort;

export interface RunPlanOptions<TConfig extends AutomationExecutionConfig = AutomationExecutionConfig> {
  readonly scenarioId: string;
  readonly tenant: AutomationTenantId;
  readonly config: NoInfer<TConfig>;
}
