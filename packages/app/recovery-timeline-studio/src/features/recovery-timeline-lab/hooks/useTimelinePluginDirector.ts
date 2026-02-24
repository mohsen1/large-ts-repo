import { useMemo } from 'react';
import { useTimelineLabWorkspace } from './useTimelineLabWorkspace';
import { RecoveryTimeline } from '@domain/recovery-timeline';
import { aggregateHealth } from '@domain/recovery-timeline';
import type { TimelineLabWorkspaceData } from '../../../services/recoveryTimelineLabAdapter';

interface PluginDirectorConfig {
  timelines: RecoveryTimeline[];
}

export interface PluginDirectorSnapshot {
  readonly totalSteps: number;
  readonly averageRisk: number;
  readonly active: number;
  readonly skipped: number;
}

export interface PluginDirectorState {
  readonly snapshot: PluginDirectorSnapshot;
  readonly activeTimelineLabels: readonly string[];
}

export function useTimelinePluginDirector(config: PluginDirectorConfig): PluginDirectorState & {
  isCritical: (timelineId: string) => boolean;
  pluginRatio: (timelineId: string) => number;
} {
  const { records, state } = useTimelineLabWorkspace(config.timelines);
  const metrics = useMemo(() => {
    const active = records.filter((entry: TimelineLabWorkspaceData) => entry.selectedTimeline?.events.some((event) => event.state === 'running')).length;
    const skipped = records.filter((entry: TimelineLabWorkspaceData) => entry.forecastRisk < 50).length;
    const totalSteps = records.reduce((acc, entry) => acc + entry.plan.steps.length, 0);
    const totalRisk = records.reduce((acc, entry) => {
      const timeline = entry.selectedTimeline;
      if (!timeline) {
        return acc;
      }
      return acc + aggregateHealth(timeline.events).riskScoreAverage;
    }, 0);
    return { totalSteps, averageRisk: totalRisk / Math.max(1, records.length), active, skipped, selectedId: state.selectedTimelineId };
  }, [records, state.selectedTimelineId]);

  const activeTimelineLabels = useMemo(
    () => records.map((entry) => `${entry.selectedTimeline?.id ?? entry.pluginSummary[0]?.timelineId}`).filter(Boolean),
    [records],
  );

  const isCritical = (timelineId: string): boolean => {
    const target = records.find((entry) => entry.selectedTimeline?.id === timelineId);
    return (target?.forecastRisk ?? 0) >= 80;
  };

  const pluginRatio = (timelineId: string): number => {
    const target = records.find((entry) => entry.selectedTimeline?.id === timelineId);
    if (!target) {
      return 0;
    }
    return (target.plan.steps.length / Math.max(1, state.snapshots.length || 1)) * 100;
  };

  return {
    snapshot: {
      totalSteps: metrics.totalSteps,
      averageRisk: metrics.averageRisk,
      active: metrics.active,
      skipped: metrics.skipped,
    },
    activeTimelineLabels,
    isCritical,
    pluginRatio,
  };
}
