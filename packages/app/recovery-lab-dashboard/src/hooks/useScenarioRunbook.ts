import { useCallback, useMemo, useState } from 'react';
import type { AdvancedBlueprintInput } from '../services/advancedStudioService';
import { buildBlueprintInput } from '../services/advancedTemplateService';
import {
  type PipelineContext,
  type PipelineStep,
  collectFilteredPipeline,
  mapPipelineOutput,
  streamPipeline,
} from '@shared/stress-lab-runtime/iterative-pipeline';
import { canonicalRuntimeNamespace } from '@shared/stress-lab-runtime/advanced-lab-core';

interface RunbookTemplate {
  readonly scenarioId: string;
  readonly namespace: string;
  readonly labels: readonly string[];
}

interface RunbookState {
  readonly name: string;
  readonly namespace: string;
  readonly output: string | null;
  readonly steps: readonly string[];
  readonly errors: readonly string[];
  readonly hasOutput: boolean;
}

type ChainInput = ReadonlyArray<{ readonly id: string; readonly plugin: string }>;

type RunbookPipeline = readonly [
  PipelineStep<ChainInput, readonly string[]>,
  PipelineStep<readonly string[], readonly string[]>,
  PipelineStep<readonly string[], readonly string[]>,
];

const normalizeOutput = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
};

const defaultTemplate = (tenantId: string): RunbookTemplate => ({
  scenarioId: `template-${tenantId}`,
  namespace: 'prod:interactive:console',
  labels: ['default', 'runbook', tenantId],
});

const buildRunbookChain = (input: ChainInput): RunbookPipeline => {
  return [
    {
      label: 'build-runbook-step-id',
      weight: 10,
      execute: (payload) => payload.map((entry) => `${entry.id}:${entry.plugin}`),
    },
    {
      label: 'normalize-runbook',
      weight: 20,
      execute: (payload) => [...payload].sort(),
    },
    {
      label: 'stringify-runbook',
      weight: 30,
      execute: (payload) => payload.flatMap((entry) => entry.split(':')),
    },
  ];
};

export const useScenarioRunbook = (tenantId: string) => {
  const [state, setState] = useState<RunbookState>(() => {
    const baseline = defaultTemplate(tenantId);
    return {
      name: baseline.scenarioId,
      namespace: baseline.namespace,
      output: null,
      steps: [],
      errors: [],
      hasOutput: false,
    };
  });

  const template = useMemo(() => defaultTemplate(tenantId), [tenantId]);

  const runbookSteps = useMemo(
    () => buildBlueprintInput(tenantId, template.scenarioId, Math.max(1, template.labels.length)).graphSteps,
    [tenantId, template],
  );

  const runbookInput = useMemo<AdvancedBlueprintInput>(() => ({
    tenantId,
    namespace: canonicalRuntimeNamespace(template.namespace),
    scenarioId: template.scenarioId,
    graphSteps: runbookSteps,
  }), [tenantId, runbookSteps, template]);

  const runbookExecution = useCallback(async () => {
    try {
      const payload = runbookSteps.map((step) => ({ id: step.id, plugin: step.plugin }));
      const pipelineSteps = buildRunbookChain(payload);
      const context: PipelineContext = {
        tenantId,
        runId: `${tenantId}-${template.scenarioId}`,
        startedAt: Date.now(),
      };

      const pipeline = pipelineSteps as readonly PipelineStep<unknown, unknown>[];
      const result = await streamPipeline<readonly PipelineStep<unknown, unknown>[], readonly string[]>(
        pipeline,
        payload as unknown as readonly string[],
        context,
      );

      const filtered = collectFilteredPipeline(result.output as readonly string[], (entry, index) => entry.length > 0 && index < 16);
      const outputLines = mapPipelineOutput(filtered, (value) => normalizeOutput(value));

      setState((previous) => ({
        ...previous,
        name: `${previous.name}:executed`,
        output: outputLines.join('\n'),
        steps: outputLines,
        errors: [],
        hasOutput: true,
      }));
    } catch (error) {
      setState((previous) => ({
        ...previous,
        errors: [...previous.errors, String(error)],
      }));
    }
  }, [tenantId, runbookSteps, template.scenarioId]);

  const resetRunbook = useCallback(() => {
    setState({
      name: template.scenarioId,
      namespace: template.namespace,
      output: null,
      steps: [],
      errors: [],
      hasOutput: false,
    });
  }, [template.namespace, template.scenarioId]);

  const runbookGraphFingerprint = useMemo(
    () => runbookInput.graphSteps.map((entry) => `${entry.id}::${entry.phase}`).join('|'),
    [runbookInput.graphSteps],
  );

  return {
    ...state,
    template,
    runbookInput,
    runbookSteps,
    runbookExecution,
    resetRunbook,
    runbookGraphFingerprint,
  };
};
