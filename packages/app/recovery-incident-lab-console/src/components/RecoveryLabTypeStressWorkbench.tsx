import { type FormEvent, useState } from 'react';
import {
  BranchContext,
  BranchEvent,
  useRecoveryLabTypeStressWorkbench,
} from '../hooks/useRecoveryLabTypeStressWorkbench';

type WorkbenchTag = {
  readonly key: string;
  readonly phase: string;
  readonly severity: string;
};

const toLabel = (value: number): string => {
  if (value <= 0) {
    return 'idle';
  }
  if (value <= 3) {
    return 'low';
  }
  if (value <= 6) {
    return 'medium';
  }
  return 'high';
};

const classifyBranches = (branches: readonly string[]): string => {
  return branches
    .map((branch, index) => `${index}:${branch}`)
    .sort()
    .join(' | ');
};

const summarizeTimeline = (timeline: readonly string[]): string[] =>
  timeline
    .map((entry, index) => `#${index + 1}: ${entry}`)
    .slice(-18)
    .reverse();

export const RecoveryLabTypeStressWorkbench = () => {
  const {
    state,
    route,
    selected,
    routeCount,
    routeDiscriminator,
    branchSummary,
    dispatchMap,
    graph,
    reset,
    next,
    previous,
  } = useRecoveryLabTypeStressWorkbench();

  const [note, setNote] = useState('');
  const [mode, setMode] = useState<'active' | 'quiet'>('active');

  const tags = [...dispatchMap.entries()].map(([key, value]): WorkbenchTag => {
    const severity = key.includes('critical') ? 'critical' : key.includes('high') ? 'high' : 'medium';
    return {
      key,
      phase: value,
      severity,
    };
  });

  const branchTrace = branchSummary.branches
    .map((entry, index) => `${index + 1}. ${entry.branch}`).join('\n');
  const branches = classifyBranches(branchSummary.branches.map((entry) => entry.branch));

  const ctx: BranchContext = {
    mode: mode === 'active' ? 'strict' : 'dry-run',
    runId: `run-${selected}` as `run-${string}`,
    depth: selected,
  };

  const summaryEvents = state.branch
    .filter((entry): entry is BranchEvent => Boolean(entry))
    .map((entry) => `${entry.branch}-${entry.timestamp}`)
    .slice(0, 12);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = note.trim();
    if (!text) {
      return;
    }
    setNote(text.length > 0 ? text : '');
  };

  return (
    <section className="recovery-lab-type-stress-workbench">
      <h2>Type Stress Workbench</h2>

      <form onSubmit={onSubmit}>
        <label htmlFor="workbench-note">Annotation</label>
        <input
          id="workbench-note"
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
          placeholder="Add an annotation"
        />
        <button type="submit">Save</button>
      </form>

      <div className="workbench-toolbar">
        <button type="button" onClick={previous}>
          Previous
        </button>
        <button type="button" onClick={next}>
          Next
        </button>
        <button type="button" onClick={reset}>
          Reset
        </button>
        <button
          type="button"
          onClick={() => setMode((current) => (current === 'active' ? 'quiet' : 'active'))}
        >
          Toggle mode {mode}
        </button>
      </div>

      <p>
        Route {selected + 1}/{routeCount}: <strong>{route}</strong>
      </p>
      <p>
        Discriminator: <strong>{routeDiscriminator.opcode}</strong> · {routeDiscriminator.tenant} · {routeDiscriminator.severity} ·
        phase {routeDiscriminator.phase}
      </p>

      <h3>Routing tags</h3>
      <ul>
        {tags.slice(0, 6).map((tag) => (
          <li key={tag.key}>
            {tag.key} | {tag.phase} | {tag.severity}
          </li>
        ))}
      </ul>

      <h3>Branch diagnostics</h3>
      <p>{branches}</p>
      <pre>{branchTrace}</pre>

      <h3>Control graph</h3>
      <ul>
        {graph.map((entry) => (
          <li key={entry.key}>
            {entry.key}: {entry.projected} ({toLabel(entry.key.length)})
          </li>
        ))}
      </ul>

      <h3>Timing and context</h3>
      <p>
        mode: {ctx.mode} · runId: {ctx.runId} · depth: {ctx.depth}
      </p>

      <h3>Resolved branches</h3>
      <ul>
        {summaryEvents.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>

      <h3>Timeline</h3>
      <ol>
        {summarizeTimeline(state.timeline).map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ol>

      <h3>Route map</h3>
      <table>
        <thead>
          <tr>
            <th>Index</th>
            <th>Route</th>
            <th>Resolved</th>
          </tr>
        </thead>
        <tbody>
          {state.resolved.map((item, index) => (
            <tr key={item.id}>
              <td>{index}</td>
              <td>{item.action}/{item.entity}/{item.severity}/{item.id}</td>
              <td>{routeDiscriminator.phase}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Signature</h3>
      <pre>{JSON.stringify({ note, routeCount, selected, severity: routeDiscriminator.severity }, null, 2)}</pre>
    </section>
  );
};
