import type { OrchestrationLabEnvelope, OrchestrationLabRecord, LabRunRecord, StoreSummary } from './model';

export const encodeEnvelope = (payload: OrchestrationLabEnvelope): string => JSON.stringify(payload);

export const decodeEnvelope = (payload: string): OrchestrationLabEnvelope => JSON.parse(payload) as OrchestrationLabEnvelope;

export const encodeRecord = (payload: OrchestrationLabRecord): string => JSON.stringify(payload);

export const decodeRecord = (payload: string): OrchestrationLabRecord => JSON.parse(payload) as OrchestrationLabRecord;

export const encodeRun = (payload: LabRunRecord): string => JSON.stringify(payload);

export const decodeRun = (payload: string): LabRunRecord => JSON.parse(payload) as LabRunRecord;

export const encodeSummary = (payload: StoreSummary): string => JSON.stringify(payload);

export const decodeSummary = (payload: string): StoreSummary => JSON.parse(payload) as StoreSummary;
