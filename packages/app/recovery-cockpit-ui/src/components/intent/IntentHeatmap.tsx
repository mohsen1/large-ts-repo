import { FC } from 'react';
import { RecoveryIntent } from '@domain/recovery-cockpit-orchestration-core';
import { evaluateRisk, SimulationReport, simulateIntentRecovery } from '@domain/recovery-cockpit-orchestration-core';

export type IntentHeatmapProps = {
  intents: readonly RecoveryIntent[];
  intensityThreshold?: number;
  onInspect?: (intentId: string) => void;
};

const colorByRisk = (score: number): string => {
  if (score >= 80) return '#fee2e2';
  if (score >= 60) return '#fef3c7';
  if (score >= 40) return '#dcfce7';
  return '#e0e7ff';
};

const buildReports = (intents: readonly RecoveryIntent[]): Record<string, SimulationReport> =>
  Object.fromEntries(intents.map((intent) => [intent.intentId, simulateIntentRecovery(intent)]));

export const IntentHeatmap: FC<IntentHeatmapProps> = ({ intents, intensityThreshold = 45, onInspect }) => {
  const reports = buildReports(intents);

  return (
    <section>
      <h3>Risk Heatmap</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {intents.map((intent) => {
          const risk = evaluateRisk(intent);
          const report = reports[intent.intentId];
          const isHot = risk.compositeScore >= intensityThreshold;
          return (
            <article
              key={intent.intentId}
              style={{
                border: '1px solid #ddd',
                padding: 12,
                borderRadius: 8,
                background: colorByRisk(risk.compositeScore),
                cursor: onInspect ? 'pointer' : undefined,
                opacity: isHot ? 1 : 0.9,
              }}
              onClick={() => onInspect?.(intent.intentId)}
            >
              <h4>{intent.title}</h4>
              <p>
                {intent.intentId} · status {intent.status}
              </p>
              <p>{isHot ? '⚠ high risk' : '✓ normal'} · risk {risk.compositeScore.toFixed(1)}</p>
              <p>summary: {risk.recommendation}</p>
              <p>
                plan coverage: selected={report.selectedScenario}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
};
