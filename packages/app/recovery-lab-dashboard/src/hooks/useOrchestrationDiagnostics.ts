import { useCallback, useMemo, useState } from 'react';
import {
  timelineForEnvelope,
  summarizeTimeline,
  splitTimelineByLane,
  toTimelineLines,
  type TimelineSequence,
} from '@shared/stress-lab-runtime/orchestration-timeline';
import {
  buildPlanId,
  buildWorkspaceEnvelope,
  canonicalRuntimeNamespace,
  type WorkspaceEnvelope,
  type WorkspaceConfig,
  type WorkspaceNamespace,
} from '@shared/stress-lab-runtime/advanced-lab-core';
import type { AdvancedBlueprintInput } from '../services/advancedStudioService';
import { buildBlueprintInput } from '../services/advancedTemplateService';
import { executeAdvancedPlan } from '../services/advancedStudioService';

export interface DiagnosticsState {
  readonly loading: boolean;
  readonly namespace: WorkspaceNamespace;
  readonly summary: ReturnType<typeof summarizeTimeline>;
  readonly signalLanes: readonly import('@shared/stress-lab-runtime/orchestration-timeline').TimelineMarker[];
  readonly text: string;
  readonly sequence: TimelineSequence<unknown>;
}

type RuntimeDiagnosticsConfig = WorkspaceConfig<{ readonly diagnosticsMode: 'full' }>;

const defaultNamespace = canonicalRuntimeNamespace('prod:interactive:console');

const seedConfig: RuntimeDiagnosticsConfig = {
  timeoutMs: 12_000,
  maxConcurrency: 2,
  retryWindowMs: 125,
  featureFlags: { diagnostics: true, tracing: true },
  diagnosticsMode: 'full',
};

const mergeSignals = (left: TimelineSequence<unknown>, right: TimelineSequence<unknown>): TimelineSequence<unknown> => {
  const leftFingerprint = left.map((entry) => entry.marker.at).join('|');
  const rightFingerprint = right.map((entry) => entry.marker.at).join('|');
  return [...left, ...right].filter((entry) => entry.marker.id !== `${leftFingerprint}-${rightFingerprint}`);
};

export const useOrchestrationDiagnostics = (tenantId: string) => {
  const [sequence, setSequence] = useState<TimelineSequence<unknown>>([]);
  const [loading, setLoading] = useState(false);
  const [namespace, setNamespace] = useState<WorkspaceNamespace>(defaultNamespace);
  const [error, setError] = useState<string | null>(null);

  const summary = useMemo(() => summarizeTimeline(sequence), [sequence]);
  const signalLanes = useMemo(
    () => splitTimelineByLane(sequence, 'signal').map((entry) => entry.marker),
    [sequence],
  );
  const text = useMemo(() => toTimelineLines(sequence), [sequence]);

  const runDiagnostics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const planInput: AdvancedBlueprintInput = buildBlueprintInput(tenantId, 'diagnostic', 2);
      const envelope = buildWorkspaceEnvelope(
        tenantId,
        namespace,
        buildPlanId(tenantId, namespace, 'diagnostic'),
        {},
        seedConfig,
      );
      const timeline = await timelineForEnvelope(envelope as unknown as WorkspaceEnvelope<Record<string, unknown>, Record<string, never>>);
      const diagnosticPlan = await executeAdvancedPlan(planInput);
      const all = mergeSignals(timeline, diagnosticPlan.timeline);
      setSequence(all);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setLoading(false);
    }
  }, [tenantId, namespace]);

  const clearDiagnostics = useCallback(() => {
    setSequence([]);
    setError(null);
  }, []);

  const setActiveNamespace = useCallback((target: WorkspaceNamespace) => {
    setNamespace(target);
  }, []);

  return {
    loading,
    error,
    namespace,
    summary,
    signalLanes,
    text,
    sequence,
    runDiagnostics,
    clearDiagnostics,
    setActiveNamespace,
    hasDiagnostics: summary.length > 0,
    isReady: !loading && error === null,
    toSummaryText: () => JSON.stringify({ summary, lanes: signalLanes.length, timeline: text }),
  };
};
