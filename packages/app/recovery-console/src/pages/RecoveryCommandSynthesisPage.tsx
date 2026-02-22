import { useState } from 'react';
import { withBrand } from '@shared/core';
import { useRecoveryCommandOrchestration } from '../hooks/useRecoveryCommandOrchestration';
import { CommandSynthesisDashboard } from '../components/CommandSynthesisDashboard';
import { CommandDependencyMatrix } from '../components/CommandDependencyMatrix';
import type { RecoveryWorkflowInput } from '@service/recovery-fusion-orchestrator';

interface RecoveryCommandSynthesisPageProps {
  readonly tenant: string;
  readonly autoRun?: boolean;
}

export const RecoveryCommandSynthesisPage = ({ tenant, autoRun = false }: RecoveryCommandSynthesisPageProps) => {
  const orchestration = useRecoveryCommandOrchestration(tenant);
  const [tenantHint, setTenantHint] = useState(tenant);

  return (
    <article className="recovery-command-synthesis-page">
      <header>
        <h1>Recovery command synthesis</h1>
        <input
          type="text"
          value={tenantHint}
          onChange={(event) => setTenantHint(event.target.value)}
          placeholder="tenant"
        />
        <button type="button" onClick={orchestration.buildGraph} disabled={orchestration.running}>
          Build new graph
        </button>
      </header>
      <section>
        <CommandSynthesisDashboard
          plan={orchestration.plan}
          result={orchestration.result}
          running={orchestration.running}
          onReplay={() =>
            void orchestration.replay().catch((error: unknown) => {
              console.error(error);
            })
          }
          onReset={orchestration.clear}
        />
        <CommandDependencyMatrix
          graphId={orchestration.state.activeGraphId ?? withBrand('unknown', 'CommandGraphId')}
          result={orchestration.result}
          criticalPaths={orchestration.result?.criticalPaths ?? []}
        />
      </section>
      <section>
        <button
          type="button"
          onClick={() => {
            const input: Omit<RecoveryWorkflowInput, 'graph'> = {
              runId: withBrand(`${tenantHint}:run`, 'RecoveryRunId'),
              operator: tenantHint,
              tenant: tenantHint,
            };
            void orchestration.run(input);
          }}
          disabled={orchestration.running || !orchestration.plan}
        >
          Run synthesis engine
        </button>
        <button
          type="button"
          onClick={() => {
            orchestration.clear();
          }}
          disabled={orchestration.running}
        >
          Clear state
        </button>
      </section>
      <section>
        <h3>Event log</h3>
        <ul>
          {orchestration.log.map((entry, index) => (
            <li key={`${entry}-${index}`}>{entry}</li>
          ))}
        </ul>
      </section>
      <p>Status: ready={orchestration.state.readyCount}, blocked={orchestration.state.blockedCount}</p>
      <p>Run: {orchestration.state.runId}</p>
      <p>Error: {orchestration.error ?? 'none'}</p>
      <p>Auto-run: {autoRun ? 'enabled' : 'disabled'}</p>
    </article>
  );
};
