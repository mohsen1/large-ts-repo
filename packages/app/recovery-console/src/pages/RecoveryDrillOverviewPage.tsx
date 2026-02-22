import { useMemo } from 'react';

import { RecoveryDrillCatalogPanel } from '../components/RecoveryDrillCatalogPanel';
import { RecoveryDrillRunBoard } from '../components/RecoveryDrillRunBoard';

interface RecoveryDrillOverviewPageProps {
  readonly tenant?: string;
}

export const RecoveryDrillOverviewPage = ({ tenant = 'global' }: RecoveryDrillOverviewPageProps) => {
  const onRun = () => undefined;
  const selected = useMemo(() => ['manual'], []);

  return (
    <main className="recovery-drill-overview-page">
      <h1>Drill Command Overview</h1>
      <RecoveryDrillCatalogPanel tenant={tenant} onRunTemplate={(templateId) => onRun()} />
      <RecoveryDrillRunBoard tenant={tenant} />
      <footer>
        <p>Selected templates: {selected.length}</p>
      </footer>
    </main>
  );
};
