import type { CampaignPlan, CampaignRun, DispatchEnvelope } from '@domain/recovery-signal-orchestration-models';
import type { SignalPlan, SignalCommand } from '@domain/recovery-signal-intelligence';
import type { SignalFeedSnapshot } from '@domain/recovery-signal-intelligence';
import { type CampaignRecord } from '@data/recovery-signal-orchestration-store';
import { buildTopology } from '@domain/recovery-signal-orchestration-models';

export interface SignalCampaignUiAdapter {
  readonly id: string;
  readonly label: string;
  readonly score: number;
  readonly state: string;
  readonly topologyDimension: string;
}

export const toSignalPlan = (plan: CampaignPlan): SignalPlan => ({
  id: plan.id,
  tenantId: plan.tenantId,
  signals: plan.signals.map((signal) => ({
    id: signal.signalId,
    category: 'incident',
    tenantId: plan.tenantId,
    facilityId: signal.facilityId,
    dimension: signal.dimension,
    value: signal.impactProjection * 100,
    baseline: 20,
    weight: signal.facilityWeight,
    timestamp: new Date().toISOString(),
    observedAt: new Date().toISOString(),
    source: 'agent',
    unit: 'points',
    tags: ['plan', signal.dimension],
  })),
  windows: plan.timeline.map((step) => ({
    start: new Date(Date.now() + step.etaMinutes * 60 * 1000).toISOString(),
    end: new Date(Date.now() + (step.etaMinutes + 2) * 60 * 1000).toISOString(),
    bucketMinutes: 5,
    labels: step.dimension ? [step.name, step.dimension] : [step.name],
  })),
  score: plan.signals.length === 0 ? 0 : Number(plan.timeline.reduce((acc, step) => acc + step.confidence, 0).toFixed(4)),
  confidence: Number(Math.max(0, 1 - plan.timeline.length / 12).toFixed(4)),
  actions: plan.signals.map((signal, index) => ({
    actionId: `${plan.id}:action:${index}`,
    pulseId: signal.signalId,
    dimension: signal.dimension,
    runbook: `standard-${plan.mode}`,
    command: `recover-${signal.dimension}`,
    expectedSavings: 14,
  })),
});

export const toDispatch = (command: SignalCommand): DispatchEnvelope => ({
  runId: `${command.planId}:run` as DispatchEnvelope['runId'],
  planId: command.planId as DispatchEnvelope['planId'],
  timestamp: command.createdAt,
  action: command.state === 'queued' ? 'start' : 'complete',
  reason: String(command.requestedBy),
});

export const enrichSnapshot = (snapshot: SignalFeedSnapshot): { topFacility: string; signalCount: number } => ({
  topFacility: snapshot.facilityId,
  signalCount: snapshot.pulses.length,
});

export const planToCampaignSummary = (record: CampaignRecord): SignalCampaignUiAdapter => {
  const topology = buildTopology(
    record.plan.signals.map((signal) => ({
      id: signal.signalId,
      category: 'incident',
      tenantId: record.envelope.tenantId,
      facilityId: signal.facilityId,
      dimension: signal.dimension,
      value: signal.impactProjection,
      baseline: signal.impactProjection * 0.8,
      weight: signal.facilityWeight,
      timestamp: record.envelope.createdAt,
      observedAt: record.envelope.createdAt,
      source: 'agent',
      unit: 'u',
      tags: ['signal', signal.dimension],
    })),
  );

  return {
    id: record.plan.id,
    label: `${record.envelope.tenantId}:${record.envelope.facilityId}`,
    score: record.plan.signals.length === 0 ? 0 : Number((record.run.score / Math.max(1, record.plan.signals.length)).toFixed(4)),
    state: record.run.state,
    topologyDimension: topology.topDimension,
  };
};
