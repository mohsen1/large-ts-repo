import type {
  ContinuityLensStoreFilters,
  ContinuityPolicyResult,
  ContinuitySignal,
  ContinuitySnapshot,
  ContinuityTenantId,
} from './types';
import type { ContinuityPolicy } from '@domain/continuity-lens';

export interface SignalListQuery extends ContinuityLensStoreFilters {}

export const matchesWindow = (candidate: { readonly createdAt?: string; readonly windowStart?: string; readonly tenantId: ContinuityTenantId }, filters: ContinuityLensStoreFilters): boolean => {
  if (candidate.tenantId !== filters.tenantId) return false;
  if (filters.from && candidate.createdAt && candidate.createdAt < filters.from) return false;
  if (filters.from && candidate.windowStart && candidate.windowStart < filters.from) return false;
  if (filters.to && candidate.createdAt && candidate.createdAt > filters.to) return false;
  if (filters.to && candidate.windowStart && candidate.windowStart > filters.to) return false;
  return true;
};

export const applySignalFilters = (signals: readonly ContinuitySignal[], filters: ContinuityLensStoreFilters): readonly ContinuitySignal[] =>
  signals.filter((signal) => {
    if (signal.tenantId !== filters.tenantId) return false;
    if (filters.from && signal.reportedAt < filters.from) return false;
    if (filters.to && signal.reportedAt > filters.to) return false;
    if (filters.includeResolved === false && signal.state === 'resolved') return false;
    return true;
  });

export const applySnapshotFilters = (snapshots: readonly ContinuitySnapshot[], filters: ContinuityLensStoreFilters): readonly ContinuitySnapshot[] =>
  snapshots.filter((snapshot) => {
    if (snapshot.tenantId !== filters.tenantId) return false;
    if (filters.from && snapshot.windowStart < filters.from) return false;
    if (filters.to && snapshot.windowEnd > filters.to) return false;
    return true;
  });

export const policyResultFromState = (policy: ContinuityPolicy, violations: number, approved: boolean): ContinuityPolicyResult => ({
  policy,
  matches: 0,
  violations: [],
  approved,
});
