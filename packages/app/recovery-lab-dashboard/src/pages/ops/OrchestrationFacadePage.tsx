import { useMemo } from 'react';
import { RuntimeContractTopology } from '../../components/orchestration/RuntimeContractTopology';
import { PolicyWindowTimeline } from '../../components/orchestration/PolicyWindowTimeline';
import { useOrchestrationFacadeModel, type RuntimeSignal } from '../../hooks/useOrchestrationFacadeModel';

type DraftRow = {
  readonly id: string;
  readonly score: number;
  readonly owner: string;
};

export const OrchestrationFacadePage = () => {
  const {
    state,
    selectedPlanLabel,
    pushContract,
    pushTimeline,
    pushWindow,
    signalCoverage,
    diagnostics,
    heartbeat,
  } = useOrchestrationFacadeModel('global');

  const contracts = useMemo<readonly { readonly id: string; readonly owner: string; readonly score: number; readonly signal: RuntimeSignal }[]>(
    () =>
      state.contracts.map((entry) => ({
        id: entry.name,
        owner: entry.owner,
        score: entry.score,
        signal: signalCoverage.warning > 0 && signalCoverage.critical === 0
          ? ('warning' satisfies RuntimeSignal)
          : signalCoverage.critical > 0
            ? ('critical' satisfies RuntimeSignal)
          : ('signal' satisfies RuntimeSignal),
      })),
    [state.contracts, signalCoverage.warning, signalCoverage.signal, signalCoverage.critical],
  );

  const links = useMemo(
    () =>
      contracts.slice(0, -1).map((contract, index): { readonly from: string; readonly to: string; readonly phase: 'observe' | 'stabilize' | 'validate' } => ({
        from: contract.id,
        to: contracts[index + 1]?.id ?? contract.id,
        phase: index % 3 === 0 ? 'observe' : index % 3 === 1 ? 'stabilize' : 'validate',
      })),
    [contracts],
  );

  const windows = useMemo(
    () =>
      state.windows.map((window): { readonly token: string; readonly phase: 'transform'; readonly status: 'queued' | 'active' | 'resolved'; readonly score: number } => ({
        token: `${window.id}:${window.label}`,
        phase: 'transform' as const,
        status: window.status === 'running' ? 'active' : window.status === 'succeeded' ? 'resolved' : 'queued',
        score: window.score,
      })),
    [state.windows],
  );

  const planRows = useMemo<DraftRow[]>(
    () =>
      state.windows
        .filter((entry) => entry.output)
        .map((entry) => ({
          id: entry.id,
          score: entry.score,
          owner: entry.output ? 'system' : 'operator',
        })),
    [state.windows],
  );

  const selected = diagnostics[0] ?? 'not-initialized';

  return (
    <div style={{ padding: 20, display: 'grid', gap: 16 }}>
      <header>
        <h1>Recovery facade cockpit</h1>
        <p>tenant-plan: {selectedPlanLabel}</p>
        <p>heartbeat: {heartbeat}</p>
      </header>
      <button
        type="button"
        onClick={() => {
          pushTimeline('seed-load', { selectedPlanLabel, count: state.windows.length });
          pushWindow({ id: `runtime-${heartbeat}`, label: selectedPlanLabel, status: 'running', score: (heartbeat % 100) / 100, output: {} });
          pushContract({ name: `contract-${heartbeat}`, status: 'running', owner: 'orchestrator', score: 0.75, payload: { id: heartbeat } as const });
        }}
      >
        Add synthetic event
      </button>
      <RuntimeContractTopology
        nodes={contracts}
        links={links}
        onSelect={(nodeId: string) => {
          pushTimeline(`selected:${nodeId}`, { nodeId, now: new Date().toISOString() });
        }}
      />
      <PolicyWindowTimeline gates={windows} windowId={selectedPlanLabel} />
      <section style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: 12 }}>
        <h2>Diagnostics</h2>
        <p>{selected}</p>
        <ul>
          {planRows.map((row) => (
            <li key={row.id}>
              {row.id} owner={row.owner} score={row.score.toFixed(2)}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
};
