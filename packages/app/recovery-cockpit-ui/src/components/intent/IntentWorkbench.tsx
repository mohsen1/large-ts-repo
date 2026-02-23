import { FC } from 'react';
import { RecoveryIntent } from '@domain/recovery-cockpit-orchestration-core';
import { estimateUrgencyScore, evaluateRisk, simulateIntentRecovery, pickBestScenario } from '@domain/recovery-cockpit-orchestration-core';

export type IntentWorkbenchProps = {
  intents: readonly RecoveryIntent[];
  selectedId: string;
  onSelect: (intentId: string) => void;
  onPromote: (intentId: string) => void;
  onFinish: (intentId: string) => void;
  onAbort: (intentId: string) => void;
};

const styles = {
  panel: {
    border: '1px solid #4f46e5',
    borderRadius: 8,
    padding: 12,
    display: 'grid',
    gap: 8,
  } as const,
  selected: {
    background: 'rgba(79,70,229,0.12)',
  } as const,
  button: {
    marginRight: 8,
    padding: '4px 8px',
  } as const,
};

export const IntentWorkbench: FC<IntentWorkbenchProps> = ({ intents, selectedId, onSelect, onPromote, onFinish, onAbort }) => {
  return (
    <section style={styles.panel}>
      <h3>Intent Workbench</h3>
      <p>Operational intent orchestration workspace with risk and simulation previews.</p>
      {intents.map((intent) => {
        const risk = evaluateRisk(intent);
        const simulation = simulateIntentRecovery(intent);
        const best = pickBestScenario(simulation);

        return (
          <article key={intent.intentId} style={intent.intentId === selectedId ? styles.selected : undefined}>
            <h4>{intent.title}</h4>
            <p>
              {intent.scope}/{intent.zone} · mode {intent.mode} · steps {intent.steps.length} · urgency {estimateUrgencyScore(intent)}
            </p>
            <p>
              risk {risk.compositeScore.toFixed(1)} ({risk.recommendation}) · confidence {risk.vector.confidence.toFixed(2)}
            </p>
            <p>
              best={best.recommendation} projection={best.projectedMinutes}m
            </p>
            <button type="button" style={styles.button} onClick={() => onSelect(intent.intentId)}>
              Select
            </button>
            <button type="button" style={styles.button} onClick={() => onPromote(intent.intentId)}>
              Promote
            </button>
            <button type="button" style={styles.button} onClick={() => onFinish(intent.intentId)}>
              Mark Completed
            </button>
            <button type="button" style={styles.button} onClick={() => onAbort(intent.intentId)}>
              Abort
            </button>
          </article>
        );
      })}
    </section>
  );
};
