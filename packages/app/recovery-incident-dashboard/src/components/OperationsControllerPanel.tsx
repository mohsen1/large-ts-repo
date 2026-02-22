import { useCallback, useEffect, useMemo, useState } from 'react';
import { OperationsController } from '@service/recovery-incident-orchestrator';
import type { RecoveryIncidentRepository } from '@data/recovery-incident-store';

export interface OperationsControllerPanelProps {
  readonly repository: RecoveryIncidentRepository;
  readonly tenantId: string;
}

export interface PanelCommandState {
  readonly loading: boolean;
  readonly snapshots: number;
  readonly errors: readonly string[];
}

export const OperationsControllerPanel = ({ repository, tenantId }: OperationsControllerPanelProps) => {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [events, setEvents] = useState<readonly { readonly label: string; readonly value: string }[]>([]);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [executed, setExecuted] = useState<number>(0);
  const controller = useMemo(
    () => new OperationsController({ repository, tenantId, clock: () => new Date().toISOString() }),
    [repository, tenantId],
  );

  const pushEvent = (label: string, value: string) => {
    setEvents((current) => [...current, { label, value }].slice(-30));
  };

  const refresh = useCallback(async () => {
    setLoading(true);
    setErrors([]);
    try {
      const snapshot = await controller.loadSnapshot();
      pushEvent('snapshot', `${snapshot.counts.plans}/${snapshot.counts.runs}`);
      setMessage(`tenant=${tenantId} incidents=${snapshot.counts.incidents}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'snapshot failed';
      setErrors((current) => [...current, reason]);
      pushEvent('snapshot', `error:${reason}`);
    } finally {
      setLoading(false);
    }
  }, [controller, tenantId]);

  const runBuild = useCallback(async () => {
    setLoading(true);
    try {
      const result = await controller.buildPlaybooks();
      setExecuted(result.playbooks.length);
      pushEvent('build', `${result.artifacts.length} artifacts`);
      setMessage(`template=${result.template.title}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'build failed';
      setErrors((current) => [...current, reason]);
      pushEvent('build', `error:${reason}`);
    } finally {
      setLoading(false);
    }
  }, [controller]);

  const runExecute = useCallback(async () => {
    setLoading(true);
    try {
      const result = await controller.executeTenantProgram();
      setExecuted(result.executed);
      pushEvent('execute', `${result.executed}:${result.ok ? 'ok' : 'warn'}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'execute failed';
      setErrors((current) => [...current, reason]);
      pushEvent('execute', `error:${reason}`);
    } finally {
      setLoading(false);
    }
  }, [controller]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const state: PanelCommandState = useMemo(
    () => ({
      loading,
      snapshots: events.filter((entry) => entry.label === 'snapshot').length,
      errors: errors,
    }),
    [loading, events, errors],
  );

  return (
    <section className="operations-controller-panel">
      <header>
        <h2>Operations Controller Panel</h2>
        <p>{message || 'loading...'}</p>
      </header>
      <p>Snapshots: {state.snapshots}</p>
      <p>Executed: {executed}</p>
      <p>Errors: {state.errors.length}</p>
      <div className="controller-actions">
        <button disabled={loading} onClick={() => void refresh()}>Refresh snapshot</button>
        <button disabled={loading} onClick={() => void runBuild()}>Build playbooks</button>
        <button disabled={loading} onClick={() => void runExecute()}>Execute plans</button>
      </div>
      <ul>
        {state.errors.map((entry, index) => (
          <li key={`${entry}-${index}`} style={{ color: 'red' }}>{entry}</li>
        ))}
      </ul>
      <ol>
        {events.map((entry, index) => (
          <li key={`${entry.label}-${index}`}>{entry.label}: {entry.value}</li>
        ))}
      </ol>
    </section>
  );
};
