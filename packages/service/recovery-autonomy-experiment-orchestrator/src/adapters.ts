import { parseExperimentContext, parseExperimentPayload, parseExperimentIntent, parseExperimentPlan } from '@domain/recovery-autonomy-experiment';
import type { RunExperimentRequest } from './orchestrator';

interface WireInput {
  readonly context: string;
  readonly payload: string;
  readonly intent: string;
  readonly plan: string;
}

interface WireEnvelope {
  context: unknown;
  payload: unknown;
  intent: unknown;
  plan: unknown;
}

const parseEnvelope = (wire: WireInput): WireEnvelope => ({
  context: JSON.parse(wire.context),
  payload: JSON.parse(wire.payload),
  intent: JSON.parse(wire.intent),
  plan: JSON.parse(wire.plan),
});

export const toSchedulerRequest = (wire: WireInput): RunExperimentRequest => {
  const envelope = parseEnvelope(wire);
  return {
    context: parseExperimentContext(envelope.context),
    payload: parseExperimentPayload(envelope.payload),
    intent: parseExperimentIntent(envelope.intent),
    plan: parseExperimentPlan(envelope.plan),
  } as RunExperimentRequest;
};

export const runFromWire = async (wire: WireInput, orchestrator: { run: (request: RunExperimentRequest) => Promise<unknown> }) => {
  const request = toSchedulerRequest(wire);
  return orchestrator.run(request);
};
