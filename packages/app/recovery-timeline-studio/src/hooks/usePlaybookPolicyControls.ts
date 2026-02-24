import { useState } from 'react';

export interface PolicyFormState {
  tenantPriority: number;
  region: string;
  includeFinalization: boolean;
  retryLimit: number;
  autoPersist: boolean;
}

export interface PolicyFormActions {
  setTenantPriority: (value: number) => void;
  setRegion: (value: string) => void;
  setIncludeFinalization: (value: boolean) => void;
  setRetryLimit: (value: number) => void;
  setAutoPersist: (value: boolean) => void;
  reset: () => void;
}

const DEFAULT_FORM: PolicyFormState = {
  tenantPriority: 2,
  region: 'global',
  includeFinalization: true,
  retryLimit: 2,
  autoPersist: true,
};

const MIN_PRIORITY = 1;
const MAX_PRIORITY = 10;

const clampPriority = (value: number): number => Math.max(MIN_PRIORITY, Math.min(MAX_PRIORITY, Math.round(value)));
const clampRetry = (value: number): number => Math.max(0, Math.min(8, Math.round(value)));

export function usePlaybookPolicyControls(): Readonly<PolicyFormState & PolicyFormActions> {
  const [state, setState] = useState<PolicyFormState>(DEFAULT_FORM);

  const setTenantPriority = (value: number): void => {
    setState((current) => ({
      ...current,
      tenantPriority: clampPriority(value),
    }));
  };

  const setRegion = (value: string): void => {
    setState((current) => ({
      ...current,
      region: value.trim().length === 0 ? 'global' : value,
    }));
  };

  const setIncludeFinalization = (value: boolean): void => {
    setState((current) => ({
      ...current,
      includeFinalization: value,
    }));
  };

  const setRetryLimit = (value: number): void => {
    setState((current) => ({
      ...current,
      retryLimit: clampRetry(value),
    }));
  };

  const setAutoPersist = (value: boolean): void => {
    setState((current) => ({
      ...current,
      autoPersist: value,
    }));
  };

  const reset = (): void => {
    setState(DEFAULT_FORM);
  };

  return {
    ...state,
    setTenantPriority,
    setRegion,
    setIncludeFinalization,
    setRetryLimit,
    setAutoPersist,
    reset,
  };
}
