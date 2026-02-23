import { useCallback, useMemo, useEffect, useState } from 'react';
import { withBrand } from '@shared/core';
import type { FusionBundle, RawSignalEnvelope } from '@domain/recovery-fusion-intelligence';
import {
  applyFusionSignalsToBundle,
  describeWorkspace,
  runRecoveryFusionConsole,
} from '@service/recovery-runner';
import type {
  FusionWorkspaceActions,
  FusionCommandRecord,
  FusionWorkspaceSnapshot,
  FusionWorkspaceState,
} from '../types/recoveryFusionWorkspace';

type WorkspaceInput = {
  readonly bundle: FusionBundle;
  readonly tenant: string;
};

const mapToSnapshot = (bundle: FusionBundle): FusionWorkspaceSnapshot => ({
  timestamp: new Date().toISOString(),
  waves: bundle.waves,
  commandCount: bundle.waves.reduce((sum, wave) => sum + wave.commands.length, 0),
  readinessState: bundle.waves[0]?.state ?? 'idle',
});

export const useRecoveryFusionWorkspace = ({ bundle, tenant }: WorkspaceInput): {
  readonly state: FusionWorkspaceState;
  readonly actions: FusionWorkspaceActions;
  readonly snapshot: FusionWorkspaceSnapshot;
  readonly diagnostics: readonly string[];
} => {
  const [workspaceBundle, setWorkspaceBundle] = useState<FusionBundle>(bundle);
  const [loading, setLoading] = useState(false);
  const [selectedWaveId, setSelectedWaveId] = useState<string | undefined>(bundle.waves[0]?.id);
  const [commandLog, setCommandLog] = useState<readonly FusionCommandRecord[]>([]);
  const [lastErrors, setLastErrors] = useState<string[]>([]);

  const makeRecord = (
    action: FusionCommandRecord['action'],
    status: FusionCommandRecord['status'],
    waveId: string,
    index: number,
    context: string,
  ): FusionCommandRecord => ({
    id: `${context}:${index}`,
    waveId,
    action,
    actor: tenant,
    status,
  });

  const summary = useMemo(
    () => ({
      status: 'pending' as const,
      riskScore: workspaceBundle.waves.length
        ? workspaceBundle.waves.reduce((sum, wave) => sum + wave.score, 0) / workspaceBundle.waves.length
        : 0,
      commandCount: workspaceBundle.waves.reduce((count, wave) => count + wave.commands.length, 0),
      waveCount: workspaceBundle.waves.length,
    }),
    [workspaceBundle],
  );

  const runFusion = useCallback(async (): Promise<void> => {
    setLoading(true);
    const payload = {
      planId: workspaceBundle.id,
      runId: `${tenant}:${workspaceBundle.id}`,
      waves: workspaceBundle.waves,
      signals: workspaceBundle.signals,
      budget: workspaceBundle.session.constraints,
    };
    const result = await runRecoveryFusionConsole({
      tenant,
      initiatedBy: 'fusion-dashboard',
      correlationId: `fusion-${Date.now()}`,
    }, {
      ...payload,
      runId: withBrand(payload.runId, 'RecoveryRunId'),
      planId: withBrand(payload.planId, 'RunPlanId'),
    });
    if (!result.ok) {
      setLastErrors((errors) => [...errors, `run-failed:${result.error.message}`]);
      setLoading(false);
      return;
    }
    const messages = describeWorkspace({
      planId: payload.planId,
      acceptedPlan: true,
      riskBand: 'green',
      waveCount: workspaceBundle.waves.length,
      commandCount: summary.commandCount,
      scheduleWindowCount: result.value.commandInvocations.length,
    });
    const next = messages.map((_text, index) => makeRecord('run', 'completed', selectedWaveId ?? 'none', index, payload.runId));
    setCommandLog((entries) => [...entries, ...next]);
    setLoading(false);
  }, [tenant, workspaceBundle, summary.commandCount, selectedWaveId]);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setLoading(false);
  }, []);

  const selectWave = useCallback((next: string | undefined) => {
    setSelectedWaveId(next);
  }, []);

  const acceptSignals = useCallback(async (signals: readonly RawSignalEnvelope[]) => {
    const result = applyFusionSignalsToBundle(workspaceBundle, signals);
    if (!result.ok) {
      setLastErrors((errors) => [...errors, `signals-failed:${result.error.message}`]);
      return;
    }
    setWorkspaceBundle({
      ...workspaceBundle,
      signals: workspaceBundle.signals,
      session: {
        ...workspaceBundle.session,
      },
    });
    setCommandLog((entries) => [...entries, makeRecord(
      'accept',
      'completed',
      selectedWaveId ?? 'none',
      result.value.accepted,
      workspaceBundle.id,
    )]);
  }, [workspaceBundle, selectedWaveId, tenant]);

  const workspaceState: FusionWorkspaceState = useMemo(() => ({
    tenant,
    bundle: workspaceBundle,
    selectedWaveId,
    readinessState: workspaceBundle.waves[0]?.state ?? 'idle',
    loading,
    summary,
    commandLog,
    lastErrors,
  }), [tenant, workspaceBundle, selectedWaveId, loading, summary, commandLog, lastErrors]);

  const snapshot = useMemo(() => mapToSnapshot(workspaceBundle), [workspaceBundle]);

  useEffect(() => {
    if (!workspaceBundle.waves.length) {
      setLastErrors((errors) => [...errors, 'workspace-empty']);
    }
    const seed = describeWorkspace({
      planId: workspaceBundle.id,
      acceptedPlan: !!workspaceBundle.waves.length,
      riskBand: 'amber',
      waveCount: workspaceBundle.waves.length,
      commandCount: summary.commandCount,
      scheduleWindowCount: Math.max(1, workspaceBundle.waves.length),
    }).map((_, index) => makeRecord(
      'seed',
      'queued',
      workspaceBundle.waves[0]?.id ?? 'none',
      index,
      `${workspaceBundle.id}:seed:${workspaceBundle.signals.length}`,
    ));
    setCommandLog((entries) => [...entries, ...seed]);
  }, [workspaceBundle, summary.commandCount]);

  return useMemo(() => ({
    state: workspaceState,
    actions: { runFusion, refresh, selectWave, acceptSignals },
    snapshot,
    diagnostics: [...lastErrors, `tenant=${tenant}`, `waves=${workspaceBundle.waves.length}`],
  }), [workspaceState, runFusion, refresh, selectWave, acceptSignals, snapshot, lastErrors, tenant, workspaceBundle.waves.length]);
};
