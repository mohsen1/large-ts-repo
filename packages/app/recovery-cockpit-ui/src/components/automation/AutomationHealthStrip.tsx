import { useMemo } from 'react';
import type { AutomationRunOverview } from '../../services/recoveryCockpitAutomationService';
import type { ReactElement } from 'react';

type HealthStripProps = {
  readonly overview?: AutomationRunOverview;
  readonly onReset?: () => void;
};

const badgeClass = (state: AutomationRunOverview['state']): string => {
  if (state === 'failed') return 'red';
  if (state === 'degraded') return 'orange';
  return 'green';
};

export const AutomationHealthStrip = ({ overview, onReset }: HealthStripProps): ReactElement => {
  const badge = useMemo(() => {
    if (!overview) {
      return 'idle';
    }
    return badgeClass(overview.state);
  }, [overview]);

  return (
    <header style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 10, border: '1px solid #334', borderRadius: 8 }}>
      <strong>{overview ? overview.blueprintId : 'No run'}</strong>
      <span data-badge={badge}>state: {overview ? overview.state : 'idle'}</span>
      <span>steps: {overview?.totalSteps ?? 0}</span>
      <span>warnings: {overview?.warnings ?? 0}</span>
      <button type="button" onClick={onReset}>
        reset
      </button>
    </header>
  );
};
