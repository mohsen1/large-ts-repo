import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SetStateAction, Dispatch } from 'react';
import {
  createRecoveryWorkflowEngine,
  type CommandSynthesisPlan,
  type CommandSynthesisResult,
  type RecoveryWorkflowInput,
  type RecoveryWorkflowOutput,
} from '@service/recovery-fusion-orchestrator';
import { createSynthesisGraph, createSampleGraph } from '@domain/recovery-command-orchestration';
import { withBrand } from '@shared/core';
import type { RunSession } from '@domain/recovery-operations-models';

interface CommandOrchestrationState {
  readonly tenant: string;
  readonly runId: string;
  readonly activeGraphId?: string;
  readonly readyCount: number;
  readonly blockedCount: number;
}

export interface UseRecoveryCommandOrchestrationReturn {
  readonly state: CommandOrchestrationState;
  readonly plan?: CommandSynthesisPlan;
  readonly result?: CommandSynthesisResult;
  readonly error?: string;
  readonly running: boolean;
  readonly log: readonly string[];
  readonly buildGraph: () => void;
  readonly run: (input: Omit<RecoveryWorkflowInput, 'graph'>) => Promise<void>;
  readonly replay: () => Promise<void>;
  readonly clear: () => void;
}

const withTimestamp = (entry: string) => `${new Date().toISOString()} ${entry}`;
const appendLog =
  (setLog: Dispatch<SetStateAction<readonly string[]>>) => (entry: string) =>
    setLog((previous) => [...previous, withTimestamp(entry)]);

const createPlanSeed = (tenant: string): CommandSynthesisPlan => {
  const graph = createSampleGraph({
    tenant,
    runId: withBrand(`${tenant}:seed`, 'RecoveryRunId'),
  });

  return {
    graphId: graph.id,
    planName: `${tenant}:seed-plan`,
    runId: String(graph.runId),
    tenant,
    requestedBy: tenant,
    waveCount: Math.max(4, graph.waves.length),
    snapshot: {
      cursor: {
        graphId: graph.id,
        index: 0,
        windowStart: graph.createdAt,
        windowEnd: graph.updatedAt,
      },
      generatedAt: new Date().toISOString(),
      totalNodes: graph.nodes.length,
      blockedNodes: graph.nodes.filter((node) => node.state === 'blocked').length,
      riskScore: 95,
      criticalPathLength: Math.max(1, graph.waves.length),
      waveCoverage: Math.max(1, graph.waves.length),
    },
    query: {
      tenant,
      graphId: graph.id,
      limit: 20,
    },
  };
};

const toSessionFingerprint = (session: RunSession) => `${session.id}:${session.runId}:${session.status}`;

export const useRecoveryCommandOrchestration = (initialTenant = 'global'): UseRecoveryCommandOrchestrationReturn => {
  const [tenant, setTenant] = useState(initialTenant);
  const [runId, setRunId] = useState(`${initialTenant}:${Date.now()}`);
  const [plan, setPlan] = useState<CommandSynthesisPlan | undefined>(undefined);
  const [result, setResult] = useState<CommandSynthesisResult | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<readonly string[]>([]);
  const [sessionFingerprint, setSessionFingerprint] = useState('');

  const logger = useMemo(() => appendLog(setLog), []);
  const engine = useMemo(() => createRecoveryWorkflowEngine(), []);

  const state: CommandOrchestrationState = useMemo(
    () => ({
      tenant,
      runId,
      activeGraphId: plan?.graphId,
      readyCount: plan?.snapshot.totalNodes ?? 0,
      blockedCount: plan?.snapshot.blockedNodes ?? 0,
    }),
    [tenant, runId, plan],
  );

  const buildGraph = useCallback(() => {
    const seeded = createPlanSeed(tenant);
    const session: RunSession = {
      id: withBrand(`${tenant}:session`, 'RunSessionId'),
      runId: withBrand(`${tenant}:run`, 'RecoveryRunId'),
      ticketId: withBrand(`${tenant}:ticket`, 'RunTicketId'),
      planId: withBrand(`${tenant}:plan`, 'RunPlanId'),
      status: 'queued',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      constraints: {
        maxParallelism: 3,
        maxRetries: 3,
        timeoutMinutes: 90,
        operatorApprovalRequired: false,
      },
      signals: [],
    };
    setSessionFingerprint(toSessionFingerprint(session));
    setPlan({
      ...seeded,
      graphId: withBrand(`${tenant}:run:${Date.now()}`, 'CommandGraphId'),
      runId: String(session.runId),
      query: {
        tenant,
        graphId: seeded.graphId,
        limit: Math.max(10, session.signals.length + 40),
      },
    });
    setRunId(String(session.runId));
    logger(`build graph ${seeded.planName}`);
  }, [logger, tenant]);

  const run = useCallback(
    async (input: Omit<RecoveryWorkflowInput, 'graph'>) => {
      if (!plan) {
        setError('missing plan');
        return;
      }
      setRunning(true);
      setError(undefined);
      logger(`run started ${input.tenant}`);
      try {
        const graph = createSynthesisGraph({
          tenant: input.tenant,
          runId: withBrand(input.runId, 'RecoveryRunId'),
          operator: input.operator,
          waveCount: Math.max(4, plan.query.limit ?? 4),
        });
        const result = await engine.synthesize({ ...input, graph });
        if (!result.ok) {
          setError(result.error.message);
          logger(`run failed ${result.error.message}`);
          return;
        }
        const output: RecoveryWorkflowOutput = result.value;
        setPlan(output.plan);
        setResult(output.result);
        setRunId(String(output.trace.traceId));
        logger(`run complete ${output.trace.traceId}`);
        logger(`trace depth ${output.trace.tracePath.length}`);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'run failed');
      } finally {
        setRunning(false);
      }
    },
    [engine, logger, plan],
  );

  const replay = useCallback(async () => {
    if (!plan) return;
    setRunning(true);
    logger(`replay started ${plan.graphId}`);
    try {
      const graph = createSynthesisGraph({
        tenant,
        runId: withBrand(runId, 'RecoveryRunId'),
        operator: tenant,
      });
      const replayResult = await engine.synthesize({
        graph,
        runId: String(runId),
        operator: tenant,
        tenant,
      });
      if (!replayResult.ok) {
        setError(replayResult.error.message);
        logger(`replay failed ${replayResult.error.message}`);
        return;
      }
      setResult(replayResult.value.result);
      setPlan(replayResult.value.plan);
      logger(`replay complete ${replayResult.value.trace.traceId}`);
    } finally {
      setRunning(false);
    }
  }, [engine, logger, plan, runId, tenant]);

  useEffect(() => {
    buildGraph();
    if (!sessionFingerprint) {
      setSessionFingerprint(`${tenant}:${runId}`);
    }
  }, [buildGraph, sessionFingerprint, tenant, runId]);

  return {
    state,
    plan,
    result,
    error,
    running,
    log,
    buildGraph,
    run,
    replay,
    clear: () => {
      setPlan(undefined);
      setResult(undefined);
      setError(undefined);
      setLog([]);
      setTenant(initialTenant);
      setRunId(`${initialTenant}:${Date.now()}`);
      setSessionFingerprint('');
    },
  };
};
