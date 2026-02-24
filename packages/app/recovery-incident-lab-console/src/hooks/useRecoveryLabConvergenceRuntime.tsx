import { useCallback, useMemo, useState, useTransition } from 'react';
import type { ConvergenceOutput, ConvergenceScope } from '@domain/recovery-lab-orchestration-core';
import {
  buildRuntimeManifest,
  buildInsights,
  getRuntimeService,
  runOrchestratedConvergence,
  runSequence,
  type RuntimeOutput,
} from '@service/recovery-stress-lab-orchestrator';

type ViewMode = 'single' | 'sequence';

type RuntimeStatus = 'idle' | 'running' | 'ready' | 'error';

export interface RuntimeRunSummary {
  readonly runId: string;
  readonly stage: ConvergenceOutput['stage'];
  readonly score: number;
  readonly confidence: number;
  readonly diagnostics: number;
}

interface HookState {
  readonly tenantId: string;
  readonly mode: ViewMode;
  readonly scope: ConvergenceScope;
  readonly status: RuntimeStatus;
  readonly runs: readonly RuntimeOutput[];
  readonly manifests: readonly string[];
  readonly summaries: readonly RuntimeRunSummary[];
  readonly signal: string;
}

const runtimeOutputToSummary = (output: RuntimeOutput): RuntimeRunSummary => ({
  runId: output.runId,
  stage: output.output.stage,
  score: output.output.score,
  confidence: output.output.confidence,
  diagnostics: output.output.diagnostics.length,
});

const nextSignal = (): string => `seed:${Date.now()}`;

export const useRecoveryLabConvergenceRuntime = (tenantId = 'tenant-recovery-lab') => {
  const [state, setState] = useState<HookState>({
    tenantId,
    mode: 'single',
    scope: 'tenant',
    status: 'idle',
    runs: [],
    manifests: [],
    summaries: [],
    signal: nextSignal(),
  });

  const [isPending, startTransition] = useTransition();
  const service = useMemo(() => getRuntimeService(), []);

  const runSingle = useCallback(
    async (scope: ConvergenceScope): Promise<void> => {
      setState((previous) => ({
        ...previous,
        status: 'running',
        mode: 'single',
        scope,
      }));

      try {
        const output = await runOrchestratedConvergence(tenantId, scope, [state.signal]);
        const manifest = await buildRuntimeManifest(tenantId);
        buildInsights(tenantId, output, output.constraints);

        setState((previous) => ({
          ...previous,
          status: 'ready',
          runs: [output],
          manifests: [...previous.manifests, `${manifest.tenantId}:${manifest.scope}:${manifest.stage}:${manifest.planCount}`],
          summaries: [runtimeOutputToSummary(output)],
          signal: nextSignal(),
        }));
      } catch {
        setState((previous) => ({
          ...previous,
          status: 'error',
          signal: nextSignal(),
        }));
      }
    },
    [tenantId, state.signal],
  );

  const runAll = useCallback(async (): Promise<void> => {
    setState((previous) => ({
      ...previous,
      status: 'running',
      mode: 'sequence',
    }));

    try {
      const result = await runSequence(tenantId);
      const outputs = [...result.runs];
      const summaries = outputs.map(runtimeOutputToSummary);
      const manifests = outputs.map((output) => `${output.runId}::${output.output.stage}`);

      setState((previous) => ({
        ...previous,
        status: 'ready',
        runs: outputs,
        manifests,
        summaries,
        signal: nextSignal(),
      }));
    } catch {
      setState((previous) => ({
        ...previous,
        status: 'error',
        signal: nextSignal(),
      }));
    }
  }, [tenantId]);

  const streamByScope = useCallback(
    async (scopes: readonly ConvergenceScope[]) => {
      startTransition(() => {
        setState((previous) => ({
          ...previous,
          status: 'running',
        }));
      });

      const outputs: RuntimeOutput[] = [];
      for (const scope of scopes) {
        // eslint-disable-next-line no-await-in-loop
        for await (const output of service.stream({
          tenantId,
          scope,
          stage: 'input',
          signals: [state.signal],
          runbooks: ['stream-run'],
        })) {
          outputs.push(output);
          setState((previous) => ({
            ...previous,
            runs: [...outputs],
          }));
        }
      }

      setState((previous) => ({
        ...previous,
        status: 'ready',
        scope: scopes[0] ?? previous.scope,
        runs: [...outputs],
        manifests: outputs.map((output, index) => `${output.runId}:stream:${output.output.stage}:${index}`),
        summaries: outputs.map(runtimeOutputToSummary),
        signal: nextSignal(),
      }));
    },
    [service, state.signal, tenantId, startTransition],
  );

  const setSignal = useCallback((signal: string) => {
    setState((previous) => ({
      ...previous,
      signal,
    }));
  }, []);

  return {
    tenantId,
    state,
    isPending,
    runSingle,
    runAll,
    streamByScope,
    setSignal,
    signal: state.signal,
    canRun: state.status !== 'running' && !isPending,
  } as const;
};
