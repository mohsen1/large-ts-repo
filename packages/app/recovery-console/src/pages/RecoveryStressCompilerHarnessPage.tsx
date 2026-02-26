import { type ReactElement, useMemo, useState } from 'react';
import { StressTypeOpsWorkbench } from '../components/StressTypeOpsWorkbench';
import { StressRouteAuditLog } from '../components/StressRouteAuditLog';
import { recoveryRouteTemplates, type RecoveryRouteTemplate } from '../services/recoveryStressAdapter';

interface Props {
  readonly tenant: string;
}

const routeHints = recoveryRouteTemplates.reduce<{
  critical: RecoveryRouteTemplate[];
  high: RecoveryRouteTemplate[];
  low: RecoveryRouteTemplate[];
}>(
  (acc, template, index): {
    critical: RecoveryRouteTemplate[];
    high: RecoveryRouteTemplate[];
    low: RecoveryRouteTemplate[];
  } => {
    if (index % 3 === 0) {
      acc.critical.push(template);
    } else if (index % 3 === 1) {
      acc.high.push(template);
    } else {
      acc.low.push(template);
    }
    return acc;
  },
  { critical: [], high: [], low: [] },
);

export const RecoveryStressCompilerHarnessPage = ({ tenant }: Props): ReactElement => {
  const [selected, setSelected] = useState<RecoveryRouteTemplate | undefined>(undefined);

  const labelMap = useMemo(() => {
    const output = new Map<string, string>();
    output.set('critical', `critical:${routeHints.critical.length}`);
    output.set('high', `high:${routeHints.high.length}`);
    output.set('low', `low:${routeHints.low.length}`);
    return output;
  }, []);

  return (
    <main className="recovery-stress-compilation-page">
      <header>
        <h1>Recovery compiler harness</h1>
        <p>Tenant: {tenant}</p>
        <p>
          Total routes: {recoveryRouteTemplates.length} | Critical: {labelMap.get('critical')} | High: {labelMap.get('high')} |
          Low: {labelMap.get('low')}
        </p>
      </header>
      <StressTypeOpsWorkbench tenant={tenant} />
      <StressRouteAuditLog tenant={tenant} selectedTemplate={selected} onSelect={setSelected} />
      <section className="route-legend">
        <h2>Route buckets</h2>
        <ul>
          <li>Critical: {routeHints.critical.join(', ')}</li>
          <li>High: {routeHints.high.join(', ')}</li>
          <li>Low: {routeHints.low.join(', ')}</li>
        </ul>
      </section>
    </main>
  );
};
