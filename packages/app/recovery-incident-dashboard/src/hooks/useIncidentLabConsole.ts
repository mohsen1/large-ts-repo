import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LabConsoleService } from '../services/labConsoleService';
import type { LabRuntimeEvent } from '@domain/recovery-lab-console-core';

export type IncidentLabConsoleViewMode = 'idle' | 'running' | 'complete' | 'error';

export interface UseIncidentLabConsoleState {
  readonly viewMode: IncidentLabConsoleViewMode;
  readonly loading: boolean;
  readonly runId: string | null;
  readonly eventCount: number;
  readonly logs: readonly string[];
  readonly plugins: readonly string[];
  readonly errorMessage: string | null;
}

export interface UseIncidentLabConsoleReturn {
  readonly state: UseIncidentLabConsoleState;
  readonly events: readonly LabRuntimeEvent[];
  readonly run: (workspaceSignal?: string) => Promise<void>;
  readonly refresh: () => Promise<void>;
}

const buildLog = (event: LabRuntimeEvent): string => {
  switch (event.kind) {
    case 'plugin.started':
      return `${event.kind} ${event.pluginId} ${event.stage}`;
    case 'plugin.completed':
      return `${event.kind} ${event.pluginId} ${event.durationMs}ms`;
    case 'plugin.failed':
      return `${event.kind} ${event.pluginId} ${event.error}`;
    case 'run.complete':
      return `${event.kind} ${event.runId} ${event.diagnostics.trace.join(',')}`;
    default:
      return 'unknown';
  }
};

export const useIncidentLabConsole = (workspaceSignal = 'incident.default'): UseIncidentLabConsoleReturn => {
  const service = useRef(new LabConsoleService());
  const [loading, setLoading] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<readonly LabRuntimeEvent[]>([]);
  const [viewMode, setViewMode] = useState<IncidentLabConsoleViewMode>('idle');
  const workspaceRef = useRef(workspaceSignal);

  const plugins = useMemo(() => service.current.plugins, []);
  const eventLogCount = events.length;

  useEffect(() => {
    workspaceRef.current = workspaceSignal;
  }, [workspaceSignal]);

  const resolveSignal = useCallback((seed?: string): string => seed?.trim() || workspaceRef.current, [workspaceRef]);

  const run = useCallback(async (seed?: string) => {
    setLoading(true);
    setErrorMessage(null);
    setViewMode('running');
    const targetSignal = resolveSignal(seed);
    const result = await service.current.runScenario(targetSignal);
    if (!result.ok) {
      setErrorMessage(result.error.message);
      setLoading(false);
      setViewMode('error');
      return;
    }

    setRunId(result.value.runId);
    setEvents(service.current.subscribe());
    setLoading(false);
    setViewMode('complete');
  }, [workspaceSignal]);

  const refresh = useCallback(async () => {
    const snapshot = await service.current.replay(Math.max(1, eventLogCount));
    setEvents(snapshot.entries);
  }, [eventLogCount]);

  useEffect(() => {
    const interval = setInterval(() => {
      setEvents((previous) => {
        const next = service.current.subscribe();
        return previous.length === next.length ? previous : next;
      });
    }, 300);

    return () => clearInterval(interval);
  }, []);

  const state: UseIncidentLabConsoleState = {
    viewMode,
    loading,
    runId,
    eventCount: eventLogCount,
    logs: events.map(buildLog),
    plugins,
    errorMessage,
  };

  return {
    state,
    events,
    run,
    refresh,
  };
};
