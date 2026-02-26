import type { Brand } from '@shared/type-level';
import type { FlowCommandId, LatticeOutput, LatticeInput, FlowCommand } from '@domain/recovery-lab-stress-lab-core';

export type StressPanelMode = 'dashboard' | 'planner' | 'inspector' | 'audit' | 'trace';
export type StressTenant = Brand<string, 'StressTenant'>;
export type StressRunId = Brand<string, 'StressRunId'>;
export type StressRoute = Brand<string, 'StressRoute'>;

export interface StressRunSeed {
  readonly tenant: StressTenant;
  readonly mode: StressPanelMode;
  readonly route: StressRoute;
  readonly weight: number;
}

export interface StressCommandDraft {
  readonly id: FlowCommandId;
  readonly tenant: StressTenant;
  readonly route: StressRoute;
  readonly active: boolean;
  readonly severity: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
}

export interface StressControlPanelConfig {
  readonly tenant: StressTenant;
  readonly includeSimulation: boolean;
  readonly includeAudit: boolean;
  readonly batchSize: number;
}

export interface StressControlPanelState {
  readonly mode: StressPanelMode;
  readonly runId: StressRunId;
  readonly seed: StressRunSeed;
  readonly running: boolean;
  readonly commands: readonly StressCommandDraft[];
  readonly lattice: readonly LatticeOutput[];
  readonly latticeInput: readonly LatticeInput[];
  readonly refreshToken: number;
}

export type RouteSegment = `${string}/${string}/${string}`;

export type StressSection =
  | { readonly kind: 'summary'; readonly value: number }
  | { readonly kind: 'warning'; readonly reason: string }
  | { readonly kind: 'error'; readonly code: string };

export type StressSectionMap = {
  summary: Extract<StressSection, { kind: 'summary' }>;
  warning: Extract<StressSection, { kind: 'warning' }>;
  error: Extract<StressSection, { kind: 'error' }>;
};

export interface StressBoardInput {
  readonly tenant: StressTenant;
  readonly plans: readonly StressRunSeed[];
  readonly mode: StressPanelMode;
}

export const isActiveCommand = (value: StressCommandDraft): boolean => value.active && value.severity > 0;

export const toRoute = (tenant: string, path: string, phase: StressPanelMode): StressRoute =>
  `/${tenant}/${path}/${phase}` as StressRoute;

export const defaultStressPanelConfig = (tenant: string): StressControlPanelConfig => ({
  tenant: tenant as StressTenant,
  includeSimulation: true,
  includeAudit: false,
  batchSize: 5,
});

export type BoardBuckets<T extends readonly string[]> = {
  [K in T[number] as `${K}_bucket`]: readonly FlowCommand[];
};

export const bucketCommands = (commands: readonly StressCommandDraft[]): BoardBuckets<['low', 'medium', 'high']> => {
  const buckets: {
    low: FlowCommand[];
    medium: FlowCommand[];
    high: FlowCommand[];
  } = {
    low: [],
    medium: [],
    high: [],
  };
  for (const command of commands) {
    if (command.severity <= 2) {
      buckets.low.push({
        commandId: command.id,
        phase: 'dispatch',
        domain: 'ops',
        domainIndex: command.id.length,
        severity: command.severity,
      });
    } else if (command.severity <= 5) {
      buckets.medium.push({
        commandId: command.id,
        phase: 'validate',
        domain: 'signal',
        domainIndex: command.id.length + 1,
        severity: command.severity,
      });
    } else {
      buckets.high.push({
        commandId: command.id,
        phase: 'execute',
        domain: 'fabric',
        domainIndex: command.id.length + 2,
        severity: command.severity,
      });
    }
  }
  return {
    low_bucket: buckets.low,
    medium_bucket: buckets.medium,
    high_bucket: buckets.high,
  } as const;
};
