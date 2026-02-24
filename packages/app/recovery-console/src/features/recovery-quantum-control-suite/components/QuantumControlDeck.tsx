import { useMemo } from 'react';
import type { QuantumOutput } from '../types';

interface QuantumControlDeckProps {
  readonly output: QuantumOutput | null;
  readonly diagnostics: readonly string[];
  readonly isRunning: boolean;
  readonly className?: string;
}

type DiagnosticLine = `${string}:${string}`;
const statusClass = (status: QuantumOutput['status']) => {
  if (status === 'ok') {
    return 'good';
  }
  if (status === 'warn') {
    return 'warn';
  }
  return 'error';
};

const StageList = ({ output }: { output: QuantumOutput }) => (
  <section>
    <h3>Stage Artifacts</h3>
    <ul>
      {output.stages.map((stage) => (
        <li key={stage.stageRunId}>
          <strong>{stage.stage}</strong>
          <div>directives: {stage.directives.length}</div>
          <div>artifact keys: {Object.keys(stage.artifactPayload).join(', ') || 'none'}</div>
        </li>
      ))}
    </ul>
  </section>
);

const CommandHistogram = ({ output }: { output: QuantumOutput }) => {
  const commandGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const directive of output.directives) {
      counts.set(directive.command, (counts.get(directive.command) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [output.directives]);

  const items = commandGroups
    .map(([command, count]) => ({
      command,
      count,
      ratio: count / Math.max(output.directives.length, 1),
    }))
    .sort((left, right) => right.count - left.count);

  return (
    <section>
      <h3>Command histogram</h3>
      <ul>
        {items.map((entry) => (
          <li key={entry.command}>
            {entry.command}: {entry.count} ({Math.round(entry.ratio * 100)}%)
          </li>
        ))}
      </ul>
    </section>
  );
};

const DiagnosticList = ({ diagnostics }: { diagnostics: readonly string[] }) => {
  const lines = useMemo(() => diagnostics.map((line) => `> ${line}` as DiagnosticLine), [diagnostics]);
  return <pre>{lines.join('\n')}</pre>;
};

const DirectiveMatrix = ({ output }: { output: QuantumOutput }) => {
  const sorted = useMemo(
    () => [...output.directives].sort((left, right) => right.priority - left.priority),
    [output.directives],
  );
  return (
    <section>
      <h3>Top directives</h3>
      {sorted.length === 0 ? <p>No directives yet</p> : null}
      <ol>
        {sorted.slice(0, 12).map((directive) => (
          <li key={directive.id}>
            {directive.id} • {directive.command} • {directive.reason} • p={directive.priority}
            <pre>{JSON.stringify(directive.dependencies, null, 2)}</pre>
          </li>
        ))}
      </ol>
    </section>
  );
};

export const QuantumControlDeck = ({ output, diagnostics, isRunning, className }: QuantumControlDeckProps) => {
  if (isRunning) {
    return <p>Running suite...</p>;
  }

  if (!output) {
    return <p>No suite output yet. Start a run to populate panels.</p>;
  }

  const directiveCount = output.directives.length;
  const classes = statusClass(output.status);
  const directiveSummary = output.directives.map((entry) => `${entry.command}:${entry.priority}`).join('\n');

  return (
    <section className={`${classes} ${className ?? ''}`}>
      <h2>Suite Control Deck</h2>
      <p>Summary: {output.summary}</p>
      <p>Status: {output.status}</p>
      <p>Directive count: {directiveCount}</p>
      <p>Executed: {output.executedAt}</p>
      <p>Stage count: {output.stages.length}</p>
      <DiagnosticList diagnostics={diagnostics} />
      <StageList output={output} />
      <CommandHistogram output={output} />
      <DirectiveMatrix output={output} />
      <pre>{directiveSummary}</pre>
      <p>Seed output hash: {output.stages.at(-1)?.artifactPayload?.summary ?? 'none'}</p>
    </section>
  );
};
