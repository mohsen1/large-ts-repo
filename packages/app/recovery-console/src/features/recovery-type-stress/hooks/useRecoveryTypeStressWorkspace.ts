import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  buildTypeStressWorkspace,
  routeCountByKind,
} from '../services/recoveryTypeStressService';
import type { TypeStressWorkspaceState, TypeStressWorkspacePatch, TypeStressError } from '../types';

export const useRecoveryTypeStressWorkspace = (tenant: string) => {
  const [state, setState] = useState<TypeStressWorkspaceState | undefined>(undefined);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string>('');

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const workspace = await buildTypeStressWorkspace({ tenant });
      setState(workspace);
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
    } finally {
      setBusy(false);
    }
  }, [tenant]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const summary = useMemo(() => {
    if (!state) {
      return {
        size: 0,
        uniqueKinds: 0,
      };
    }

    const counts = routeCountByKind(state);
    return {
      size: state.records.length,
      uniqueKinds: counts.size,
      score: state.score,
    };
  }, [state]);

  const updateWorkspace = (patch: TypeStressWorkspacePatch) => {
    if (!state) {
      return;
    }

    setState((prev) => {
      if (!prev) {
        return prev;
      }

      return { ...prev, ...patch };
    });
  };

  const checkResult = (result: TypeStressError): TypeStressWorkspaceState | undefined => {
    if (!result.ok) {
      setError(result.message);
      return undefined;
    }

    return result.output;
  };

  return { state, busy, error, refresh, summary, updateWorkspace, checkResult };
};
