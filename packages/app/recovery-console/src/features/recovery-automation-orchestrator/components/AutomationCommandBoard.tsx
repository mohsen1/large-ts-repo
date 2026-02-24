import { useMemo } from 'react';
import type { AutomationDashboardCommand } from '../types';

interface AutomationCommandBoardProps {
  readonly commands: readonly AutomationDashboardCommand[];
  readonly onToggle: (command: AutomationDashboardCommand) => void;
  readonly onRun: (command: AutomationDashboardCommand) => void;
}

const commandRows = (
  commands: readonly AutomationDashboardCommand[],
  onToggle: (command: AutomationDashboardCommand) => void,
  onRun: (command: AutomationDashboardCommand) => void,
) =>
  commands.map((command) => {
    const colorClass = command.priority === 'critical' ? 'critical' : command.priority === 'high' ? 'high' : 'standard';
    return (
      <li key={command.id} className={`automation-command-row ${colorClass}`}>
        <article>
          <header>
            <h3>{command.title}</h3>
            <span>{command.stage}</span>
          </header>
          <p>Priority {command.priority}</p>
          <p>Tenant {command.tenant}</p>
          <footer>
            <button type="button" onClick={() => onToggle(command)}>
              {command.enabled ? 'Disable' : 'Enable'}
            </button>
            <button type="button" onClick={() => onRun(command)}>
              Run command
            </button>
          </footer>
        </article>
      </li>
    );
  });

export const AutomationCommandBoard = ({ commands, onToggle, onRun }: AutomationCommandBoardProps) => {
  const enabled = useMemo(() => commands.filter((command) => command.enabled).length, [commands]);
  const blocked = useMemo(() => commands.length - enabled, [commands, enabled]);

  return (
    <section className="automation-command-board">
      <header>
        <h2>Automation Command Board</h2>
        <p>
          {enabled} enabled / {blocked} blocked
        </p>
      </header>
      <ul>{commandRows(commands, onToggle, onRun)}</ul>
      <article className="automation-command-summary">
        <h3>Command mix</h3>
        <p>Critical: {commands.filter((command) => command.priority === 'critical').length}</p>
        <p>High: {commands.filter((command) => command.priority === 'high').length}</p>
        <p>Medium: {commands.filter((command) => command.priority === 'medium').length}</p>
        <p>Low: {commands.filter((command) => command.priority === 'low').length}</p>
      </article>
    </section>
  );
};
