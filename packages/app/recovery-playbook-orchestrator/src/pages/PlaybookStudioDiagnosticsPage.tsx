import { useMemo } from 'react';
import { usePlaybookStudioAudit } from '../hooks/usePlaybookStudioAudit';
import {
  normalizeRunId,
  normalizeTenant,
  normalizeWorkspace,
  STUDIO_SCOPE,
  type StudioTimelineEntry,
} from '../studio/contracts';

export interface PlaybookStudioDiagnosticsPageProps {
  tenantId: string;
  workspaceId: string;
  runId: string;
}

export const PlaybookStudioDiagnosticsPage = ({ tenantId, workspaceId, runId }: PlaybookStudioDiagnosticsPageProps) => {
  const audit = usePlaybookStudioAudit({
    tenantId,
    workspaceId,
    runId,
  });

  const timeline = useMemo<readonly StudioTimelineEntry[]>(() => {
    const resolvedRunId = normalizeRunId(runId);
    const baseline = {
      sequence: 0,
      stage: 'refresh',
      runId: resolvedRunId,
      tenant: normalizeTenant(tenantId),
      workspace: normalizeWorkspace(workspaceId),
      severity: 'info',
      message: 'baseline ready',
    } as const;

    return [
      baseline,
      {
        sequence: 1,
        stage: 'audit',
        runId: resolvedRunId,
        tenant: normalizeTenant(tenantId),
        workspace: normalizeWorkspace(workspaceId),
        severity: 'warning',
        message: 'audit requested',
      },
      {
        sequence: 2,
        stage: 'execute',
        runId: resolvedRunId,
        tenant: normalizeTenant(tenantId),
        workspace: normalizeWorkspace(workspaceId),
        severity: 'info',
        message: 'diagnostic data refreshed',
      },
    ];
  }, [runId, tenantId, workspaceId]);

  const summary = useMemo(() => {
    const warnings = audit.levels.warnings.length;
    const critical = audit.levels.critical.length;
    return {
      score: audit.score,
      warnings,
      critical,
      tags: audit.tags,
    };
  }, [audit.levels.critical.length, audit.levels.warnings.length, audit.score, audit.tags]);

  return (
    <main className="playbook-studio-diagnostics-page">
      <header>
        <h1>Studio Diagnostics</h1>
        <p>{runId}</p>
      </header>

      <section>
        <h2>Summary</h2>
        <dl>
          <dt>Score</dt>
          <dd>{summary.score.toFixed(2)}</dd>
          <dt>Warnings</dt>
          <dd>{summary.warnings}</dd>
          <dt>Critical</dt>
          <dd>{summary.critical}</dd>
        </dl>
      </section>

      <section>
        <h2>Scope snapshots</h2>
        <ul>
          {Object.entries(STUDIO_SCOPE).map(([scope, label]) => (
            <li key={scope}>{scope} → {label}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Audit timeline</h2>
        <button type="button" onClick={() => void audit.refresh()} disabled={audit.loading}>
          Refresh
        </button>
        <ol>
          {timeline.map((entry) => (
            <li key={`${entry.sequence}:${entry.runId}:${entry.stage}`}>
              {entry.sequence} — {entry.message}
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2>Tags</h2>
        <ul>
          {summary.tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
