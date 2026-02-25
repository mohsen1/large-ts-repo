import { memo, useMemo } from 'react';
import { type CampaignWorkspaceRecord } from '../types';
import { mapSignalsToRows, summarizeCampaignWorkspace } from '../services/campaignAdapter';

interface RecoveryStressLabCampaignDeckProps {
  readonly workspace: CampaignWorkspaceRecord;
  readonly isRunning: boolean;
  readonly selectedCampaign: string;
  readonly onSelectCampaign: (campaignId: string) => void;
}

const signalReducer = (rows: ReturnType<typeof mapSignalsToRows>) => {
  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.id] = row.score;
    return acc;
  }, {});
};

export const RecoveryStressLabCampaignDeck = memo((props: RecoveryStressLabCampaignDeckProps) => {
  const signalRows = mapSignalsToRows(props.workspace.selectedSignals);
  const summaries = useMemo(() => signalReducer(signalRows), [signalRows]);
  const summary = summarizeCampaignWorkspace(
    props.workspace.catalogSignature,
    props.workspace.plan,
    props.workspace.simulation,
    props.workspace.selectedSignals,
  );

  return (
    <section>
      <h2>Campaign Deck</h2>
      <p>{`running: ${props.isRunning}`}</p>
      <p>{`selected: ${props.selectedCampaign}`}</p>
      <p>{`signals: ${summary.totalSignals}`}</p>
      <p>{`plan windows: ${summary.planWindows}`}</p>
      <p>{`active status: ${summary.lastCommand?.status ?? 'idle'}`}</p>

      <label>
        Campaign id
        <input
          type="text"
          value={props.selectedCampaign}
          onChange={(event) => props.onSelectCampaign(event.target.value)}
          readOnly={props.isRunning}
        />
      </label>

      <div>
        <h3>Forecast hints</h3>
        <ul>
          {summary.forecastHints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      </div>

      <div>
        <h3>Signal score map</h3>
        <ul>
          {Object.entries(summaries).map(([signalId, score]) => (
            <li key={signalId}>{`${signalId}: ${score}`}</li>
          ))}
        </ul>
      </div>

      <div>
        <h3>Signals</h3>
        <ul>
          {signalRows.map((signal) => (
            <li key={signal.id}>{`${signal.label}: ${signal.score}`}</li>
          ))}
        </ul>
      </div>

      <div>
        <h3>Phases</h3>
        <p>{props.workspace.phases.join(' -> ')}</p>
      </div>
    </section>
  );
});

RecoveryStressLabCampaignDeck.displayName = 'RecoveryStressLabCampaignDeck';
