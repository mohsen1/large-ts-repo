import { useMemo } from 'react';
import type { ReadinessWindow } from '@service/recovery-incident-orchestrator';
import { ReadinessSeriesChart } from './ReadinessSeriesChart';

interface ReadinessOverviewProps {
  readonly windows: readonly ReadinessWindow[];
  readonly selectedTenant?: string;
  readonly onSelectTenant: (tenantId: string) => void;
}

const summarizeWindow = (window: ReadinessWindow): number => {
  const { healthy, watch, degraded, critical } = window.profile.summary;
  const total = healthy + watch + degraded + critical;
  if (total === 0) {
    return 0;
  }
  return Number(((healthy + watch) / total).toFixed(4));
}

const stateTone = (critical: number, total: number): 'good' | 'warn' | 'bad' => {
  const ratio = total === 0 ? 0 : critical / total;
  if (ratio < 0.1) {
    return 'good';
  }
  if (ratio < 0.3) {
    return 'warn';
  }
  return 'bad';
};

export const ReadinessOverview = ({ windows, selectedTenant, onSelectTenant }: ReadinessOverviewProps) => {
  const ordered = useMemo(() => [...windows].sort((left, right) => right.generatedAt.localeCompare(left.generatedAt)), [windows]);
  const bestTenant = ordered.reduce<(string | null)>((best, current) => {
    if (best === null) {
      return current.tenantId;
    }
    return summarizeWindow(current) > summarizeWindow(ordered.find((entry) => entry.tenantId === best) as ReadinessWindow)
      ? current.tenantId
      : best;
  }, null);

  return (
    <section className="readiness-overview">
      <header>
        <h2>Readiness Overview</h2>
        <p>Best tenant by readiness ratio: {bestTenant ?? 'none'}</p>
      </header>
      <ul className="readiness-rows">
        {ordered.map((window) => {
          const total = window.profile.summary.healthy + window.profile.summary.watch + window.profile.summary.degraded + window.profile.summary.critical;
          const tone = stateTone(window.profile.summary.critical, total);
          const ratio = summarizeWindow(window);
          return (
            <li
              key={window.tenantId}
              className={`readiness-row ${tone} ${selectedTenant === window.tenantId ? 'active' : ''}`}
              onClick={() => {
                onSelectTenant(window.tenantId);
              }}
            >
              <div>
                <h3>{window.tenantId}</h3>
                <small>{window.generatedAt}</small>
              </div>
              <div>
                <strong>score {Math.round(ratio * 100)}</strong>
                <p>
                  H {window.profile.summary.healthy} / W {window.profile.summary.watch} / D {window.profile.summary.degraded} / C {window.profile.summary.critical}
                </p>
                <ReadinessSeriesChart
                  label={window.tenantId}
                  criticalCount={window.profile.summary.critical}
                  healthyCount={window.profile.summary.healthy + window.profile.summary.watch}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
