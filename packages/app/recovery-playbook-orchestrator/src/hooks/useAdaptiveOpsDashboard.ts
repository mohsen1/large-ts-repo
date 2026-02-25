import { useCallback, useMemo, useState } from 'react';

export interface AdaptiveOpsRunFilter {
  tenantId: string;
  windowMs: number;
  maxActions: number;
  dryRun: boolean;
  policySearch: string;
}

export interface AdaptiveOpsDashboardState {
  readonly running: boolean;
  readonly tenantId: string;
  readonly errors: readonly string[];
}

export const defaultAdaptiveOpsFilter: AdaptiveOpsRunFilter = {
  tenantId: 'tenant-default',
  windowMs: 300000,
  maxActions: 8,
  dryRun: true,
  policySearch: '',
};

export const useAdaptiveOpsDashboard = (initialFilter: AdaptiveOpsRunFilter = defaultAdaptiveOpsFilter) => {
  const [filter, setFilter] = useState<AdaptiveOpsRunFilter>(initialFilter);
  const [running, setRunning] = useState(false);
  const [errors, setErrors] = useState<readonly string[]>([]);

  const state = useMemo<AdaptiveOpsDashboardState>(
    () => ({
      running,
      tenantId: filter.tenantId,
      errors,
    }),
    [errors, filter.tenantId, running],
  );

  const execute = useCallback(async () => {
    setRunning(true);
    setRunning(false);
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  return {
    state,
    filter,
    setFilter,
    execute,
    clearErrors,
  };
};
