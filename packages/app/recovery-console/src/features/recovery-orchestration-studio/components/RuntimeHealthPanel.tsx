import type { EngineTick } from '@service/recovery-orchestration-studio-engine';
import type { RecoveryRunbook } from '@domain/recovery-orchestration-design';
import type {
  DiagnosisPhase,
  UseRecoveryOrchestrationStudioDiagnosticsResult,
} from '../hooks/useRecoveryOrchestrationStudioDiagnostics';

interface RuntimeHealthPanelProps {
  readonly runbook?: RecoveryRunbook;
  readonly ticks: readonly EngineTick[];
  readonly diagnostics: UseRecoveryOrchestrationStudioDiagnosticsResult['summary'];
  readonly windows: UseRecoveryOrchestrationStudioDiagnosticsResult['windows'];
  readonly hotspots: UseRecoveryOrchestrationStudioDiagnosticsResult['hotspots'];
  readonly phase: DiagnosisPhase;
}

const rankSeverity = (value: number): 'ok' | 'warn' | 'critical' => {
  if (value >= 2) {
    return 'critical';
  }
  if (value >= 1) {
    return 'warn';
  }
  return 'ok';
};

const formatWindow = ({ from, to, width }: { from: number; to: number; width: number }): string =>
  `${new Date(from).toISOString()} - ${new Date(to).toISOString()} (${width}ms)`;

export const RuntimeHealthPanel = ({
  runbook,
  ticks,
  diagnostics,
  windows,
  hotspots,
  phase,
}: RuntimeHealthPanelProps) => {
  const total = ticks.length;
  const active = ticks.filter((tick) => tick.status === 'running').length;
  const finished = ticks.filter((tick) => tick.status === 'finished').length;
  const elapsed = total > 0 ? new Date(ticks[total - 1].at).getTime() - new Date(ticks[0].at).getTime() : 0;
  const severity = diagnostics ? rankSeverity(diagnostics.severity) : 'ok';

  return (
    <section>
      <h2>Runtime Health</h2>
      <p>{`phase=${phase}`}</p>
      <p>{`status=${diagnostics?.status ?? 'idle'}`}</p>
      <p>{`runbook=${runbook?.scenarioId ?? 'none'}`}</p>
      <p>{`ticks=${total} active=${active} finished=${finished}`}</p>
      <p>{`elapsedMs=${elapsed}`}</p>
      <p>{`health=${severity} projections=${diagnostics?.projectionCount ?? 0}`}</p>
      <div>
        <h3>Hotspots ({hotspots.length})</h3>
        <ul>
          {hotspots.slice(0, 8).map((node) => (
            <li key={node.id}>
              {node.id} · {node.phase} · {node.severity} · {node.status}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3>Windows</h3>
        <ul>
          {windows.length === 0 ? (
            <li>no active windows</li>
          ) : (
            windows.map((window) => (
              <li key={`${window.from}-${window.to}`}>
                {formatWindow(window)}
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
};
