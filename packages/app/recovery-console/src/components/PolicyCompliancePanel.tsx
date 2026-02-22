import { useMemo } from 'react';
import type { PolicyTimeline } from '@service/recovery-operations-policy-engine';

interface PolicyCompliancePanelProps {
  readonly timeline: readonly PolicyTimeline[];
  readonly onClear: () => void;
}

interface ComplianceGroup {
  readonly tenant: string;
  readonly runCount: number;
  readonly lastDecision: string;
  readonly okCount: number;
  readonly warnCount: number;
}

const summarizeCompliance = (timeline: PolicyTimeline): ComplianceGroup => {
  const statusByRun = timeline.points.map((point) => point.status);
  return {
    tenant: timeline.tenant,
    runCount: timeline.points.length,
    lastDecision: statusByRun[statusByRun.length - 1] ?? 'warn',
    okCount: statusByRun.filter((status) => status === 'ok').length,
    warnCount: statusByRun.filter((status) => status === 'warn').length,
  };
};

export const PolicyCompliancePanel = ({ timeline, onClear }: PolicyCompliancePanelProps) => {
  const groups = useMemo(() => timeline.map(summarizeCompliance), [timeline]);

  const summaryText = useMemo(() => {
    const totals = groups.reduce(
      (acc, group) => {
        return {
          runs: acc.runs + group.runCount,
          ok: acc.ok + group.okCount,
          warn: acc.warn + group.warnCount,
        };
      },
      { runs: 0, ok: 0, warn: 0 },
    );

    return `${totals.ok}/${totals.runs} ok, ${totals.warn} warnings`;
  }, [groups]);

  return (
    <section className="policy-compliance-panel">
      <header>
        <h3>Compliance compliance panel</h3>
        <button type="button" onClick={onClear}>
          Clear compliance
        </button>
      </header>
      <p>{summaryText}</p>
      {groups.length === 0 ? (
        <p>No compliance groups yet.</p>
      ) : (
        groups.map((group) => (
          <article key={group.tenant} className="compliance-row">
            <h4>{group.tenant}</h4>
            <p>steps: {group.runCount}</p>
            <p>ok: {group.okCount}</p>
            <p>warn: {group.warnCount}</p>
            <p>lastDecision: {group.lastDecision}</p>
          </article>
        ))
      )}
    </section>
  );
};
