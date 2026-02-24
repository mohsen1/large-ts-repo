import { memo } from 'react';

import { asLabCommandId, asLabNodeId } from '@domain/recovery-fusion-lab-core';
import type { LabCommand } from '@domain/recovery-fusion-lab-core';
import type { FusionLabCommandAction, FusionLabPanelProps, FusionLabTopologyNode } from '../types';

type CommandSignalPair = {
  readonly command: LabCommand;
  readonly score: number;
  readonly disabled: boolean;
};

const formatActionLabel = (phase: string): string => phase.toUpperCase();

const actionForCommand = (kind: 'start' | 'verify' | 'pause' | 'resume' | 'cancel' | 'simulate'): FusionLabCommandAction =>
  kind === 'start' ? 'start' : 'validate';

export const FusionLabCommandRail = memo(function FusionLabCommandRail({
  state,
  latestSignals,
  onAction,
}: FusionLabPanelProps) {
  const commandCards = latestSignals
    .filter((signal) => signal.severity >= 1)
    .map((signal): CommandSignalPair => ({
      command: {
        id: asLabCommandId(signal.runId, `${signal.id}`),
        phase: signal.phase,
        kind: signal.severity > 3 ? 'start' : 'verify',
        runId: signal.runId,
        targetNode: asLabNodeId(signal.runId, `node-${signal.id}`),
        rationale: signal.source,
        requestedBy: 'lab-ui',
        requestedAt: signal.observedAt,
        scheduledAt: new Date().toISOString(),
      },
      score: signal.score,
      disabled: state.loading,
    }));

  const activeCommands = commandCards.filter((card) => !card.disabled);
  const fallbackNodes: readonly FusionLabTopologyNode[] = [
    { id: 'fallback', name: 'No Node', active: false, score: 0 },
  ];

  return (
    <section>
      <header>
        <h3>Command Rail</h3>
        <span>{state.mode}</span>
      </header>
      <div>
        {activeCommands.length === 0 ? (
          <p>No active commands available.</p>
        ) : (
          activeCommands.slice(0, 5).map(({ command, score, disabled }) => {
            const action = actionForCommand(command.kind);
            return (
              <button
                key={command.id}
                type="button"
                disabled={disabled}
                onClick={() => onAction(action, command)}
                title={`score ${score}`}
              >
                {formatActionLabel(command.phase)} / {command.rationale} (w: {score.toFixed(2)})
              </button>
            );
          })
        )}
      </div>
      <small>nodes: {fallbackNodes.length}</small>
    </section>
  );
});
