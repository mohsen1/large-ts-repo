import type { IncidentLabScenario, IncidentLabRun, IncidentLabEnvelope, IncidentLabSignal } from '@domain/recovery-incident-lab-core';
import type { EnvelopeRecord } from './types';

export const envelopeToRecord = (envelope: IncidentLabEnvelope): EnvelopeRecord => ({
  envelope,
  createdAt: new Date().toISOString(),
});

export const runToJson = (run: IncidentLabRun): string => JSON.stringify(run);

export const scenarioKey = (scenario: IncidentLabScenario): string => `scenario:${scenario.id}`;

export const signalLine = (signal: IncidentLabSignal): string => `${signal.at}|${signal.kind}|${signal.node}|${signal.value}`;

export const buildEnvelopeFromJson = <T>(scenario: IncidentLabScenario, payload: T): IncidentLabEnvelope<T> => ({
  id: `${scenario.id}:envelope:${Date.now()}` as IncidentLabEnvelope<T>['id'],
  labId: scenario.labId,
  scenarioId: scenario.id,
  payload,
  createdAt: new Date().toISOString(),
  origin: 'json',
});
