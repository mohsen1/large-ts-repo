import { useMemo, useState } from 'react';
import { useStressLabDiagnostics } from '../hooks/useStressLabDiagnostics';
import { TypeLevelStressPanel } from '../components/stress-lab/TypeLevelStressPanel';
import { StressLabSolverInspector } from '../components/stress-lab/StressLabSolverInspector';
import { StressLabRouteDashboard } from '../components/stress-lab/StressLabRouteDashboard';
import { defaultSyntheticPlannerFactory, synthesizePlan } from '@domain/recovery-lab-synthetic-orchestration';
import type { StressCommand } from '@shared/type-level';
import { useRecoveryStressLab } from '../hooks/useRecoveryStressLab';

const availableCommands = [
  'discover:workload:low',
  'ingest:workload:medium',
  'reconcile:policy:high',
  'synthesize:planner:critical',
  'recover:recovery:emergency',
  'telemetry:telemetry:info',
  'dispatch:queue:low',
] as const satisfies readonly StressCommand[];

export const StressLabControlCenterPage = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedCommands, setSelectedCommands] = useState<readonly StressCommand[]>(availableCommands);
  const { runDiagnostics, quickDiagnostic, state } = useStressLabDiagnostics();
  const { state: labState } = useRecoveryStressLab();

  const plannerDraft = useMemo(
    () =>
      synthesizePlan({
        tenantId: defaultSyntheticPlannerFactory.tenantId,
        namespace: defaultSyntheticPlannerFactory.namespace,
        command: selectedCommands[activeIndex] ?? 'discover:workload:low',
        topology: labState.topology ?? {
          tenantId: defaultSyntheticPlannerFactory.tenantId,
          nodes: [],
          edges: [],
        },
      }),
    [activeIndex, labState.topology, selectedCommands],
  );

  const quickScore = useMemo(() => {
    const selected = selectedCommands[activeIndex] ?? 'discover:workload:low';
    return quickDiagnostic({
      command: selected,
      routeHints: [plannerDraft.routeProjection.parsed],
    });
  }, [quickDiagnostic, selectedCommands, activeIndex, plannerDraft.routeProjection.parsed]);

  return (
    <main className="stress-lab-control-center-page">
      <h1>Stress Lab Control Center</h1>
      <section>
        <h2>Command Switchboard</h2>
        <label>
          Active command
          <select
            value={activeIndex}
            onChange={(event) => setActiveIndex(Number(event.target.value))}
          >
            {selectedCommands.map((command, index) => (
              <option key={command} value={index}>
                {command}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            void runDiagnostics({
              command: selectedCommands[activeIndex] ?? 'discover:workload:low',
              routeHints: plannerDraft.commandGraph.slice(0, 2),
            });
          }}
        >
          Run Diagnostics
        </button>
        <p>Quick score: {quickScore}</p>
      </section>

      <section>
        <TypeLevelStressPanel
          title="Type-Level Diagnostics"
          planner={defaultSyntheticPlannerFactory}
          commands={selectedCommands}
        />
      </section>
      <section>
        <StressLabSolverInspector
          command={selectedCommands[activeIndex] ?? 'discover:workload:low'}
          route={plannerDraft.routeProjection.parsed}
        />
      </section>
      <section>
        <StressLabRouteDashboard
          commands={selectedCommands}
          namespace={plannerDraft.namespace}
          tenantId={labState.ready ? labState.topology.tenantId : defaultSyntheticPlannerFactory.tenantId}
        />
      </section>

      <pre>{JSON.stringify({ stage: state.stage, latest: state.latest, routeCount: state.routeCount }, null, 2)}</pre>
    </main>
  );
};
