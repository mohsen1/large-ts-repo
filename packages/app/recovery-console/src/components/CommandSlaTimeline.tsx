import type { ReactElement } from 'react';
import { useCallback } from 'react';
import type { CommandDirective } from '@domain/recovery-command-language';

type CommandSlaTimelineProps = {
  directives: CommandDirective[];
  onInspect: (directive: CommandDirective) => void;
};

export function CommandSlaTimeline({ directives, onInspect }: CommandSlaTimelineProps): ReactElement {
  const ordered = directives.slice().sort((left, right) => {
    const leftTime = new Date(left.lifecycle.initiatedAt).getTime();
    const rightTime = new Date(right.lifecycle.initiatedAt).getTime();
    return leftTime - rightTime;
  });

  const renderTime = useCallback((value?: string) => {
    if (!value) {
      return 'pending';
    }
    return new Date(value).toLocaleTimeString();
  }, []);

  return (
    <section>
      <h3>Directive SLA timeline</h3>
      <ul>
        {ordered.map((directive) => {
          const slaWindow =
            directive.payload && typeof directive.payload === 'object' && 'slaWindowMinutes' in directive.payload
              ? directive.payload.slaWindowMinutes
              : 'n/a';

          return (
            <li key={`${directive.commandIntentId}-${directive.kind}`}>
              <button
                type="button"
                onClick={() => onInspect(directive)}
                style={{ marginRight: 12 }}
              >
                inspect
              </button>
              <strong>{directive.kind}</strong>
              <span>{` | ${directive.actor}`}</span>
              <span>{` | ${directive.lifecycle && renderTime(directive.lifecycle.executedAt)}`}</span>
              <em>{`SLA window ${String(slaWindow)}m`}</em>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
