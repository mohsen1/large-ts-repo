import type { ReactElement } from 'react';
import { useEcosystemAnalytics } from '../hooks/useEcosystemAnalytics';
import { useEcosystemSignalStream } from '../hooks/useEcosystemSignalStream';

export const RecoveryEcosystemSignalsPage = (): ReactElement => {
  const analytics = useEcosystemAnalytics('tenant:runtime', 'namespace:recovery-ecosystem');
  const stream = useEcosystemSignalStream({
    tenant: 'tenant:runtime',
    namespace: 'namespace:recovery-ecosystem',
  });
  return (
    <main>
      <h1>Recovery Ecosystem Signals</h1>
      <p>{`mode=${analytics.mode}`}</p>
      <p>{`events=${stream.timeline.length}`}</p>
      <button type="button" onClick={analytics.bootstrap}>
        Bootstrap
      </button>
      <button type="button" onClick={stream.open}>
        Open stream
      </button>
    </main>
  );
};
