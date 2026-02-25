import {
  CampaignPlanResult,
  CommandRunbook,
  OrchestrationPlan,
  createSignalId,
  RecoverySimulationResult,
  TenantId,
  RecoverySignal,
} from '@domain/recovery-stress-lab';
import { type CampaignSummary, type CampaignWorkspaceRecord } from '../types';

export interface CampaignNode {
  readonly id: string;
  readonly title: string;
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface CampaignSignalRow {
  readonly id: string;
  readonly label: string;
  readonly score: number;
}

export const asWorkspaceRecord = (tenantId: TenantId): CampaignWorkspaceRecord => ({
  tenantId,
  campaignId: `${tenantId}:campaign`,
  phases: ['seed', 'discovery', 'orchestration'],
  selectedSignals: [],
  plan: null,
  simulation: null,
  catalogSignature: `${tenantId}-base`,
});

export const mapSignalsToRows = (signals: readonly RecoverySignal[]): readonly CampaignSignalRow[] =>
  signals.map((signal) => ({
    id: String(signal.id),
    label: `${signal.class}:${signal.title}`,
    score: signal.title.length + signal.class.length + Object.keys(signal.metadata ?? {}).length,
  }));

const mapCampaignPlanToNodeRows = (plan: CampaignPlanResult): readonly CampaignNode[] =>
  plan.plan.map((stage, index) => ({
    id: `${plan.sessionId}-${index}-${stage.label}`,
    title: `${stage.stage}:${stage.label}`,
    severity: stage.weight > 40 ? 'critical' : stage.weight > 20 ? 'high' : 'medium',
  }));

export const mapPlanToNodes = (plan: OrchestrationPlan | CampaignPlanResult | null): readonly CampaignNode[] =>
  plan === null
    ? []
    : 'schedule' in plan
      ? plan.runbooks.flatMap((runbook: CommandRunbook) =>
          runbook.steps.map((step) => ({
            id: String(step.commandId),
            title: `${runbook.name}:${step.title}`,
            severity: step.phase === 'restore' ? 'low' : 'critical',
          })),
        )
      : mapCampaignPlanToNodeRows(plan);

export const summarizeCampaignWorkspace = (
  catalogSignature: string,
  plan: OrchestrationPlan | CampaignPlanResult | null,
  simulation: RecoverySimulationResult | null,
  selectedSignals: readonly RecoverySignal[],
): CampaignSummary => {
  const planWindows =
    plan === null ? 0 : 'schedule' in plan ? plan.schedule.length : plan.plan.length;
  const runbookId =
    plan === null || !('schedule' in plan)
      ? ''
      : plan.schedule[0]?.runbookId ?? '';
  const planStatus: CampaignSummary['lastCommand'] | undefined = plan
    ? {
        campaignId: catalogSignature,
        runbookId,
        title: `plan-${planWindows}`,
        status: simulation ? 'complete' : 'running',
        active: true,
      }
    : undefined;

  return {
    totalSignals: selectedSignals.length,
    planWindows,
    forecastHints: [
      catalogSignature,
      `simulation:${simulation?.riskScore ?? 0}`,
      `sla:${simulation?.slaCompliance ?? 1}`,
    ],
    lastCommand: planStatus,
  };
};

export const routeFromCampaignId = (campaignId: string): readonly string[] =>
  campaignId
    .split('-')
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());

export const buildCampaignHeaders = (
  campaignId: string,
  tenant: TenantId,
): readonly { readonly key: string; readonly value: string }[] => [
  { key: 'tenant', value: String(tenant) },
  { key: 'campaign', value: campaignId },
  { key: 'fetched', value: new Date().toISOString() },
];

export const enrichSignalsFromQuery = (query: string): readonly RecoverySignal[] =>
  query
    .split('\n')
    .flatMap((line) => line.split(','))
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry, index) => ({
      id: createSignalId(`query:${index}-${entry}`),
      class: 'availability',
      severity: 'low',
      title: `query:${entry}`,
      createdAt: new Date().toISOString(),
      metadata: { source: 'query', rank: index },
    }));
