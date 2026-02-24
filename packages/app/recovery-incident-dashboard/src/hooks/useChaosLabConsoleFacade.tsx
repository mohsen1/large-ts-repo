import { useCallback, useEffect, useMemo, useState } from 'react';
import { type Result } from '@shared/result';
import {
  fallbackInput,
  buildFacadeContext,
  runChaosLabConsoleSession,
  type ChaosLabConsoleContext,
  type ChaosLabConsoleSessionResult
} from '@service/recovery-chaos-lab-console-orchestrator';
import type { StageBoundary } from '@domain/recovery-chaos-lab';

type ChaosIntent = 'stabilize' | 'simulate' | 'analyze';

type ChaosScope = 'ingest' | 'stage' | 'analyze' | 'simulate' | 'repair' | 'observe';

type StageTemplate = StageBoundary<
  string,
  {
    readonly tenant: string;
    readonly seed: number;
    readonly scope: ChaosScope;
    readonly index: number;
    readonly latencyBudgetMs: number;
  },
  {
    readonly status: string;
    readonly score: number;
    readonly metrics: {
      readonly score: number;
    };
  }
>;

interface LabInput {
  readonly tenant: string;
  readonly scenario: string;
  readonly workspace: string;
}

interface LabErrorSummary {
  readonly source: string;
  readonly message: string;
  readonly happenedAt: string;
}

interface LabExecutionSummary {
  readonly runId: string;
  readonly workspace: string;
  readonly score: number;
  readonly phaseCount: number;
  readonly entropy: number;
  readonly intent: ChaosIntent;
  readonly timestamp: string;
}

interface LabState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly context?: ChaosLabConsoleContext<readonly StageTemplate[]>;
  readonly summary?: LabExecutionSummary;
  readonly lastError?: LabErrorSummary;
  readonly eventCount: number;
}

interface StageTemplateSpec {
  readonly stage: ChaosScope;
  readonly version: `${number}.${number}.${number}`;
  readonly latencyBudgetMs: number;
}

const defaultStages = [
  { stage: 'ingest', version: '1.0.0', latencyBudgetMs: 420 },
  { stage: 'stage', version: '1.0.0', latencyBudgetMs: 360 },
  { stage: 'analyze', version: '1.0.1', latencyBudgetMs: 540 },
  { stage: 'simulate', version: '1.1.0', latencyBudgetMs: 500 },
  { stage: 'repair', version: '1.1.1', latencyBudgetMs: 620 },
  { stage: 'observe', version: '1.2.0', latencyBudgetMs: 300 }
] as const satisfies readonly StageTemplateSpec[];

const toInput = ({ tenant, scenario }: LabInput): ReturnType<typeof fallbackInput> =>
  fallbackInput(tenant, scenario);

const inferIntent = (score: number): ChaosIntent =>
  score > 90 ? 'stabilize' : score > 60 ? 'simulate' : 'analyze';

const buildStages = (): readonly StageTemplate[] =>
  defaultStages.map((stage, index) => ({
    name: `${stage.stage}:${index}`,
    version: stage.version,
    metadata: {
      scope: stage.stage,
      expectedLatency: stage.latencyBudgetMs,
      index
    },
    input: {
      tenant: 'tenant:runtime',
      seed: Date.now(),
      scope: stage.stage,
      index,
      latencyBudgetMs: stage.latencyBudgetMs
    },
    output: {
      status: 'pending',
      score: index * 10,
      metrics: {
        score: 0.0
      }
    },
    dependsOn: index === 0 ? [] : [`${defaultStages[index - 1].stage}:${index - 1}`],
    weight: stage.latencyBudgetMs
  }));

export interface UseChaosLabConsoleFacadeResult {
  readonly state: Readonly<LabState>;
  readonly workspaceTitle: string;
  readonly run: () => Promise<Result<ChaosLabConsoleSessionResult>>;
  readonly reset: () => void;
}

export const useChaosLabConsoleFacade = (input: LabInput): UseChaosLabConsoleFacadeResult => {
  const [state, setState] = useState<LabState>({
    status: 'idle',
    eventCount: 0
  });

  const stages = useMemo(() => buildStages(), []);
  const tenantWorkspace = useMemo(() => `${input.tenant}-${input.scenario}`, [input.tenant, input.scenario]);

  const run = useCallback(async () => {
    setState((snapshot) => ({ ...snapshot, status: 'loading', lastError: undefined }));
    const consoleInput = toInput(input);
    const context = buildFacadeContext(input.tenant, input.scenario, consoleInput, stages);
    const execution = await runChaosLabConsoleSession(input.tenant, input.scenario, consoleInput, stages);
    if (!execution.ok) {
      setState((snapshot) => ({
        ...snapshot,
        status: 'error',
        eventCount: 0,
        lastError: {
          source: 'runChaosLabConsoleSession',
          message: String(execution.error),
          happenedAt: new Date().toISOString()
        }
      }));
      return execution;
    }

    const summary: LabExecutionSummary = {
      runId: execution.value.execution.runId,
      workspace: execution.value.execution.workspace,
      score: execution.value.execution.score,
      phaseCount: execution.value.execution.phaseTimeline.length,
      entropy: execution.value.diagnostics.entropy,
      intent: inferIntent(execution.value.execution.score),
      timestamp: new Date().toISOString()
    };

    setState({
      status: 'ready',
      context,
      summary,
      eventCount: execution.value.execution.events.length
    });
    return execution;
  }, [input, stages]);

  const reset = useCallback(() => {
    setState({
      status: 'idle',
      eventCount: 0
    });
  }, []);

  useEffect(() => {
    void run();
  }, [run]);

  return {
    state,
    workspaceTitle: tenantWorkspace,
    run,
    reset
  };
};
