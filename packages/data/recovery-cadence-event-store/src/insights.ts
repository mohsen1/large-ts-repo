import type { CadenceStoreRecord } from './types';
import { CadencePlan } from '@domain/recovery-cadence-orchestration';

export interface RecordStats {
  readonly planCount: number;
  readonly windowCount: number;
  readonly intentCount: number;
  readonly eventCount: number;
  readonly snapshotCount: number;
}

export const buildStoreRecordStats = (records: readonly CadenceStoreRecord[]): RecordStats => {
  return {
    planCount: records.length,
    windowCount: records.reduce((sum, record) => sum + record.windows.length, 0),
    intentCount: records.reduce((sum, record) => sum + record.intents.length, 0),
    eventCount: records.reduce((sum, record) => sum + record.events.length, 0),
    snapshotCount: records.reduce((sum, record) => sum + record.snapshots.length, 0),
  };
};

export const findMostRecentPlanByOwner = (
  records: readonly CadenceStoreRecord[],
  owner: string,
): CadenceStoreRecord | undefined => {
  const owned = records.filter((record) => record.plan.owner === owner);
  return owned.sort((a, b) => Date.parse(b.lastUpdatedAt) - Date.parse(a.lastUpdatedAt))[0];
};

export const filterByChannel = (records: readonly CadenceStoreRecord[], channel: string): CadenceStoreRecord[] => {
  return records.filter((record) => record.windows.some((window) => window.channel === channel));
};
