import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type IntentNodePayload,
  type IntentOutput,
  type IntentPolicy,
  type PluginContract,
  type IntentStage,
} from '@domain/recovery-intent-graph';
import { createContextNodes, runIntentGraph, type IntentGraphServiceResult } from '../services/intentGraphService';

type WorkspaceStatus = 'idle' | 'running' | 'complete' | 'failed';

export interface IntentGraphWorkspaceHook {
  readonly status: WorkspaceStatus;
  readonly result?: IntentGraphServiceResult;
  readonly outputs: readonly IntentOutput[];
  readonly errors: readonly string[];
  readonly rerun: () => Promise<void>;
}

export const useIntentGraphWorkspace = (
  policy: IntentPolicy<readonly PluginContract<IntentStage, IntentNodePayload, IntentNodePayload>[]>,
): IntentGraphWorkspaceHook => {
  const [status, setStatus] = useState<WorkspaceStatus>('idle');
  const [result, setResult] = useState<IntentGraphServiceResult | undefined>(undefined);
  const [errors, setErrors] = useState<string[]>([]);

  const nodes = useMemo(() => createContextNodes(policy), [policy]);

  const rerun = useCallback(async () => {
    setStatus('running');
    setErrors([]);
    try {
      const output = await runIntentGraph(policy, nodes);
      setResult(output);
      setStatus('complete');
    } catch (error) {
      setStatus('failed');
      setErrors([
        error instanceof Error ? error.message : 'intent graph execution failed',
        `policy:${policy.id}`,
      ]);
    }
  }, [nodes, policy]);

  useEffect(() => {
    setStatus('idle');
  }, [policy.id]);

  return {
    status,
    result,
    outputs: result?.outputs ?? [],
    errors,
    rerun,
  };
};
