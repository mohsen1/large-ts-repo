import { FC } from 'react';
import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { ForecastHeatMap } from './ForecastHeatMap';
import { DecisionResult } from '@service/recovery-cockpit-orchestrator';
import { DirectorPlan } from '@service/recovery-cockpit-orchestrator';

export type DecisionSignal = {
  readonly action: DecisionResult['signals'][number]['action'];
  readonly rationale: readonly string[];
  readonly score: number;
};

export type CommandCenterDashboardProps = {
  readonly plans: readonly RecoveryPlan[];
  readonly selectedPlanId: string;
  readonly decisions: readonly DecisionResult[];
  readonly directors: readonly DirectorPlan[];
  readonly readinessWindows: Record<string, readonly { at: Date; value: number }[]>;
  readonly onStart: (planId: string) => void;
  readonly onPause: (planId: string) => void;
  readonly onRefresh: () => void;
  readonly insightCount: number;
};

const signalTone = (signal: DecisionSignal): 'good' | 'warn' | 'bad' => {
  if (signal.score >= 75) return 'good';
  if (signal.score >= 45) return 'warn';
  return 'bad';
};

const toneColor = (tone: 'good' | 'warn' | 'bad') => {
  if (tone === 'good') return '#15803d';
  if (tone === 'warn') return '#92400e';
  return '#b91c1c';
};

const latestDecision = (decisions: readonly DecisionResult[], planId: string) =>
  decisions.find((entry) => entry.planId === planId);

export const CommandCenterDashboard: FC<CommandCenterDashboardProps> = ({
  plans,
  selectedPlanId,
  decisions,
  directors,
  readinessWindows,
  onStart,
  onPause,
  onRefresh,
  insightCount,
}) => {
  const selected = plans.find((plan) => plan.planId === selectedPlanId);
  const selectedSignals = latestDecision(decisions, selectedPlanId)?.signals ?? [];
  const director = directors.find((entry) => entry.planId === selectedPlanId);
  const selectedReadiness = readinessWindows[selectedPlanId] ?? [];

  return (
    <main style={{ display: 'grid', gap: 12 }}>
      <section style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" onClick={onRefresh}>Refresh</button>
        <button type="button" onClick={() => selected && onStart(selected.planId)} disabled={!selected}>Start selected</button>
        <button type="button" onClick={() => selected && onPause(selected.planId)} disabled={!selected}>Pause selected</button>
        <span>Insights: {insightCount}</span>
      </section>

      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8 }}>
          <h3>Plan roster</h3>
          <ul style={{ paddingLeft: 0, listStyle: 'none', margin: 0, display: 'grid', gap: 6 }}>
            {plans.map((plan) => {
              const selectedBadge = plan.planId === selectedPlanId ? 'selected' : 'open';
              return (
                <li key={plan.planId} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 8 }}>
                  <strong>{plan.labels.short}</strong>
                  <p>{plan.title}</p>
                  <small>{selectedBadge}</small>
                </li>
              );
            })}
          </ul>
        </div>

        <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8 }}>
          <h3>Decision signals</h3>
          {selectedSignals.length === 0 ? (
            <p>No signals</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 6 }}>
              {selectedSignals.map((signal, index) => {
                const tone = signalTone(signal);
                return (
                  <li key={`${signal.action}-${index}`} style={{ borderLeft: `4px solid ${toneColor(tone)}`, paddingLeft: 8 }}>
                    <strong>{signal.action}</strong>
                    <p style={{ margin: 0 }}>{signal.rationale.join(' • ')}</p>
                    <small>score={signal.score.toFixed(2)}</small>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8 }}>
        <h3>Director summary</h3>
        <p>{director ? director.capacitySummary : 'No director result'}</p>
        <p>{director ? `moves=${director.capacityMoveCount}` : ''}</p>
        <p>{director ? director.recommendations.slice(0, 4).join(' | ') : ''}</p>
      </section>

      <ForecastHeatMap plans={plans} />

      <section style={{ border: '1px solid #ddd', borderRadius: 8, padding: 8 }}>
        <h3>Readiness samples</h3>
        <ul>
          {selectedReadiness.slice(0, 5).map((window, index) => (
            <li key={`${selectedPlanId}-${index}`}>{window.value.toFixed(2)} @ {window.at.toISOString()}</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
