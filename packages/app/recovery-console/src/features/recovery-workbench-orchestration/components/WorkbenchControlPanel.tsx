import { memo, type ReactElement } from 'react';
import type { WorkbenchControlState } from '../types';
import { RecoveryWorkbenchRoute } from '../types';

interface WorkbenchControlPanelProps {
  readonly control: WorkbenchControlState;
  readonly onRouteChange: (route: RecoveryWorkbenchRoute) => void;
  readonly onRun: () => void;
}

const routeOptions = ['route:all', 'route:ingest', 'route:transform', 'route:score', 'route:publish'] as const;
type RouteOption = (typeof routeOptions)[number];

export const WorkbenchControlPanel = memo(function WorkbenchControlPanel({
  control,
  onRouteChange,
  onRun,
}: WorkbenchControlPanelProps): ReactElement {
  const canRun = !control.loading;
  const last = control.snapshots[control.snapshots.length - 1];

  return (
    <section className="workbench-control-panel">
      <header>
        <h2>Recovery Workbench Control</h2>
        <p>{`tenant=${last.tenant}, workspace=${last.workspace}`}</p>
      </header>

      <div>
        <label htmlFor="route-select">
          Selected route
          <select
            id="route-select"
            value={control.selectedRoute}
            onChange={(event) => onRouteChange(event.currentTarget.value as RouteOption)}
          >
            {routeOptions.map((route) => (
              <option key={route} value={route}>
                {route}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <span>{`plugins: ${last.timeline.length}`}</span>
        <span>{`status: ${last.status}`}</span>
        <span>{`route count: ${control.results.length}`}</span>
      </div>

      <button type="button" onClick={onRun} disabled={!canRun}>
        {canRun ? 'Run orchestration' : 'Running...'}
      </button>
    </section>
  );
});
