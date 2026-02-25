import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GraphStep } from '@domain/recovery-lab-synthetic-orchestration';
import {
  executeAdvancedPlan,
  type AdvancedBlueprintInput,
  type AdvancedBlueprint,
  buildStudioBlueprint,
  filterByTag,
  prepareTimelineFromEnvelope,
  readBlueprintDigest,
} from '../services/advancedStudioService';
import { buildBlueprintInput, compileTemplatePlan, buildTemplateBlueprints } from '../services/advancedTemplateService';
import {
  type TimelineSequence,
  toTimelineLines,
} from '@shared/stress-lab-runtime/orchestration-timeline';
import type { ResourceLease } from '@shared/stress-lab-runtime/async-resource-stack';
import { canonicalRuntimeNamespace, withRunContext } from '@shared/stress-lab-runtime/advanced-lab-core';

type StageState = 'idle' | 'loading' | 'running' | 'completed' | 'errored';

interface TimelineState {
  readonly lines: string;
  readonly sequence: TimelineSequence<unknown>;
}

interface AdvancedPlanState {
  readonly status: StageState;
  readonly templateTags: readonly string[];
  readonly plan: AdvancedBlueprint | null;
  readonly timeline: TimelineState | null;
  readonly digest: string;
  readonly error: string | null;
  readonly planSteps: readonly string[];
  readonly leaseToken: string | null;
}

const initialState = (): AdvancedPlanState => ({
  status: 'idle',
  templateTags: [],
  plan: null,
  timeline: null,
  digest: '',
  error: null,
  planSteps: [],
  leaseToken: null,
});

const toTags = (input: ReadonlyArray<{ tag: string }>): readonly string[] =>
  [...new Set(input.map((entry) => entry.tag))];

const sortPlan = (plan: AdvancedBlueprint): AdvancedBlueprint => ({
  ...plan,
  steps: [...plan.steps].toSorted((left, right) => left.localeCompare(right)),
});

const mapTimelineToLines = (timeline: TimelineSequence<unknown>): TimelineState => ({
  lines: toTimelineLines(timeline),
  sequence: timeline,
});

export const useAdvancedScenarioPlan = (tenantId: string, scenarioCount: number = 3) => {
  const [state, setState] = useState<AdvancedPlanState>(initialState);
  const templates = useMemo(() => buildTemplateBlueprints(tenantId, scenarioCount), [tenantId, scenarioCount]);

  const refreshTemplates = useCallback(async () => {
    setState((previous) => ({ ...previous, status: 'loading', error: null }));
    try {
      const input = buildBlueprintInput(tenantId, 'refresh', scenarioCount);
      const blueprint = buildStudioBlueprint(input);
      const tags = toTags(blueprint.steps.map((step) => ({ tag: step.slice(0, 4) })));
      setState((previous) => ({
        ...previous,
        status: 'idle',
        templateTags: tags,
        plan: sortPlan(blueprint),
        planSteps: filterByTag(tags.map((tag) => ({ tag })), ['sim', 'run', 'str']).map((entry) => entry.tag),
        digest: readBlueprintDigest(blueprint),
        error: null,
      }));
    } catch (error) {
      setState((previous) => ({ ...previous, status: 'errored', error: String(error) }));
    }
  }, [tenantId, scenarioCount]);

  const runPlan = useCallback(async () => {
    if (!state.plan) {
      return;
    }

    setState((previous) => ({ ...previous, status: 'running', error: null }));
    const blueprintInput: AdvancedBlueprintInput = buildBlueprintInput(tenantId, state.plan.scenarioId, scenarioCount);
    try {
      const result = await executeAdvancedPlan(blueprintInput);
      const lines = toTimelineLines(result.timeline);
      const timeline = mapTimelineToLines(result.timeline);
      setState((previous) => ({
        ...previous,
        status: 'completed',
        timeline: {
          ...timeline,
          lines,
        },
        planSteps: [...previous.planSteps, ...result.pipeline.records.map((record) => `${record.step}`)],
      }));
    } catch (error) {
      setState((previous) => ({ ...previous, status: 'errored', error: String(error) }));
    }
  }, [tenantId, scenarioCount, state.plan]);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  const inspectTemplatePlan = useCallback((index: number) => {
    const compiled = compileTemplatePlan(tenantId, `scenario-${index}`, index);
    return {
      id: compiled.templateId,
      kind: 'snapshot',
      steps: compiled.steps,
      runbookCount: compiled.runbook.length,
    };
  }, [tenantId]);

  const runContextRun = useCallback(() => {
    const route = withRunContext(
      canonicalRuntimeNamespace(templates[0]?.namespace ?? 'prod:interactive:console'),
      (_, runRoute) => {
      const [namespace, tenant, ...rest] = runRoute.split('/');
      void rest;
      return `${namespace}:${tenant}`;
    },
    );

    setState((previous) => ({
      ...previous,
      leaseToken: route,
    }));
  }, [templates]);

  useEffect(() => {
    let mounted = true;
    const bootstrap = async () => {
      const { lines, snapshot } = await prepareTimelineFromEnvelope(tenantId);
      if (!mounted) {
        return;
      }
      setState((previous) => ({
        ...previous,
        plan: previous.plan ?? buildStudioBlueprint(buildBlueprintInput(tenantId, 'bootstrap', scenarioCount)),
        timeline: { lines, sequence: [] },
        digest: `${snapshot.planId}`,
      }));
    };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, [tenantId, scenarioCount]);

  const isReady = state.plan !== null && state.status !== 'running';
  const lease = useMemo<ResourceLease | null>(() => (state.leaseToken ? {
    token: state.leaseToken,
    namespace: tenantId,
    createdAt: Date.now(),
    config: { tenantId, requestId: tenantId, namespace: tenantId },
  } : null), [tenantId, state.leaseToken]);

  return {
    ...state,
    templates,
    isReady,
    lease,
    refreshTemplates,
    runPlan,
    reset,
    inspectTemplatePlan,
    runContextRun,
  };
};
