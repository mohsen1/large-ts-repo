import type { ReactElement } from 'react';
import { useMemo } from 'react';
import type { CommandDirective } from '@domain/recovery-command-language';
import type { WorkspaceState } from '@data/recovery-command-control-plane';
import { classifyPriority } from '@domain/recovery-command-language';

type WorkbenchProps = {
  snapshot: WorkspaceState | null;
  directives: CommandDirective[];
};

const renderDirectiveRow = (directive: CommandDirective) => (
  <li key={`${directive.commandIntentId}-${directive.channel}-${directive.actor}`}>
    <strong>{directive.kind}</strong> → {directive.channel} by {directive.actor} / {directive.rationale}
  </li>
);

export function CommandLanguageWorkbench(props: WorkbenchProps): ReactElement {
  const { snapshot, directives } = props;
  const byIntent = useMemo(() => {
    const map = new Map<string, CommandDirective[]>();
    for (const directive of directives) {
      map.set(directive.commandIntentId, [...(map.get(directive.commandIntentId) ?? []), directive]);
    }
    return map;
  }, [directives]);

  if (!snapshot) {
    return <section>
      <h3>Command language studio</h3>
      <p>No snapshot loaded yet.</p>
    </section>;
  }

  return (
    <section>
      <h3>Command language studio</h3>
      <p>{`Window minutes: ${snapshot.windowMinutes} | Updated ${snapshot.lastRefreshedAt}`}</p>
      <ul>
        {snapshot.commandIntents.length === 0 ? (
          <li>No intents available</li>
        ) : (
          snapshot.commandIntents.map((intent) => {
            const attached = byIntent.get(intent.id) ?? [];
            const priority = classifyPriority(intent.priority);
            return (
              <li key={intent.id} style={{ marginBottom: 12 }}>
                <header>
                  <h4>{intent.label}</h4>
                  <span>{priority.toUpperCase()}</span>
                </header>
                <p>{intent.description}</p>
                <p>Owner: {intent.owner}</p>
                <p>Directives: {attached.length}</p>
                <ul>{attached.map(renderDirectiveRow)}</ul>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}
