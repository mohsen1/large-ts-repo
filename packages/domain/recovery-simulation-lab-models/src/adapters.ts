import type { RecoverySimulationLabResult, SimulationPlanDraft, SimulationLabBlueprint, SimulationPlanProjection } from './types';

export const decodeBlueprint = (value: unknown): SimulationLabBlueprint => value as SimulationLabBlueprint;
export const decodeDraft = (value: unknown): SimulationPlanDraft => value as SimulationPlanDraft;
export const decodeProjection = (value: unknown): SimulationPlanProjection => value as SimulationPlanProjection;
export const encodeResult = (result: RecoverySimulationLabResult): string => JSON.stringify(result, null, 2);
