import { useMemo, useState } from 'react';
import { useCoordinationCommandCenter } from '../../hooks/coordination/useCoordinationCommandCenter';
import { CoordinationSignalsPanel } from '../../components/coordination/CoordinationSignalsPanel';

export const RecoveryCoordinationOperationsPage = () => {
  const { latestReport, commandInputs, launch, cancel, selection, state } = useCoordinationCommandCenter({
    tenant: 'ops',
    programId: 'coord-ops',
  });
  const [expanded, setExpanded] = useState(false);

  const planSummary = useMemo(() => {
    const blocked = latestReport?.selection.blockedConstraints.length ?? 0;
    return {
      total: commandInputs.length,
      blocked,
      hasSignals: blocked > 0,
      decision: latestReport?.selection.decision ?? 'none',
    };
  }, [commandInputs.length, latestReport]);

  return (
    <main>
      <header>
        <h1>Coordination Operations</h1>
        <p>{`commands ${planSummary.total} blocked ${planSummary.blocked}`}</p>
      </header>
      <div style={{ display: 'flex', gap: '1rem' }}>
        <button disabled={state.isBusy || !state.canExecute} onClick={() => { void launch(); }}>
          Launch coordination
        </button>
        <button disabled={!state.canCancel} onClick={() => { void cancel(`${state.tenant}-command`); }}>
          Cancel active
        </button>
        <button onClick={() => setExpanded((current) => !current)}>
          {expanded ? 'Hide details' : 'Show details'}
        </button>
      </div>
      <p>
        latestDecision={latestReport?.selection.decision ?? 'none'}
        latestTenant={latestReport?.tenant ?? 'none'}
      </p>
      <p>
        hasSelection={Boolean(selection)} hasSignals={planSummary.hasSignals ? 'yes' : 'no'}
      </p>
      {selection ? (
        <section style={{ display: expanded ? 'block' : 'none' }}>
          <CoordinationSignalsPanel
            report={latestReport}
            selectedSignals={latestReport?.selection.blockedConstraints ?? []}
          />
        </section>
      ) : null}
    </main>
  );
};
