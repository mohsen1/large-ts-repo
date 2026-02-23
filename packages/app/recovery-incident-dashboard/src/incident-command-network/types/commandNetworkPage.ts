import type { DriftSignal, CommandGraph, PolicyRule, RuntimeIntent, CommandNetworkSnapshot, CommandWave, DriftObservation } from '@domain/recovery-command-network';

export interface CommandNetworkPageFilter {
  readonly tenant: string;
  readonly includeSuppressed: boolean;
  readonly criticality: 'all' | 'critical' | 'high' | 'medium' | 'low';
  readonly maxNodes: number;
  readonly maxEdges: number;
}

export interface NetworkRoute {
  readonly index: number;
  readonly nodeId: string;
  readonly policy: string;
  readonly score: number;
  readonly accepted: boolean;
}

export interface NetworkHealthSummary {
  readonly healthy: boolean;
  readonly policyPressure: number;
  readonly graphDensity: number;
  readonly decisionAcceptanceRate: number;
  readonly drift: DriftSignal | null;
}

export interface CommandNetworkDashboardState {
  readonly graph: CommandGraph | null;
  readonly snapshot: CommandNetworkSnapshot | null;
  readonly plans: readonly RuntimeIntent[];
  readonly routes: readonly NetworkRoute[];
  readonly selectedWave: CommandWave | null;
  readonly health: NetworkHealthSummary;
  readonly recentDrifts: readonly DriftObservation[];
  readonly policies: readonly PolicyRule[];
}

export interface CommandNetworkWorkspaceProps {
  readonly networkId: string;
  readonly filter: CommandNetworkPageFilter;
  readonly onPolicySelect: (policyId: string) => void;
  readonly onNodeFocus: (nodeId: string) => void;
}

export const defaultFilter: CommandNetworkPageFilter = {
  tenant: 'core-observability',
  includeSuppressed: true,
  criticality: 'all',
  maxNodes: 64,
  maxEdges: 128,
};
