import { useMemo } from 'react';
import type { RecoveryTimeline } from '@domain/recovery-timeline';
import {
  buildPlanFromFilter,
  createPlanFromTimeline,
  emitPathReport,
  evaluateIntent,
  type TimelineDslExecutionInput,
  TimelineOrchestrationPlan,
} from '@domain/recovery-timeline';
import {
  runPolicyAwareOrchestration,
  runPolicyAwareSimulation,
} from '@service/recovery-timeline-orchestrator';
import { resolveRepository, getTimeline, listTimelines, seedRepository } from './recoveryTimelineAdapter';

export interface TimelineLabPluginSummary {
  timelineId: string;
  planId: string;
  steps: number;
  riskWindow: readonly [number, number];
  readyHint: string;
}

export interface TimelineLabWorkspaceData {
  readonly selectedTimeline: RecoveryTimeline | undefined;
  readonly filteredTimelines: RecoveryTimeline[];
  readonly plan: TimelineOrchestrationPlan;
  readonly pathReport: string;
  readonly pluginSummary: TimelineLabPluginSummary[];
  readonly forecastRisk: number;
}

export function buildLabWorkspaceData(seed: RecoveryTimeline[], ownerTeam: string, query = ''): TimelineLabWorkspaceData[] {
  const timelines = listTimelines({ ownerTeam, query: query || undefined, includeSegments: false });
  const seeded = seed.length > 0 ? seed : timelines;
  if (seeded.length > 0) {
    seedRepository(seeded);
  }

  const iterator = (globalThis as { Iterator?: { from: (iter: Iterable<RecoveryTimeline>) => { map: (...args: any[]) => { toArray: () => RecoveryTimeline[] } } } }).Iterator;
  const orderedTimelines: RecoveryTimeline[] = iterator
    ? iterator
        .from(seeded)
        .map((timeline: RecoveryTimeline) => timeline)
        .toArray()
    : [...seeded];

  return orderedTimelines.map((timeline) => {
    const path = buildPlanFromFilter(timeline, { ownerTeam });
    const plan = createPlanFromTimeline(timeline);
    const pathReport = emitPathReport(timeline);
    const intentInput: TimelineDslExecutionInput = {
      timeline,
      state: timeline.events[0]?.state ?? 'queued',
      forecast: undefined,
      segments: [],
    };
    const intentEval = evaluateIntent({
      phase: timeline.events[0]?.phase ?? 'prepare',
      events: timeline.events,
      route: {
        route: `/timeline/${timeline.id}`,
        routeArgs: [timeline.id],
      },
    });
    return {
      selectedTimeline: getTimeline(timeline.id),
      filteredTimelines: listTimelines({ ownerTeam }),
      plan,
      pathReport: `${path.join('|')}::${pathReport}::active=${intentEval.active ? 'yes' : 'no'}`,
      pluginSummary: [
        {
          timelineId: timeline.id,
          planId: plan.id,
          steps: plan.steps.length,
          riskWindow: plan.riskWindow as readonly [number, number],
          readyHint: timeline.updatedAt.toISOString(),
        },
      ],
      forecastRisk: Math.round((intentEval.instructionCount / Math.max(1, timeline.events.length)) * 100),
    };
  });
}

export async function runLabPolicyAction(
  timelineId: string,
  action: 'advance' | 'simulate' | 'reopen',
): Promise<string> {
  const repository = resolveRepository();
  const result = await runPolicyAwareOrchestration(repository, timelineId, action, 'timeline-lab');
  if (!result.ok) {
    return `action failed: ${(result.error as Error).message}`;
  }
  const snapshot = result.value.snapshot;
  return `${snapshot?.note ?? 'ok'} @ ${snapshot?.measuredAt.toISOString()}`;
}

export function resolvePluginSummary(ownerTeam: string, query = ''): readonly TimelineLabPluginSummary[] {
  const timelines = listTimelines({ ownerTeam, query: query || undefined, includeSegments: false });
  const summary = timelines.flatMap((timeline) => {
    const plan = createPlanFromTimeline(timeline);
    const rows = plan.steps.map((step, index) => ({
      timelineId: timeline.id,
      planId: plan.id,
      steps: index + 1,
      riskWindow: plan.riskWindow,
      readyHint: step,
    }));
    return rows;
  });
  return summary;
}

export async function runSimulationPreview(timelineId: string): Promise<string> {
  const repository = resolveRepository();
  const selected = getTimeline(timelineId);
  if (!selected) {
    return 'timeline-not-found';
  }
  const forecast = await runPolicyAwareSimulation(selected, repository);
  if (!forecast.ok) {
    return `failed to simulate: ${(forecast.error as Error).message}`;
  }
  return `${forecast.value.measuredAt.toISOString()} :: confidence=${forecast.value.confidence}`;
}

export function useTimelineLabSummary(ownerTeam: string): TimelineLabPluginSummary[] {
  const timelines = listTimelines({ ownerTeam, includeSegments: false });
  return useMemo(
    () =>
      timelines.map((timeline) => {
        const plan = createPlanFromTimeline(timeline);
        return {
          timelineId: timeline.id,
          planId: plan.id,
          steps: plan.steps.length,
          riskWindow: plan.riskWindow as readonly [number, number],
          readyHint: plan.statePath.at(-1) ?? '',
        };
      }),
    [timelines],
  );
}
