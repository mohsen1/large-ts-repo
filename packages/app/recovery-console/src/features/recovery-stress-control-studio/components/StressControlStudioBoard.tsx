import { memo, useMemo } from 'react';
import type { LatticeOutput, FlowExecutionResult } from '@domain/recovery-lab-stress-lab-core';
import type { StressSection, StressControlPanelState } from '../types';

export interface StressControlStudioBoardProps {
  readonly state: StressControlPanelState;
  readonly lattice: readonly LatticeOutput[];
  readonly execution: ReadonlyArray<FlowExecutionResult>;
  readonly sections: readonly StressSection[];
  readonly onRun: () => Promise<void>;
  readonly onRefresh: () => void;
}

const SectionRow = memo(({ section }: { readonly section: StressSection }) => {
  switch (section.kind) {
    case 'summary':
      return <li>Summary score: {section.value}</li>;
    case 'warning':
      return <li>Warning: {section.reason}</li>;
    case 'error':
      return <li style={{ color: 'crimson' }}>Error code: {section.code}</li>;
    default:
      return <li>Unknown section</li>;
  }
});

const toSeverityClass = (score: number): string => {
  if (score >= 90) return 'critical';
  if (score >= 60) return 'warn';
  if (score >= 30) return 'notice';
  return 'normal';
}

export const StressControlStudioBoard = ({
  state,
  lattice,
  execution,
  sections,
  onRun,
  onRefresh,
}: StressControlStudioBoardProps) => {
  const summary = useMemo(() => {
    let totalScore = 0;
    for (const item of lattice) {
      totalScore += item.score;
    }
    return {
      total: lattice.length,
      score: totalScore,
      commandCount: execution.length,
      mode: state.mode,
      traceCount: state.refreshToken,
      severityClass: toSeverityClass(totalScore),
    };
  }, [execution.length, lattice, state.mode, state.refreshToken]);

  const filtered = execution.filter((entry) => entry.accepted || entry.trace.length > 2);
  const table = state.commands.map((command) => {
    const modeColor = command.severity > 6 ? 'high' : command.severity > 3 ? 'mid' : 'low';
    return {
      id: command.id,
      severity: command.severity,
      domain: modeColor,
      active: command.active,
    };
  });

  return (
    <main>
      <h2>Stress Control Studio</h2>
      <section>
        <h3>Run state</h3>
        <p>Run {state.runId}</p>
        <p>Mode {summary.mode}</p>
        <p>Routes {state.commands.length}</p>
        <p>Total score {summary.score}</p>
        <p>Severity class {summary.severityClass}</p>
        <button type="button" onClick={onRun} disabled={state.running}>
          {state.running ? 'Running' : 'Run'}
        </button>
        <button type="button" onClick={onRefresh}>
          Refresh
        </button>
      </section>
      <section>
        <h3>Command table</h3>
        <table>
          <thead>
            <tr>
              <th>command</th>
              <th>severity</th>
              <th>domain-class</th>
              <th>active</th>
            </tr>
          </thead>
          <tbody>
            {table.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.id}</td>
                <td>{entry.severity}</td>
                <td>{entry.domain}</td>
                <td>{entry.active ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section>
        <h3>Execution trace</h3>
        <ol>
          {filtered.slice(0, 40).map((entry) => (
            <li key={entry.commandId}>
              {entry.phase} &rarr; {entry.nextPhase ?? 'done'} {entry.trace.join(', ')}
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h3>Sections</h3>
        <ul>
          {sections.map((section, index) => (
            <SectionRow key={`${section.kind}-${index}`} section={section} />
          ))}
        </ul>
      </section>
      <section>
        <h3>Lattice</h3>
        <ul>
          {lattice.map((entry) => (
            <li key={entry.planId}>
              {entry.planId} score {entry.score} mode {entry.mode} route {entry.route}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <p>Summary total={summary.total}</p>
        <p>Accepted traces={filtered.length}</p>
      </section>
    </main>
  );
};
