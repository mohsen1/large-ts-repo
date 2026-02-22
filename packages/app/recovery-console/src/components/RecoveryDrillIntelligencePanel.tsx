import { useMemo } from 'react';

import { useRecoveryDrillIntelligence } from '../hooks/useRecoveryDrillIntelligence';
import type { DrillTemplate } from '@domain/recovery-drill/src';

interface RecoveryDrillIntelligencePanelProps {
  readonly tenantId: string;
  readonly templates: readonly DrillTemplate[];
}

export const RecoveryDrillIntelligencePanel = ({ tenantId, templates }: RecoveryDrillIntelligencePanelProps) => {
  const { reports, selectedMode, setMode, trends, bucketCount } = useRecoveryDrillIntelligence({
    tenantId,
    templates,
    compareTemplates: templates,
  });

  const criticalTrendCount = useMemo(
    () => trends.filter((trend) => trend.delta > 0).length,
    [trends],
  );

  return (
    <section>
      <h2>Recovery Drill Intelligence</h2>
      <p>Mode: {selectedMode}</p>
      <button type="button" onClick={() => setMode('game-day')}>
        Simulate in-game mode
      </button>
      <p>Total buckets: {bucketCount}</p>
      <p>Critical trend count: {criticalTrendCount}</p>
      <ul>
        {reports.map((report) => (
          <li key={report.tenantId}>
            {report.mode} · {report.totalTemplates} templates
          </li>
        ))}
      </ul>
    </section>
  );
};
