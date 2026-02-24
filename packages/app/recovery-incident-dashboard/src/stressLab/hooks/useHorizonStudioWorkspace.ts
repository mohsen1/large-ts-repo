import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildWorkspaceIntent,
  stopStudioRun,
  runStatus,
  executeStudioWorkflow,
} from '../services/horizonStudioService';
import type { HorizonStudioStatus, HorizonStudioRunResult } from '../services/horizonStudioService';
import type { PluginStage, HorizonSignal } from '@domain/recovery-horizon-engine';

type SignalSelection = PluginStage | 'all';
type Message = `start-${string}` | `stop-${string}` | `refresh-${string}` | `tick-${number}` | `error-${string}`;

interface WorkspaceState {
  readonly tenantId: string;
  readonly loading: boolean;
  readonly status: HorizonStudioStatus;
  readonly selectedSignalKind: SignalSelection;
  readonly messages: readonly Message[];
}

export interface StudioWorkspaceHook {
  readonly state: WorkspaceState;
  readonly refresh: () => Promise<void>;
  readonly start: (tenantId: string, owner: string) => Promise<HorizonStudioRunResult | undefined>;
  readonly stop: () => Promise<void>;
  readonly setSelectedSignalKind: (signalKind: SignalSelection) => void;
}

const emptyStatus = {
  workspaceId: 'pending',
  plans: [],
  signals: [],
  runStatus: 'pending' as const,
};

export const useHorizonStudioWorkspace = (tenantId: string): StudioWorkspaceHook => {
  const [state, setState] = useState<WorkspaceState>({
    tenantId,
    loading: false,
    status: emptyStatus,
    selectedSignalKind: 'all',
    messages: ['start-pending'],
  });

  const timerRef = useRef<number | undefined>(undefined);
  const intent = useMemo(() => buildWorkspaceIntent(tenantId, 'ui'), [tenantId]);

  const refresh = useCallback(async () => {
    const result = await runStatus(state.status.workspaceId);
    setState((previous) => ({
      ...previous,
      messages: [
        `tick-${Date.now()}` as Message,
        `refresh-${result.healthy ? 'healthy' : 'cold'}` as Message,
        ...previous.messages.slice(-8),
      ],
      status: {
        ...previous.status,
      },
    }));
  }, [state.status.workspaceId]);

  const stop = useCallback(async () => {
    await stopStudioRun(state.status.workspaceId);
    setState((previous) => ({
      ...previous,
      loading: false,
      status: {
        ...previous.status,
        runStatus: 'stopped',
      },
      messages: ['stop-requested', ...previous.messages],
    }));
  }, [state.status.workspaceId]);

  const start = useCallback(
    async (nextTenantId: string, owner: string): Promise<HorizonStudioRunResult | undefined> => {
      setState((previous) => ({
        ...previous,
        loading: true,
        messages: [`start-${owner}` as Message, ...previous.messages],
      }));

      const response = await executeStudioWorkflow(nextTenantId, owner);
      if (!response.ok) {
        setState((previous) => ({
          ...previous,
          loading: false,
          messages: [`error-${response.error.reason}` as Message, ...previous.messages],
        }));
        return undefined;
      }

      const current = response.value;
      const payload: HorizonStudioStatus = {
        workspaceId: String(current.workspace.workspaceId),
        plans: current.workspace.plans,
        signals: current.workspace.signals,
        runStatus: 'running',
      };
      setState((previous) => ({
        ...previous,
        loading: false,
        status: payload,
        messages: ['start-workflow', ...previous.messages],
      }));

      return { started: true, payload };
    },
    [],
  );

  const setSelectedSignalKind = useCallback((signalKind: SignalSelection) => {
    setState((previous) => ({
      ...previous,
      selectedSignalKind: signalKind,
    }));
  }, []);

  useEffect(() => {
    if (state.loading || state.status.workspaceId === 'pending') {
      return;
    }
    if (typeof window === 'undefined') {
      return;
    }

    timerRef.current = window.setInterval(() => {
      void refresh();
    }, 7_000);

    return () => {
      if (timerRef.current !== undefined) {
        window.clearInterval(timerRef.current);
      }
    };
  }, [refresh, state.loading, state.status.workspaceId]);

  const selectedSignals = useMemo(() => {
    if (state.selectedSignalKind === 'all') {
      return state.status.signals as readonly HorizonSignal<string, unknown>[];
    }
    return state.status.signals.filter((signal) => signal.kind === state.selectedSignalKind);
  }, [state.selectedSignalKind, state.status.signals]);

  return {
    state: {
      ...state,
      status: {
        ...state.status,
        signals: selectedSignals as typeof state.status.signals,
      },
    },
    refresh,
    start,
    stop,
    setSelectedSignalKind,
  };
};
