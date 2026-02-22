import type { CadencePlan } from '@domain/recovery-operations-models/control-plane-cadence';
import { findNearBreachStages, snapshotCadence, stageToLabel } from '@domain/recovery-operations-models/control-plane-cadence';
import { useMemo } from 'react';

interface IncidentCommandCadenceBoardProps {
  readonly plans: readonly CadencePlan[];
  readonly selectedCommandId?: string;
  readonly onSelect?: (commandId: string) => void;
}

const SeverityBadge = ({ severity }: { severity: CadencePlan['severity'] }) => {
  const tone = severity === 'critical' ? 'red' : severity === 'high' ? 'orange' : severity === 'medium' ? 'yellow' : 'green';
  return <span className={`badge-${tone}`}>{severity}</span>;
};

const StageList = ({ plan }: { plan: CadencePlan }) => {
  const stages = plan.stages.map((stage) => ({
    ...stage,
    label: stageToLabel(stage),
    atRisk: findNearBreachStages(plan).some((near) => near.stageId === stage.stageId),
  }));

  return (
    <ul>
      {stages.map((stage) => (
        <li key={stage.stageId} className={stage.atRisk ? 'at-risk' : undefined}>
          <strong>{stage.label}</strong>
          <span>{stage.owner}</span>
          <small>{stage.status}</small>
        </li>
      ))}
    </ul>
  );
};

export const IncidentCommandCadenceBoard = ({ plans, selectedCommandId, onSelect }: IncidentCommandCadenceBoardProps) => {
  const enriched = useMemo(
    () =>
      plans.map((plan) => ({
        plan,
        snapshot: snapshotCadence(plan),
        urgency: plan.stages.length,
      })),
    [plans],
  );

  return (
    <div className="incident-command-cadence-board">
      <h2>Cadence plans</h2>
      <ul>
        {enriched.map(({ plan, snapshot }) => {
          const isSelected = plan.commandId === selectedCommandId;
          return (
            <li
              key={String(plan.cadenceId)}
              className={isSelected ? 'selected' : ''}
            >
              <button
                type="button"
                onClick={() => {
                  onSelect?.(String(plan.commandId));
                }}
              >
                {plan.cadenceId}
              </button>
              <div>
                <SeverityBadge severity={snapshot.severity} />
                <span>{snapshot.status}</span>
                <span>breach={snapshot.breachRatio.toFixed(2)}</span>
                <span>stages={snapshot.stageCount}</span>
              </div>
              <StageList plan={plan} />
            </li>
          );
        })}
      </ul>
    </div>
  );
};
