import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import type { MeshSignal, MeshIntent, MeshEvent } from '@domain/recovery-cockpit-signal-mesh';

export interface SignalMeshCommandConsoleProps {
  readonly signal: MeshSignal;
  readonly command: string;
  readonly intents: readonly MeshIntent[];
  readonly events: readonly MeshEvent[];
  readonly onCommand: (command: string) => void;
}

export function SignalMeshCommandConsole({
  signal,
  command,
  intents,
  events,
  onCommand,
}: SignalMeshCommandConsoleProps): ReactElement {
  const [draft, setDraft] = useState(command);
  const intentNames = useMemo(
    () => intents.map((intent) => intent.id).sort((left, right) => left.localeCompare(right)),
    [intents],
  );
  const latestEvents = useMemo(() => events.slice(-5), [events]);

  return (
    <section>
      <h3>Command Console</h3>
      <label>
        Signal
        <input readOnly value={signal.id as string} />
      </label>
      <label>
        Command
        <input value={draft} onChange={(event) => setDraft(event.target.value)} />
      </label>
      <button type="button" onClick={() => onCommand(draft)}>
        Dispatch
      </button>
      <div>
        <strong>Top Intents</strong>
        <ul>
          {intentNames.map((intentId) => (
            <li key={intentId}>{intentId}</li>
          ))}
        </ul>
      </div>
      <div>
        <strong>Recent Events</strong>
        <ul>
          {latestEvents.map((item) => (
            <li key={item.eventId}>
              {item.name}:{item.at}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
