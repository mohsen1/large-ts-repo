import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RecoveryPlan } from '@domain/recovery-cockpit-models';
import {
  type ConstellationMode,
  type ConstellationStage,
  type ConstellationId,
  ConstellationRunId,
  newRunId,
  newConstellationId,
} from '@domain/recovery-cockpit-constellation-core';
import {
  type OrchestratorInput,
  type OrchestratorRuntime,
  createConstellationOrchestrator,
} from '@service/recovery-cockpit-constellation-orchestrator';
import { planToTopology } from '@data/recovery-cockpit-constellation-store';

type PlanMode = RecoveryPlan['mode'];
type PipelineNode = {
  readonly stage: ConstellationStage;
  readonly order: number;
};
type PipelineResult = {
  readonly runMode: ConstellationMode;
  readonly stages: readonly PipelineNode[];
  readonly nodes: number;
};

type OrchestratorOptions = {
  readonly plan: RecoveryPlan;
  readonly constellationId: string;
  readonly runMode?: ConstellationMode;
  readonly preferredMode?: PlanMode;
  readonly preferredPath?: readonly ConstellationStage[];
  readonly maxPathLength?: number;
  readonly compact?: boolean;
};

export type ConstellationOrchestratorResult = {
  readonly runtime?: OrchestratorRuntime;
  readonly loading: boolean;
  readonly error?: string;
  readonly pipeline: PipelineResult;
  readonly start: (mode?: ConstellationMode) => Promise<void>;
  readonly inspect: (runId: string) => Promise<void>;
  readonly refresh: () => Promise<void>;
  readonly history: ReadonlyArray<OrchestratorRuntime>;
};

const stageSet = [
  'bootstrap',
  'ingest',
  'synthesize',
  'validate',
  'simulate',
  'execute',
  'recover',
  'sweep',
] as const;

const buildPipeline = (runMode: ConstellationMode, topologyLength: number): PipelineResult => {
  const base = runMode === 'analysis'
    ? stageSet.slice(0, 4)
    : runMode === 'simulation'
      ? stageSet.slice(0, 6)
      : stageSet;

  const stages = base
    .map<PipelineNode>((stage, order) => ({ stage, order }))
    .toReversed()
    .toReversed()
    .filter((item, index) => index < Math.max(4, topologyLength % 5 + 4));

  return {
    runMode,
    stages: stages,
    nodes: topologyLength,
  };
};

const mapPlanMode = (mode: PlanMode | undefined): ConstellationMode => {
  if (mode === 'automated') return 'execution';
  if (mode === 'manual') return 'analysis';
  if (mode === 'semi') return 'stabilization';
  return 'analysis';
};

const sanitizeMode = (mode: ConstellationMode | PlanMode | undefined): ConstellationMode => {
  if (mode === 'analysis' || mode === 'simulation' || mode === 'execution' || mode === 'stabilization') {
    return mode;
  }
  return mapPlanMode(mode);
};

const makeConstellationId = (value: string): ConstellationId => newConstellationId(value);
const parseRunId = (value: string): ConstellationRunId => newRunId(value);

export const useConstellationOrchestrator = (input: OrchestratorOptions): ConstellationOrchestratorResult => {
  const [runtime, setRuntime] = useState<OrchestratorRuntime | undefined>();
  const [history, setHistory] = useState<ReadonlyArray<OrchestratorRuntime>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [orchestrator, setOrchestrator] = useState<Awaited<ReturnType<typeof createConstellationOrchestrator>> | null>(null);
  const disposedRef = useRef(false);

  const topology = useMemo(() => planToTopology(input.plan), [input.plan]);
  const pipeline = useMemo(
    () => buildPipeline((sanitizeMode(input.runMode) ?? 'analysis') as ConstellationMode, topology.nodes.length),
    [input.runMode, topology.nodes.length],
  );

  const start = useCallback(
    async (mode?: ConstellationMode) => {
      setLoading(true);
      setError(undefined);

      const activeMode = (mode ?? pipeline.runMode) as ConstellationMode;
      const runtimeController = await createConstellationOrchestrator({
        constellationId: makeConstellationId(input.constellationId),
        mode: 'live',
        runMode: activeMode,
        plan: input.plan,
        preferredPath: input.preferredPath,
      } satisfies OrchestratorInput);

      if (disposedRef.current) {
        runtimeController[Symbol.asyncDispose]?.();
        setLoading(false);
        return;
      }

      setOrchestrator(runtimeController);
      const result = await runtimeController.run();
      if (!result.ok) {
        setError(typeof result.error === 'string' ? result.error : 'orchestrator failed');
        setLoading(false);
        return;
      }

      setRuntime(result.value);
      setHistory((current) => [result.value, ...current].toReversed().toReversed().slice(0, 8));
      setLoading(false);
    },
    [input.constellationId, input.plan, input.preferredPath, pipeline.runMode],
  );

  const inspect = useCallback(
    async (runId: string) => {
      if (!orchestrator) {
        setError('no active orchestrator');
        return;
      }
      const requestedRunId = parseRunId(runId);
      const found = await orchestrator.inspect(requestedRunId);
      if (!found.ok) {
        setError(typeof found.error === 'string' ? found.error : 'lookup failed');
        return;
      }
      if (!found.value) {
        setError(`run ${runId} not found`);
        return;
      }
      setRuntime(found.value);
      setHistory((current) => [found.value, ...current].filter((entry): entry is OrchestratorRuntime => entry !== undefined).slice(0, 8));
    },
    [orchestrator],
  );

  const refresh = useCallback(async () => {
    await start(input.runMode);
  }, [start, input.runMode]);

  useEffect(() => {
    void (async () => {
      const seedRunMode = (sanitizeMode(input.runMode) ?? 'analysis') as ConstellationMode;
      await start(seedRunMode);
    })();

    return () => {
      disposedRef.current = true;
      void orchestrator?.[Symbol.asyncDispose]();
    };
  }, [start, input.runMode, orchestrator]);

  return {
    runtime,
    loading,
    error,
    pipeline,
    start,
    inspect,
    refresh,
    history,
  };
};
