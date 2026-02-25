import { useCallback, useMemo, useState } from 'react';
import { createStudioRunner } from '../studio/runtime/runner';
import { foldStudioEvents } from '../studio/telemetrySink';
import { summarize } from '@shared/playbook-studio-runtime';

type AuditLevel = 'all' | 'warnings' | 'critical';

export interface AuditSpec {
  readonly runId: string;
  readonly workspaceId: string;
  readonly tenantId: string;
}

export interface AuditPanelState {
  readonly loading: boolean;
  readonly score: number;
  readonly tags: readonly string[];
  readonly errorCount: number;
  readonly metrics: Record<string, number>;
}

const reduce = (state: AuditPanelState, metric: [string, number]): AuditPanelState => ({
  ...state,
  score: state.score + metric[1],
  tags: [...state.tags, metric[0]],
  errorCount: state.errorCount + 1,
});

export const usePlaybookStudioAudit = (spec: AuditSpec) => {
  const [state, setState] = useState<AuditPanelState>({
    loading: false,
    score: 0,
    tags: [],
    errorCount: 0,
    metrics: {},
  });

  const refresh = useCallback(async () => {
    setState((previous) => ({ ...previous, loading: true }));
    const runner = await createStudioRunner({
      tenantId: spec.tenantId,
      workspaceId: spec.workspaceId,
      artifactId: spec.runId,
    });

    const execution = await runner.execute({
      command: 'audit',
      tenantId: spec.tenantId,
      workspaceId: spec.workspaceId,
      artifactId: spec.runId,
      runId: `${spec.runId}:${Date.now()}`,
    });

    if (execution.ok) {
      const folded = foldStudioEvents(execution.value);
      const metrics = folded.reduce<Record<string, number>>((acc, [key]) => {
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});

      const next = folded.reduce(reduce, {
        loading: false,
        score: 0,
        tags: [],
        errorCount: 0,
        metrics,
      });

      setState(next);
      await runner.dispose();
      return {
        ok: true,
        state: next,
      };
    }

    setState((previous) => ({ ...previous, loading: false, errorCount: previous.errorCount + 1 }));
    await runner.dispose();

    return {
      ok: false,
      state,
    };
  }, [spec.runId, spec.tenantId, spec.workspaceId]);

  const levels = useMemo(
    () => {
      const value = Math.max(0, Math.min(state.errorCount, 2));
      return {
        all: state.tags,
        warnings: state.tags.filter((_, index) => index % 2 === 0),
        critical: state.tags.filter((_, index) => index % 5 === 0),
      } as Record<AuditLevel, readonly string[]>;
    },
    [state.errorCount, state.tags],
  );

  return {
    ...state,
    levels,
    refresh,
  };
};
