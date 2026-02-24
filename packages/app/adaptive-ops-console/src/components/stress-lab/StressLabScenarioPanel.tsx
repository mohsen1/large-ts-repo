import { useMemo } from 'react';
import {
  type OrchestratorReport,
} from '@domain/recovery-stress-lab';

interface ScenarioPanelProps {
  readonly report: OrchestratorReport | null;
  readonly compact?: boolean;
  readonly maxWarnings?: number;
}

interface ScenarioSummary {
  readonly label: string;
  readonly value: string;
}

type BadgeTone = 'good' | 'warn' | 'bad';

const severityTone = (count: number): BadgeTone => {
  if (count === 0) return 'good';
  if (count < 3) return 'warn';
  return 'bad';
};

const summarize = (report: OrchestratorReport | null): readonly ScenarioSummary[] => {
  if (!report) {
    return [
      { label: 'Session', value: 'not run' },
      { label: 'Warnings', value: '0' },
      { label: 'Recommendations', value: '0' },
      { label: 'Steps', value: '0' },
    ];
  }

  return [
    { label: 'Session', value: report.sessionId },
    { label: 'Warnings', value: String(report.warnings.length) },
    { label: 'Recommendations', value: String(report.recs.length) },
    { label: 'Steps', value: String(report.stepCount) },
  ];
};

const Badge = ({ tone, value, label }: { readonly tone: BadgeTone; readonly value: string; readonly label: string }) => {
  const color = tone === 'good' ? 'green' : tone === 'warn' ? 'orange' : 'red';
  return (
    <span style={{ color }}>
      {label}: {value}
    </span>
  );
};

export const StressLabScenarioPanel = ({ report, compact = false, maxWarnings = 8 }: ScenarioPanelProps) => {
  const rows = useMemo(() => summarize(report), [report]);
  const warningTone = severityTone(report?.warnings.length ?? 0);
  const warningRows = useMemo(
    () => (report?.warnings ?? []).toSorted((left, right) => right.localeCompare(left)).slice(0, maxWarnings),
    [report?.warnings, maxWarnings],
  );

  if (compact) {
    return (
      <section className="stress-lab-scenario-compact">
        <h4>Scenario snapshot</h4>
        <div>
          {rows.map((row) => (
            <Badge key={row.label} label={row.label} value={row.value} tone={row.label === 'Warnings' ? warningTone : 'good'} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="stress-lab-scenario">
      <h3>Scenario analysis</h3>
      <div>
        {rows.map((row) => (
          <Badge
            key={row.label}
            label={row.label}
            value={row.value}
            tone={row.label === 'Warnings' ? warningTone : 'good'}
          />
        ))}
      </div>

      {report ? (
        <div>
          <h4>Warnings</h4>
          <ul>
            {warningRows.length === 0 ? <li>none</li> : null}
            {warningRows.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
          <h4>Phase labels</h4>
          <ul>
            {report.telemetry.phaseLabels.map((phase) => (
              <li key={phase}>{phase}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};
