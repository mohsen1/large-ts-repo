import { useCallback, useEffect, useState } from 'react';
import { InMemoryPolicyStore, summarizeStoreMetrics, PolicyStoreArtifact } from '@data/policy-orchestration-store';
import { PolicyLabOrchestrator, PolicyPolicyArtifact } from '@service/policy-orchestration-engine/lab-orchestrator';
import { collectStoreEvents, collectStoreTelemetry } from '@data/policy-orchestration-store/stream-analytics';

export interface PolicyLabWorkspaceArtifactLine {
  id: string;
  title: string;
  value: number;
}

export interface PolicyLabWorkspaceState {
  orchestratorId: string;
  templates: readonly string[];
  selectedTemplates: readonly string[];
  runMode: 'dry' | 'live';
  isLoading: boolean;
  error: string | null;
  metrics: readonly PolicyLabWorkspaceArtifactLine[];
  telemetry: readonly PolicyPolicyArtifact[];
  events: readonly string[];
}

export interface UsePolicyLabWorkspaceResult {
  state: PolicyLabWorkspaceState;
  refresh: () => Promise<void>;
  toggleTemplate: (templateId: string) => void;
  clearSelection: () => void;
  runSelected: (dryRun: boolean) => Promise<void>;
  selectAll: () => void;
  setSearch: (query: string) => void;
}

const DEFAULT_ORCHESTRATOR = 'policy-lab-console-orchestrator';

const toMetricLines = (record: Record<string, number>): readonly PolicyLabWorkspaceArtifactLine[] =>
  Object.entries(record).map(([title, value]) => ({ id: title, title, value }));

export function usePolicyLabWorkspace(): UsePolicyLabWorkspaceResult {
  const [store] = useState(() => new InMemoryPolicyStore());
  const [search, setSearch] = useState('');
  const [templates, setTemplates] = useState<readonly string[]>([]);
  const [selection, setSelection] = useState<readonly string[]>([]);
  const [mode, setMode] = useState<'dry' | 'live'>('dry');
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<readonly PolicyLabWorkspaceArtifactLine[]>([]);
  const [telemetry, setTelemetry] = useState<readonly PolicyPolicyArtifact[]>([]);
  const [events, setEvents] = useState<readonly string[]>([]);
  const orchestrator = useState(() => new PolicyLabOrchestrator(store, DEFAULT_ORCHESTRATOR))[0];

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const summaries = await orchestrator.listTemplateSummaries(search);
      const list = summaries.map((entry) => String(entry.template.id));
      const artifactPayload = await store.searchArtifacts({ orchestratorId: DEFAULT_ORCHESTRATOR }, { key: 'updatedAt', order: 'desc' });
      const metricPayload = summarizeStoreMetrics(artifactPayload as PolicyStoreArtifact[], await store.searchRuns(DEFAULT_ORCHESTRATOR));
      const telemetryFrame = await collectStoreTelemetry(store, DEFAULT_ORCHESTRATOR);
      const entries: string[] = [];

      for await (const event of collectStoreEvents(store, { orchestratorId: DEFAULT_ORCHESTRATOR })) {
        entries.push(`${event.at}:${event.status}`);
      }

      setTemplates(list);
      setMetrics(toMetricLines(
        Object.fromEntries(metricPayload.map((entry) => [entry.id, entry.value])),
      ));
      setTelemetry(telemetryFrame.hotspots.map((entry) => ({ title: entry, value: entry.length })));
      setEvents(entries);
      setSelection((current) => current.filter((candidate) => list.includes(candidate)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'refresh failed');
    } finally {
      setLoading(false);
    }
  }, [store, search, orchestrator]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runSelected = useCallback(
    async (dryRun: boolean) => {
      setMode(dryRun ? 'dry' : 'live');
      setLoading(true);
      try {
        await orchestrator.executeScenarioBatch([...selection], dryRun, 'policy-console');
        await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'run failed');
      } finally {
        setLoading(false);
      }
    },
    [refresh, selection, orchestrator],
  );

  const toggleTemplate = useCallback((templateId: string) => {
    setSelection((current) =>
      current.includes(templateId) ? current.filter((entry) => entry !== templateId) : [...current, templateId],
    );
  }, []);

  const clearSelection = useCallback(() => {
    setSelection([]);
  }, []);

  const selectAll = useCallback(() => {
    setSelection(templates);
  }, [templates]);

  return {
    state: {
      orchestratorId: DEFAULT_ORCHESTRATOR,
      templates,
      selectedTemplates: selection,
      runMode: mode,
      isLoading,
      error,
      metrics,
      telemetry,
      events,
    },
    refresh,
    toggleTemplate,
    clearSelection,
    runSelected,
    selectAll,
    setSearch,
  };
}
