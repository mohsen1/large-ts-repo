import { useMemo } from 'react';
import type { ContinuityTemplate } from '@domain/recovery-incident-workflows';

export interface ContinuityRunbookControlPanelProps {
  readonly loading: boolean;
  readonly templates: readonly ContinuityTemplate[];
  readonly onCreate: () => void;
  readonly onExecute: () => void;
  readonly onRefresh: () => void;
}

export const ContinuityRunbookControlPanel = ({
  loading,
  templates,
  onCreate,
  onExecute,
  onRefresh,
}: ContinuityRunbookControlPanelProps) => {
  const summary = useMemo(() => {
    const count = templates.length;
    const critical = templates.filter((template) => template.metadata.riskBand === 'critical').length;
    const urgent = templates.filter((template) => template.metadata.tags.includes('urgent')).length;
    return { count, critical, urgent };
  }, [templates]);

  return (
    <section>
      <h2>Continuity runbook controls</h2>
      <p>
        {summary.count} templates loaded · {summary.critical} critical · {summary.urgent} urgent
      </p>
      <div>
        <button type="button" onClick={onCreate} disabled={loading}>create template</button>
        <button type="button" onClick={onRefresh} disabled={loading}>refresh</button>
        <button type="button" onClick={onExecute} disabled={loading || templates.length === 0}>execute</button>
      </div>
    </section>
  );
};
