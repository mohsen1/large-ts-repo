import type {
  DomainAdapterState,
  OrchestrationLab,
  OrchestrationPolicy,
  OrchestrationLabEnvelope,
} from './types';
import { buildLabWorkspace } from './planner';
import { summarizeLab, estimateThroughput } from './insights';

export const createLabState = (lab: OrchestrationLab, policy: OrchestrationPolicy): DomainAdapterState => {
  const { envelope, selectedPlan, scores } = buildLabWorkspace({ lab, policy });
  return {
    envelope,
    selectedPlan,
    scores,
  };
};

export const nextPlanCandidates = (state: DomainAdapterState): DomainAdapterState['envelope']['plans'] =>
  state.envelope.plans.slice(0, 3);

export const summarizeDomainState = (state: DomainAdapterState) => summarizeLab(state.envelope.lab, state.scores, state.selectedPlan);

export const formatStateMetrics = (state: DomainAdapterState): string[] => {
  const summary = summarizeDomainState(state);
  return [
    `critical=${summary.criticalSignals}`,
    `totalSignals=${summary.totalSignals}`,
    `topPlan=${summary.topPlan ?? 'none'}`,
    `throughput=${estimateThroughput(state.scores).toFixed(2)}`,
  ];
};

export const formatLabEnvelope = (envelope: OrchestrationLabEnvelope): string => {
  const selected = envelope.plans[0];
  return `${envelope.id} plans=${envelope.plans.length} selected=${selected?.id ?? 'none'}`;
};
