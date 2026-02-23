import { useMemo } from 'react';
import { ReadinessRunRow } from '../../hooks/useReadinessConsole';

interface ReadinessCommandStripProps {
  runs: readonly ReadinessRunRow[];
  onBootstrap: () => void;
  onReconcile: () => void;
  onRefresh: () => void;
}

export const ReadinessCommandStrip = ({ runs, onBootstrap, onReconcile, onRefresh }: ReadinessCommandStripProps) => {
  const latestRun = useMemo(() => runs[0]?.runId ?? 'none', [runs]);
  return (
    <section className="readiness-command-strip">
      <header>
        <h2>Readiness command console</h2>
        <p>Latest run: {latestRun}</p>
      </header>
      <div className="readiness-actions">
        <button type="button" onClick={onBootstrap}>
          bootstrap
        </button>
        <button type="button" onClick={onReconcile} disabled={runs.length === 0}>
          reconcile latest
        </button>
        <button type="button" onClick={onRefresh}>
          refresh
        </button>
      </div>
      <dl>
        <dt>Runs available</dt>
        <dd>{runs.length}</dd>
        <dt>Active run risk</dt>
        <dd>{runs.length > 0 ? runs[0].riskBand : 'n/a'}</dd>
        <dt>Owner</dt>
        <dd>{runs.length > 0 ? runs[0].owner : 'unknown'}</dd>
      </dl>
    </section>
  );
};

