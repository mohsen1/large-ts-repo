import { useEffect, useMemo, useState } from 'react';
import { designStudioService, type DesignStudioSignalStream } from '../services/designStudioService';
import type { DesignSignalKind } from '@domain/recovery-orchestration-design';

interface StreamOptions {
  readonly tenant: string;
  readonly workspace: string;
  readonly metric: DesignSignalKind;
}

interface UseDesignSignalStreamState {
  readonly loading: boolean;
  readonly signalCount: number;
  readonly windows: readonly DesignStudioSignalStream['windows'][number][];
  readonly diagnostics: readonly string[];
  readonly hasData: boolean;
  readonly refresh: () => Promise<void>;
}

const emptyState = (): UseDesignSignalStreamState => ({
  loading: true,
  signalCount: 0,
  windows: [],
  diagnostics: [],
  hasData: false,
  refresh: async () => {
    return;
  },
});

export const useDesignSignalStream = ({ tenant, workspace, metric }: StreamOptions): UseDesignSignalStreamState => {
  const [state, setState] = useState<UseDesignSignalStreamState>(emptyState);

  const refresh = async (): Promise<void> => {
    setState((previous) => ({ ...previous, loading: true }));
    const stream = await designStudioService.signalStream(tenant, workspace, metric);
    setState({
      loading: false,
      signalCount: stream.latestSignalCount,
      windows: stream.windows,
      diagnostics: stream.diagnostics.map((entry) => `${entry.scope}:${entry.kind}:${entry.message}`),
      hasData: stream.windows.length > 0,
      refresh,
    });
  };

  useEffect(() => {
    void refresh();
  }, [tenant, workspace, metric]);

  const summary = useMemo(() => {
    const metrics = state.windows
      .toSorted((left, right) => right.from - left.from)
      .reduce(
        (acc, window, index) => ({
          score: acc.score + window.count * (index + 1),
          top: window.count > acc.top ? window.count : acc.top,
        }),
        { score: 0, top: 0 },
      );
    return {
      ...metrics,
      ratio: state.signalCount > 0 ? metrics.score / state.signalCount : 0,
    };
  }, [state.signalCount, state.windows]);

  return {
    ...state,
    diagnostics: [...state.diagnostics, `score=${summary.ratio.toFixed(2)}`, `top=${summary.top}`],
    refresh,
  };
};
