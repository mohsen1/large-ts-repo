import { useCallback, useMemo, useState } from 'react';

import { useRecoveryContinuityLens } from './useRecoveryContinuityLens';
import { buildPolicy } from '@domain/continuity-lens';
import { withBrand } from '@shared/core';
import type { ContinuityPolicy } from '@domain/continuity-lens';

const policyCatalog = ['stability', 'availability', 'containment', 'containment-extended', 'critical-only'];

export interface LensControlState {
  readonly activePolicy: ContinuityPolicy;
  readonly enabledPolicyNames: readonly string[];
  readonly mode: 'auto' | 'manual';
}

export interface LensControlActions {
  setMode: (mode: 'auto' | 'manual') => void;
  switchPolicy: (policyName: string) => void;
  clearSignals: () => void;
}

export const useRecoveryContinuityLensControl = (tenantId: string) => {
  const lens = useRecoveryContinuityLens({ tenantId });
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [policyName, setPolicyName] = useState('stability');

  const activePolicy: ContinuityPolicy = useMemo(
    () =>
      buildPolicy({
        tenantId: lens.workspace?.tenantId ?? withBrand(tenantId, 'ContinuityTenantId'),
        name: policyName,
        minimumSeverity: policyName === 'critical-only' ? 85 : 35,
        criticalityThreshold: policyName.includes('extended') ? 55 : 70,
        allowAutoMitigation: true,
        maxConcurrency: policyName === 'containment' ? 8 : 4,
      }),
    [lens.workspace?.tenantId, policyName, tenantId],
  );

  const enabledPolicyNames = useMemo(() => policyCatalog.filter((name) => !name.includes('critical') || mode === 'manual'), [mode]);

  const controlState: LensControlState = useMemo(
    () => ({
      activePolicy,
      enabledPolicyNames,
      mode,
    }),
    [activePolicy, enabledPolicyNames, mode],
  );

  const clearSignals = useCallback(() => {
    lens.reset();
  }, [lens]);

  const switchPolicy = useCallback((next: string) => {
    setPolicyName(next);
  }, []);

  return {
    ...lens,
    ...controlState,
    setMode,
    switchPolicy,
    clearSignals,
    actions: {
      setMode,
      switchPolicy,
      clearSignals,
    } as LensControlActions,
  };
};
