import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { AutomationRunDeck } from '../components/automation/AutomationRunDeck';
import { AutomationPolicyWorkspace } from '../components/automation/AutomationPolicyWorkspace';
import { buildDeck, hydrateBlueprintFromText, makeSamplePayload } from '../services/recoveryCockpitAutomationService';
import { useRecoveryCockpitAutomation } from '../hooks/useRecoveryCockpitAutomation';
import { type DeckItem } from '../services/recoveryCockpitAutomationService';
import { type AutomationBlueprint } from '@domain/recovery-cockpit-orchestration-core';

const blankBlueprint = {
  header: {
    blueprintId: 'blueprint:blank',
    blueprintName: 'blank',
    version: 'v1',
    createdBy: 'system',
    createdAt: new Date().toISOString(),
    tags: ['blueprint:blank'],
  },
  steps: [],
  policies: {},
  pathIndex: [['header', 'blueprintId']],
  stagePaths: 'discover.compose.execute',
} as unknown as AutomationBlueprint;

const mergeDeck = (input: DeckItem[]): string => {
  return input.map((item) => `${item.pluginId}(${item.stage})`).join(',');
};

export const RecoveryCockpitAutomationDirectorPage = (): ReactElement => {
  const { setInput, run, input } = useRecoveryCockpitAutomation();
  const [blueprint, setBlueprint] = useState<AutomationBlueprint>(blankBlueprint);
  const [lastRunId, setLastRunId] = useState<string>('none');
  const [showPolicies, setShowPolicies] = useState(false);

  useEffect(() => {
    const hydrated = hydrateBlueprintFromText(input);
    if (hydrated) {
      setBlueprint(hydrated);
    }
  }, [input]);

  const deck = useMemo(() => [...buildDeck(blueprint)] as DeckItem[], [blueprint]);

  return (
    <main style={{ padding: 16, display: 'grid', gap: 12 }}>
      <h1>Automation Director</h1>
      <div>
        <button
          type="button"
          onClick={() => {
            setInput(makeSamplePayload('recovery-autopilot'));
          }}
        >
          load sample
        </button>
        <button
          type="button"
          onClick={() => {
            setShowPolicies((value) => !value);
          }}
        >
          toggle policy
        </button>
      </div>
      <pre>{mergeDeck(deck)}</pre>
        <AutomationRunDeck
          deck={deck}
        onSelect={(step) => {
          setLastRunId(String(step));
        }}
      />
      <button
        type="button"
        onClick={() => {
          void run();
        }}
      >
        execute
      </button>
      <p>last: {lastRunId}</p>
      {showPolicies && <AutomationPolicyWorkspace blueprint={blueprint} highlight={[0, 1]} onClose={() => setShowPolicies(false)} />}
      {blueprint.steps.length > 0 && <p>Policies: {Object.keys(blueprint.policies).length}</p>}
    </main>
  );
};
