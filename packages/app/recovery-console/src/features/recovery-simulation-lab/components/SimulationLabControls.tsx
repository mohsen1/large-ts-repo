import type { SimulationBandSignal, SimulationPlanDraft } from '@domain/recovery-simulation-lab-models';

interface SimulationLabControlsProps {
  readonly draft: SimulationPlanDraft;
  readonly onDraftChange: (draft: SimulationPlanDraft) => void;
  readonly selectedBand?: SimulationBandSignal['band'];
  readonly onBandClick: (band: SimulationBandSignal['band']) => void;
  readonly onRun: () => Promise<void>;
  readonly onBuild: () => void;
}

const bands: SimulationBandSignal['band'][] = ['steady', 'elevated', 'critical', 'extreme'];

const riskMap: Record<SimulationBandSignal['band'], string> = {
  steady: 'Normal execution profile',
  elevated: 'Elevated orchestration risk',
  critical: 'Critical risk requires control checks',
  extreme: 'Extreme risk should not auto execute',
};

export const SimulationLabControls = ({
  draft,
  onDraftChange,
  selectedBand,
  onBandClick,
  onRun,
  onBuild,
}: SimulationLabControlsProps) => {
  return (
    <section>
      <h2>Simulation lab controls</h2>
      <label>
        Budget minutes
        <input
          type="number"
          value={draft.budgetMinutes}
          min={1}
          onChange={(event) =>
            onDraftChange({
              ...draft,
              budgetMinutes: Number.parseInt(event.currentTarget.value || '1', 10),
            })
          }
        />
      </label>
      <label>
        Buffer minutes
        <input
          type="number"
          value={draft.window.bufferMinutes}
          min={0}
          onChange={(event) =>
            onDraftChange({
              ...draft,
              window: {
                ...draft.window,
                bufferMinutes: Number.parseInt(event.currentTarget.value || '0', 10),
              },
            })
          }
        />
      </label>
      <label>
        Max parallel steps
        <input
          type="number"
          value={draft.maxParallelSteps}
          min={1}
          max={16}
          onChange={(event) =>
            onDraftChange({
              ...draft,
              maxParallelSteps: Number.parseInt(event.currentTarget.value || '1', 10),
            })
          }
        />
      </label>
      <label>
        Min actors per batch
        <input
          type="number"
          value={draft.minActorsPerBatch}
          min={1}
          onChange={(event) =>
            onDraftChange({
              ...draft,
              minActorsPerBatch: Number.parseInt(event.currentTarget.value || '1', 10),
            })
          }
        />
      </label>
      <div>
        {bands.map((band) => (
          <button
            key={band}
            type="button"
            onClick={() => onBandClick(band)}
            style={{
              marginRight: 8,
              background: selectedBand === band ? '#ffd591' : '#f5f5f5',
            }}
          >
            {band}
          </button>
        ))}
      </div>
      <p>{selectedBand ? riskMap[selectedBand] : 'Select band for guidance'}</p>
      <button type="button" onClick={onBuild}>
        Build plan
      </button>
      <button type="button" onClick={() => void onRun()}>
        Execute simulation
      </button>
    </section>
  );
};
