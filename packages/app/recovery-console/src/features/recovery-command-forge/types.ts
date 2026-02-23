import type { ForgeNode, ForgePolicyResult, ForgePolicyGate, ForgeExecutionReport } from '@domain/recovery-command-forge';

export interface CommandForgePageViewModel {
  readonly tenant: string;
  readonly title: string;
  readonly planNodes: readonly ForgeNode[];
  readonly signalCount: number;
  readonly policySummary?: string;
  readonly reportId?: string;
}

export interface CommandForgeMetrics {
  readonly coverage: number;
  readonly policyPass: boolean;
  readonly risks: number;
  readonly riskBand: 'low' | 'medium' | 'high';
}

export interface ForgeNodeRenderState {
  readonly node: ForgeNode;
  readonly ready: boolean;
  readonly completed: boolean;
}

export interface ForgePolicySection {
  readonly summary: string;
  readonly gates: readonly ForgePolicyGate[];
  readonly passRate: number;
  readonly passCount: number;
}

export interface ForgePolicyView {
  readonly policy: ForgePolicyResult;
  readonly sections: readonly ForgePolicySection[];
}

export interface ForgeDashboardTelemetry {
  readonly tenant: string;
  readonly events: readonly string[];
  readonly report?: ForgeExecutionReport;
}
