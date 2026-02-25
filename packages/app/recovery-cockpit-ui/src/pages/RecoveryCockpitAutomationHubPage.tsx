import { useState } from 'react';
import type { ReactElement } from 'react';
import { AutomationHealthStrip } from '../components/automation/AutomationHealthStrip';
import { AutomationPolicyWorkspace } from '../components/automation/AutomationPolicyWorkspace';
import { AutomationRunDeck } from '../components/automation/AutomationRunDeck';
import { AutomationTopologyViewer } from '../components/automation/AutomationTopologyViewer';
import { useRecoveryCockpitAutomation } from '../hooks/useRecoveryCockpitAutomation';
import { hydrateBlueprintFromText } from '../services/recoveryCockpitAutomationService';
import { useMemo } from 'react';
import type { AutomationBlueprint } from '@domain/recovery-cockpit-orchestration-core';

export const RecoveryCockpitAutomationHubPage = (): ReactElement => {
  const { loading, error, overview, deck, input, setInput, setMode, resetInput, run, deckCount, mode } =
    useRecoveryCockpitAutomation();
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [highlight, setHighlight] = useState<readonly number[]>([]);

  const blueprint = useMemo(() => hydrateBlueprintFromText(input), [input]);
  const selected = deck.slice(0, Math.min(2, deck.length));
  const fallbackBlueprint = useMemo(
    () =>
      ({
        header: {
          blueprintId: '',
          blueprintName: '',
          version: 'v1',
          createdBy: '',
          createdAt: '',
          tags: [],
        },
        steps: [],
        policies: {},
        pathIndex: [['blueprintId']],
        stagePaths: ['discover.compose.execute'],
      }) as unknown as AutomationBlueprint,
    [],
  );

  return (
    <div style={{ padding: 16, display: 'grid', gap: 12 }}>
      <h1>Automation Hub</h1>
      <AutomationHealthStrip
        overview={overview}
        onReset={() => {
          resetInput();
          setHighlight([]);
        }}
      />
      <section style={{ display: 'grid', gap: 8 }}>
        <label htmlFor="mode">Mode</label>
        <select
          id="mode"
          value={mode}
          onChange={(event) => {
            setMode(event.currentTarget.value);
          }}
        >
          <option value="observe">observe</option>
          <option value="dry-run">dry-run</option>
          <option value="execute">execute</option>
        </select>
      </section>
      <textarea
        value={input}
        rows={8}
        cols={60}
        onChange={(event) => {
          setInput(event.currentTarget.value);
        }}
      />
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <button
        type="button"
        onClick={() => {
          void run();
        }}
        disabled={loading}
      >
        {loading ? 'Running' : 'Run automation'}
      </button>
      <p>Deck size {deckCount}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <AutomationRunDeck
          deck={deck}
          onSelect={(stepId) => {
            const index = deck.findIndex((entry) => entry.stepId === stepId);
            setHighlight([index]);
            setShowWorkspace(Boolean(index >= 0));
          }}
        />
        <AutomationTopologyViewer
          blueprint={blueprint ?? fallbackBlueprint}
          onSelectStep={(step) => {
            const index = deck.findIndex((entry) => entry.stepId === step.stepId);
            setHighlight(index >= 0 ? [index] : []);
          }}
        />
      </div>
      {showWorkspace && blueprint && (
        <AutomationPolicyWorkspace
          blueprint={blueprint}
          highlight={highlight}
          onClose={() => {
            setShowWorkspace(false);
          }}
        />
      )}
      <section>
        <p>{selected.length} items selected in preview.</p>
      </section>
    </div>
  );
};
