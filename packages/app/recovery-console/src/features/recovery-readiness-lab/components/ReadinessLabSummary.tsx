import { useMemo } from 'react';
import type { ReadinessLabDashboardState } from '../types';

interface ReadinessLabSummaryProps {
  readonly state: ReadinessLabDashboardState;
  readonly isRunning: boolean;
  readonly pluginCount: number;
}

export const ReadinessLabSummary = ({ state, isRunning, pluginCount }: ReadinessLabSummaryProps) => {
  const totals = useMemo(() => {
    const signalEvents = state.events.flatMap((event) => event.generatedSignals);
    const uniqueSignals = new Set(signalEvents.map((entry) => entry.signalId)).size;
    const warningCount = state.events.reduce((acc, event) => acc + event.warnings.length, 0);
    return {
      signalEvents: signalEvents.length,
      uniqueSignals,
      warningCount,
      pluginCount,
      status: isRunning ? 'running' : 'idle',
    };
  }, [state.events, isRunning, pluginCount]);

  return (
    <section>
      <h3>Run Summary</h3>
      <p>{`workspace ${state.workspaceId}`}</p>
      <ul>
        <li>{`signals: ${totals.signalEvents}`}</li>
        <li>{`unique signals: ${totals.uniqueSignals}`}</li>
        <li>{`warnings: ${totals.warningCount}`}</li>
        <li>{`plugins: ${totals.pluginCount}`}</li>
        <li>{`state: ${totals.status}`}</li>
      </ul>
      <div>
        <h4>Diagnostics</h4>
        <ul>
          {state.diagnostics.map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
        </ul>
      </div>
    </section>
  );
};
