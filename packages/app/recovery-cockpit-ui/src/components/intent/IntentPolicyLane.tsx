import { FC, FormEvent } from 'react';
import { RecoveryIntent } from '@domain/recovery-cockpit-orchestration-core';
import { evaluateRisk, IntentTimeline, logRiskFlagged } from '@domain/recovery-cockpit-orchestration-core';

export type IntentPolicyLaneProps = {
  intents: readonly RecoveryIntent[];
  timelineByIntent: Readonly<Record<string, IntentTimeline>>;
  onApplyPolicy: (intentId: string, action: string, comment: string) => void;
};

const policyActions = ['approve', 'queue', 'throttle', 'escalate', 'reject'] as const;

type PolicyAction = (typeof policyActions)[number];

type LaneAction = {
  action: PolicyAction;
  comment: string;
};

const renderLaneSummary = (intent: RecoveryIntent, timelineByIntent: Readonly<Record<string, IntentTimeline>>): string => {
  const score = evaluateRisk(intent).compositeScore;
  const events = timelineByIntent[intent.intentId]?.events ?? [];
  const flagged = events.filter((event) => event.type === 'risk-flagged').length;
  return `${score.toFixed(1)} risk with ${events.length} events (flagged ${flagged})`;
};

const makeTimeline = (intent: RecoveryIntent): IntentTimeline => ({ intentId: intent.intentId, events: [] });

export const IntentPolicyLane: FC<IntentPolicyLaneProps> = ({ intents, timelineByIntent, onApplyPolicy }) => {
  const onSubmit = (event: FormEvent<HTMLFormElement>, intent: RecoveryIntent) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const action = formData.get('action') as PolicyAction;
    const comment = String(formData.get('comment') ?? '');
    onApplyPolicy(intent.intentId, action, comment);
    const timeline = timelineByIntent[intent.intentId] ?? makeTimeline(intent);
    const flagged = logRiskFlagged(timeline, 'policy-lane', action, 0);
    void flagged;
    event.currentTarget.reset();
  };

  return (
    <section>
      <h3>Policy Lane</h3>
      <p>Manual policy controls for staged execution windows.</p>
      <div style={{ display: 'grid', gap: 10 }}>
        {intents.map((intent) => (
          <form
            key={intent.intentId}
            style={{ border: '1px solid #f0abfc', borderRadius: 8, padding: 12, display: 'grid', gap: 8 }}
            onSubmit={(event) => onSubmit(event, intent)}
          >
            <h4>{intent.title}</h4>
            <small>{renderLaneSummary(intent, timelineByIntent)}</small>
            <select name="action" defaultValue="approve" style={{ width: 180 }}>
              {policyActions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
            <input name="comment" type="text" placeholder="operator note" required style={{ width: '100%' }} />
            <button type="submit">Apply policy</button>
          </form>
        ))}
      </div>
    </section>
  );
};
