import { useCallback, useMemo, useState } from 'react';
import {
  buildWorkspace,
  defaultPolicy,
  executeChronicleOrchestration,
  type OrchestratedRun,
  type OrchestrationDiagnostic,
  type OrchestrationPolicy,
  type OrchestrationRunId,
  type OrchestrationStage,
} from '@domain/recovery-chronicle-orchestrator';
import type { ChroniclePriority } from '@domain/recovery-chronicle-core';
import type { PolicyPatch, ChronicleWorkspaceSnapshot, PolicyPatchEvent } from '../types';

interface UseChronicleOrchestratorParams {
  readonly tenant: string;
  readonly planId: string;
}

const tiers: readonly ChroniclePriority[] = ['p0', 'p1', 'p2', 'p3'];

const validatePolicyPatch = (patch: PolicyPatch): PolicyPatchEvent => {
  const warnings: string[] = [];
  if (patch.maxParallelism < 1) warnings.push('maxParallelism must be >= 1');
  if (patch.maxParallelism > 64) warnings.push('maxParallelism must be <= 64');
  if (patch.minConfidence < 0 || patch.minConfidence > 1) warnings.push('minConfidence must be between 0 and 1');
  return {
    patch,
    isValid: warnings.length === 0,
    warnings,
  };
};

const normalizePatch = (patch: PolicyPatch): PolicyPatch => ({
  ...patch,
  maxParallelism: Math.trunc(Math.max(1, patch.maxParallelism)),
  minConfidence: Math.min(1, Math.max(0, patch.minConfidence)),
  allowedTiers: patch.allowedTiers.filter((tier) => tiers.includes(tier)),
  mode: (patch.mode ?? 'adaptive') as PolicyPatch['mode'],
});

export const useChronicleOrchestrator = ({ tenant, planId }: UseChronicleOrchestratorParams) => {
  const [policyPatch, setPolicyPatch] = useState<PolicyPatch>({
    maxParallelism: 4,
    minConfidence: 0.8,
    allowedTiers: ['p0', 'p1'],
    mode: 'adaptive',
  });
  const [run, setRun] = useState<OrchestratedRun | undefined>();
  const [diagnostics, setDiagnostics] = useState<readonly OrchestrationDiagnostic[]>([]);
  const [status, setStatus] = useState<ChronicleWorkspaceSnapshot['status']>('idle');

  const policy = useMemo<OrchestrationPolicy>(() => {
    const normalized = normalizePatch(policyPatch);
    const base = defaultPolicy(tenant);
    return {
      ...base,
      mode: normalized.mode,
      maxParallelism: normalized.maxParallelism,
      minConfidence: normalized.minConfidence,
      allowedTiers: normalized.allowedTiers,
    };
  }, [tenant, policyPatch]);

  const workspace = useMemo(() => buildWorkspace({ tenant, policy }), [tenant, policy]);

  const warnings = useMemo(() => validatePolicyPatch(policyPatch).warnings, [policyPatch]);

  const patchWorkspace = useCallback((next: PolicyPatch) => {
    setPolicyPatch(normalizePatch(next));
  }, []);

  const runOrchestratedPlan = useCallback(async () => {
    const patchValidation = validatePolicyPatch(policyPatch);
    if (!patchValidation.isValid) return;

    setStatus('running');
    try {
      const result = await executeChronicleOrchestration({
        tenant,
        planId,
        mode: policy.mode,
        policy,
      });

      setRun(result.run);
      setDiagnostics(result.diagnostics);
      setStatus('idle');
    } catch (error) {
      const next = [
        {
          runId: `run:${Date.now()}` as OrchestrationRunId,
          key: 'diag.error',
          score: 0,
          message: `run failed: ${(error as Error).message}`,
        },
        ...diagnostics,
      ] satisfies readonly OrchestrationDiagnostic[];
      setDiagnostics(next);
      setStatus('error');
    }
  }, [tenant, planId, policyPatch, policy, diagnostics]);

  const snapshot = useMemo<ChronicleWorkspaceSnapshot>(
    () => ({
      policy,
      run,
      workspace,
      diagnostics,
      isRunning: status === 'running',
      status,
    }),
    [policy, run, workspace, diagnostics, status],
  );

  const outputScore = useMemo(
    () => (run?.output ?? []).reduce((total, entry) => total + entry.score, 0),
    [run],
  );

  const currentStage: OrchestrationStage | undefined = run?.output?.at(-1)?.stage;

  return {
    ...snapshot,
    workspace,
    policyPatch,
    patchWorkspace,
    runOrchestratedPlan,
    warnings,
    outputScore,
    currentStage,
  };
};
