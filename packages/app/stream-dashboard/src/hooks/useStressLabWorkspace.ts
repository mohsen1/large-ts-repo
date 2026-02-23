import { useCallback, useEffect, useMemo, useState } from 'react';
import { RecoverySignal, TenantId, createRunbookId, createTenantId } from '@domain/recovery-stress-lab';
import { StressLabEngineConfig } from '@service/recovery-stress-lab-orchestrator';
import { launchStressLabRun, buildWorkspaceFromDomain, mapSignalsByClass } from '../services/stressLabService';
import { StreamStressLabWorkspace } from '../types/stressLab';

export interface StressLabWorkspaceState {
  loading: boolean;
  error: string | null;
  workspace: StreamStressLabWorkspace | null;
  classDistribution: ReadonlyArray<{ key: string; value: number }>;
  lastReport: string;
  findings: string[];
}

const defaultConfig = (tenantId: TenantId, streamId: string): StressLabEngineConfig => ({
  tenantId,
  band: 'medium',
  profileHint: 'normal',
  selectedRunbooks: [createRunbookId(`orchestrator-${streamId}-1`), createRunbookId(`orchestrator-${streamId}-2`)],
});

export const useStressLabWorkspace = (
  tenantId: TenantId,
  streamId: string,
  runbooks: Array<{ id: string; title: string; steps: readonly unknown[]; cadence: { weekday: number; windowStartMinute: number; windowEndMinute: number } }>,
  signals: readonly RecoverySignal[],
) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<StreamStressLabWorkspace | null>(null);
  const [lastReport, setLastReport] = useState('');
  const [findings, setFindings] = useState<string[]>([]);

  const config = useMemo(() => defaultConfig(tenantId, streamId), [tenantId, streamId]);
  const classDistribution = useMemo(() => mapSignalsByClass(signals), [signals]);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const runbookModels = runbooks.map((runbook) => ({
        id: runbook.id,
        title: runbook.title,
        steps: runbook.steps,
        cadence: runbook.cadence,
      }));
      const result = await launchStressLabRun({
        tenantId,
        streamId,
        config,
        runbooks: runbookModels as any,
        signals,
      });
      setWorkspace(result.workspace);
      setLastReport(result.report);
      setFindings(result.findings.map((finding) => finding.title));
      setLoading(false);
    } catch (launchError) {
      setLoading(false);
      setError(String(launchError instanceof Error ? launchError.message : launchError));
    }
  }, [tenantId, streamId, config, runbooks, signals]);

  useEffect(() => {
    if (runbooks.length > 0) {
      void bootstrap();
    }
  }, [runbooks.length, bootstrap]);

  const fallbackWorkspace = useMemo(() => {
    if (workspace) return workspace;
    return buildWorkspaceFromDomain(tenantId, streamId, signals);
  }, [streamId, signals, tenantId, workspace]);

  return {
    loading,
    error,
    workspace: workspace ?? fallbackWorkspace,
    classDistribution,
    lastReport,
    findings,
    bootstrap,
    refresh: () => {
      void bootstrap();
    },
  };
};
