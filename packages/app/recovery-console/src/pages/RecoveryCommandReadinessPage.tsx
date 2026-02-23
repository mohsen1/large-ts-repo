import type { ReactElement } from 'react';
import { useMemo } from 'react';
import { CommandRiskRadar } from '../components/CommandRiskRadar';
import { CommandLanguageWorkbench } from '../components/CommandLanguageWorkbench';
import { CommandSlaTimeline } from '../components/CommandSlaTimeline';
import { useRecoveryCommandOrchestrationStudio } from '../hooks/useRecoveryCommandOrchestrationStudio';
import { InMemoryCommandStore } from '@data/recovery-command-control-plane';
import type { CommandDirective, CommandIntent } from '@domain/recovery-command-language';

const intents: CommandIntent[] = [];
const directives: CommandDirective[] = [];
const store = new InMemoryCommandStore();

export function RecoveryCommandReadinessPage(): ReactElement {
  const [state, submit] = useRecoveryCommandOrchestrationStudio({
    intentSource: async () => intents,
    directiveSource: async () => directives,
    store,
  });

  const directiveCount = useMemo(() => state.snapshot?.activeDirectives.length ?? 0, [state.snapshot?.activeDirectives]);

  return (
    <main>
      <h1>Command readiness dashboard</h1>
      <p>{`Directive count: ${directiveCount}`}</p>
      <p>{`Active window: ${state.snapshot?.windowMinutes ?? 0}m`}</p>
      <button type="button" onClick={() => void submit()}>
        Submit readiness
      </button>
      <section>
        <CommandRiskRadar snapshot={state.snapshot} decisions={state.decisions} />
      </section>
      <section>
        <CommandLanguageWorkbench snapshot={state.snapshot} directives={state.snapshot?.activeDirectives ?? []} />
      </section>
      <CommandSlaTimeline
        directives={state.snapshot?.activeDirectives ?? []}
        onInspect={(selected) => {
          console.log('inspect', selected.commandIntentId);
        }}
      />
      {state.loading ? <p>Loading...</p> : null}
      {state.error ? <p>{state.error}</p> : null}
    </main>
  );
}
