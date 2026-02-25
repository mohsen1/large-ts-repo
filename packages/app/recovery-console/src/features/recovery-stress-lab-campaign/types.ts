import { 
  CommandRunbook,
  CampaignPlanResult,
  OrchestrationPlan,
  RecoverySimulationResult,
  TenantId,
  RecoverySignal,
  RecoverySignalId,
} from '@domain/recovery-stress-lab';

export interface CampaignWorkspaceFilters {
  readonly bands: readonly {
    readonly band: 'low' | 'medium' | 'high' | 'critical';
  }[];
  readonly query: string;
}

export interface CampaignWorkspaceRecord {
  readonly tenantId: TenantId;
  readonly campaignId: string;
  readonly phases: readonly string[];
  readonly selectedSignals: readonly RecoverySignal[];
  readonly plan: OrchestrationPlan | CampaignPlanResult | null;
  readonly simulation: RecoverySimulationResult | null;
  readonly catalogSignature: string;
}

export interface CampaignCommand {
  readonly campaignId: string;
  readonly runbookId: string;
  readonly title: string;
  readonly status: 'idle' | 'running' | 'error' | 'complete';
  readonly active: boolean;
}

export interface CampaignSummary {
  readonly totalSignals: number;
  readonly planWindows: number;
  readonly forecastHints: readonly string[];
  readonly lastCommand?: CampaignCommand;
}

export interface CampaignSignalCandidate {
  readonly id: RecoverySignalId;
  readonly title: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
  readonly score: number;
}

export interface CampaignCommandRow {
  readonly id: string;
  readonly title: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface CampaignCommandGroup {
  readonly runbooks: readonly CommandRunbook[];
  readonly workspaceCatalogSignature: string;
}
