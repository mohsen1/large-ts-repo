import { Suspense, useMemo } from 'react';
import { ChaosLabConsolePanel } from '../components/ChaosLabConsolePanel';

type ChaosLabTab = 'preview' | 'timeline' | 'signals' | 'policy';

interface CommandCenterState {
  readonly workspace: string;
  readonly scenario: string;
  readonly tabs: readonly ChaosLabTab[];
  readonly activeTab: ChaosLabTab;
  readonly uptimeMs: number;
}

const TAB_COPY: Record<ChaosLabTab, string> = {
  preview: 'Preview',
  timeline: 'Timeline',
  signals: 'Signals',
  policy: 'Policy'
};

const toWorkspace = (tenant: string, scenario: string): string =>
  `${tenant}/${scenario}/${scenario.toLowerCase()}`;

const buildCommands = (scenario: string): readonly string[] =>
  [...scenario].map((char, index) => `${index.toString(36)}:${char}`).filter((_, index) => index % 2 === 0);

const commandTuples = (scenario: string): readonly string[] => {
  const commands = buildCommands(scenario);
  return commands.map((command, index) => `${index + 1}. ${command}`);
};

export const ChaosLabConsoleOrchestratorPage = () => {
  const state = useMemo<CommandCenterState>(() => {
    const tenant = 'tenant:studio';
    const scenario = 'Scenario:OrchestratedRecovery';
    const uptimeMs = Date.now() - Date.parse('2025-01-01T00:00:00Z');
    return {
      workspace: toWorkspace(tenant, scenario),
      scenario,
      tabs: ['preview', 'timeline', 'signals', 'policy'],
      activeTab: 'preview',
      uptimeMs
    };
  }, []);

  return (
    <section className="chaos-lab-orchestrator-page">
      <header className="chaos-lab-orchestrator-page__hero">
        <h1>Chaos Recovery Console Orchestrator</h1>
        <p>{`Workspace ${state.workspace}`}</p>
      </header>
      <nav aria-label="chaos-lab-console-tabs">
        <ul className="tab-strip">
          {state.tabs.map((tab) => (
            <li key={tab} data-active={tab === state.activeTab}>
              <button type="button">
                {TAB_COPY[tab]}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <article>
        <ChaosLabConsolePanel tenant="tenant:studio" scenario={state.scenario} />
      </article>
      <aside>
        <h3>Operational Commands</h3>
        <ol>
          {commandTuples(state.scenario).map((command) => (
            <li key={command}>{command}</li>
          ))}
        </ol>
      </aside>
      <footer>
        <Suspense fallback={<span>stabilizing ...</span>}>
          <small>{`Uptime ${Math.max(0, state.uptimeMs)}ms`}</small>
        </Suspense>
      </footer>
    </section>
  );
};
