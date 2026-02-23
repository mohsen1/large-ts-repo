import { useEffect, useMemo, useState } from 'react';
import type { RecoveryScenario, RecoverySignal, RecoveryAction } from '@domain/incident-fusion-models';
import { createFusionRepository } from '@data/incident-fusion-store';
import type { IncidentFusionStore } from '@data/incident-fusion-store';

export interface WorkspaceState {
  readonly tenant: string;
  readonly signals: readonly RecoverySignal[];
  readonly scenarios: readonly RecoveryScenario[];
  readonly actions: readonly RecoveryAction[];
  readonly lastUpdatedAt: string | null;
}

const blank: WorkspaceState = {
  tenant: 'acme-ops',
  signals: [],
  scenarios: [],
  actions: [],
  lastUpdatedAt: null,
};

export interface WorkspaceFilters {
  readonly tenant?: string;
  readonly minSeverity?: number;
  readonly requireActionable?: boolean;
}

export const useIncidentFusionWorkspace = (filters: WorkspaceFilters = {}) => {
  const repository: IncidentFusionStore = useMemo(() => createFusionRepository({ tenant: filters.tenant ?? blank.tenant }), [filters.tenant]);
  const [state, setState] = useState<WorkspaceState>(blank);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const tenant = filters.tenant ?? blank.tenant;

  useEffect(() => {
    let active = true;
    const execute = async () => {
      setLoading(true);
      setError(null);
      try {
        const [scenarios, signals, actions] = await Promise.all([
          repository.listScenarios({ tenant }),
          repository.listSignals({ tenant }),
          repository.listActions({ tenant }),
        ]);

        if (!active) return;

        const filteredSignals = signals.filter((signal) => {
          if (filters.minSeverity != null && signal.severity < filters.minSeverity) {
            return false;
          }
          if (filters.requireActionable) {
            return signal.state !== 'resolved';
          }
          return true;
        });

        setState({
          tenant,
          scenarios,
          signals: filteredSignals,
          actions,
          lastUpdatedAt: new Date().toISOString(),
        });
      } catch (caught) {
        if (!active) return;
        setError(caught instanceof Error ? caught.message : 'Failed to load workspace');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void execute();
    const timer = window.setInterval(execute, 7_500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [filters.minSeverity, filters.requireActionable, repository, tenant]);

  return {
    state,
    loading,
    error,
    reload: async () => {
      const scenarios = await repository.listScenarios({ tenant });
      const signals = await repository.listSignals({ tenant });
      const actions = await repository.listActions({ tenant });
      setState({
        tenant,
        scenarios,
        signals,
        actions,
        lastUpdatedAt: new Date().toISOString(),
      });
    },
  };
};
