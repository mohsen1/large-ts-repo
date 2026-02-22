import { useCallback, useMemo, useState } from 'react';
import { withBrand } from '@shared/core';
import {
  computePolicyScoreCard,
  simulatePolicyDecision,
  buildMockEnvelope,
  buildSimulationTimeline,
  type PolicyExecutionContext,
  type PolicyResultEnvelope,
  type PolicyTimeline,
} from '@service/recovery-operations-policy-engine';
import type { RecoverySignal, RunSession } from '@domain/recovery-operations-models';
import type { RecoveryProgram } from '@domain/recovery-orchestration';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';

interface UseRecoveryPolicyConsoleParams {
  readonly tenant: string;
  readonly runId: string;
  readonly session: RunSession;
  readonly program: RecoveryProgram;
  readonly readinessPlan: RecoveryReadinessPlan;
  readonly signals: readonly RecoverySignal[];
}

export interface PolicyRunRecord {
  readonly runId: string;
  readonly state: PolicyResultEnvelope['state'];
  readonly decision: PolicyResultEnvelope['summary']['decision'];
  readonly summary: string;
  readonly confidence: number;
  readonly at: string;
}

interface UseRecoveryPolicyConsoleResult {
  readonly running: boolean;
  readonly records: readonly PolicyRunRecord[];
  readonly timeline: readonly PolicyTimeline[];
  readonly simulateOnly: boolean;
  readonly decisionCount: number;
  readonly lastSummary: string;
  readonly runSimulation: () => void;
  readonly runBatch: () => void;
  readonly reset: () => void;
}

export const useRecoveryPolicyConsole = ({
  tenant,
  runId,
  session,
  program,
  readinessPlan,
  signals,
}: UseRecoveryPolicyConsoleParams): UseRecoveryPolicyConsoleResult => {
  const [running, setRunning] = useState(false);
  const [records, setRecords] = useState<readonly PolicyRunRecord[]>([]);
  const [timeline, setTimeline] = useState<readonly PolicyTimeline[]>([]);
  const [simulateOnly, setSimulateOnly] = useState(false);

  const context: PolicyExecutionContext = useMemo(
    () => ({
      tenant: withBrand(tenant, 'TenantId'),
      runId,
      sessionId: `${runId}:policy-console`,
      session,
      program,
      readinessPlan,
      signals,
      readinessSignals: [],
      startedAt: new Date().toISOString(),
      triggeredBy: 'ui',
    }),
    [tenant, runId, session, program, readinessPlan, signals],
  );

  const runBatch = useCallback(() => {
    setRunning(true);
    try {
      const scoreCard = computePolicyScoreCard(context);
      const decision: PolicyRunRecord['decision'] = scoreCard.compositeScore >= 60 ? 'allow' : 'block';
      const reason = `scorecard=${scoreCard.compositeScore}`;
      const env = buildMockEnvelope(runId, tenant, scoreCard.compositeScore, decision);

      const nextRecord: PolicyRunRecord = {
        runId,
        state: env.state,
        decision,
        summary: reason,
        confidence: env.summary.confidence,
        at: new Date().toISOString(),
      };

      const nextTimeline = buildSimulationTimeline(runId, tenant, {
        state: env.state,
        summary: env.summary,
      });

      setRecords((current) => [nextRecord, ...current].slice(0, 40));
      setTimeline((current) => [nextTimeline, ...current].slice(0, 20));
    } finally {
      setRunning(false);
    }
  }, [context, runId, tenant]);

  const runSimulation = useCallback(() => {
    setSimulateOnly(true);
    const simulation = simulatePolicyDecision({
      tenant: withBrand(tenant, 'TenantId'),
      runId: withBrand(runId, 'RecoveryRunId'),
      program,
      signals,
      baselineDensity: 45,
      activeSignalsBySource: { telemetry: signals.length },
      nowIso: new Date().toISOString(),
    });

    const record: PolicyRunRecord = {
      runId,
      state: simulation.expectedOutcome === 'allow' ? 'allowed' : 'blocked',
      decision: simulation.expectedOutcome,
      summary: `simulation score=${simulation.score}`,
      confidence: simulation.policyDelta.confidence,
      at: new Date().toISOString(),
    };

    const simulationTimeline = buildSimulationTimeline(runId, tenant, {
      state: record.state,
      summary: {
        decision: record.decision,
        decisionReason: record.summary,
        confidence: simulation.policyDelta.confidence,
        criticality: simulation.score > 60 ? 'low' : 'high',
        findings: ['simulation'],
      },
    });

    setRecords((current) => [record, ...current].slice(0, 40));
    setTimeline((current) => [simulationTimeline, ...current].slice(0, 20));
    setSimulateOnly(false);
  }, [tenant, runId, program, signals]);

  const reset = useCallback(() => {
    setRecords([]);
    setTimeline([]);
    setSimulateOnly(false);
  }, []);

  const decisionCount = useMemo(() => records.length, [records]);
  const lastSummary = useMemo(() => records[0]?.summary ?? 'no_decisions', [records]);

  return {
    running,
    records,
    timeline,
    simulateOnly,
    decisionCount,
    lastSummary,
    runBatch,
    runSimulation,
    reset,
  };
};
