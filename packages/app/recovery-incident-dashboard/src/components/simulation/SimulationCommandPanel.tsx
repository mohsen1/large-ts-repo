export interface SimulationCommandPanelProps {
  readonly canStart: boolean;
  readonly canPause: boolean;
  readonly canResume: boolean;
  readonly canAbort: boolean;
  readonly onStart: () => void;
  readonly onPause: () => void;
  readonly onAbort: () => void;
  readonly onResume: () => void;
}

export const SimulationCommandPanel = ({
  canStart,
  canPause,
  canResume,
  canAbort,
  onStart,
  onPause,
  onAbort,
  onResume,
}: SimulationCommandPanelProps) => {
  return (
    <section className="simulation-command-panel">
      <h4>Run controls</h4>
      <div className="simulation-command-panel__actions">
        {canStart ? <button onClick={() => onStart()}>Start</button> : null}
        {canPause ? <button onClick={() => onPause()}>Pause</button> : null}
        {canResume ? <button onClick={() => onResume()}>Resume</button> : null}
        {canAbort ? <button onClick={() => onAbort()}>Abort</button> : null}
      </div>
    </section>
  );
};
