import { memo } from 'react';

export interface PlaybookStudioControlProps {
  readonly disabled: boolean;
  readonly onPrepare: () => void;
  readonly onExecute: () => void;
  readonly onAudit: () => void;
  readonly onRefresh: () => void;
}

const buttonClass = (active: boolean) => (active ? 'control-button active' : 'control-button');

export const PlaybookStudioControls = memo(
  ({ disabled, onPrepare, onExecute, onAudit, onRefresh }: PlaybookStudioControlProps) => {
    return (
      <section className="playbook-studio-controls">
        <header>
          <h2>Studio Controls</h2>
          <p>Use controls to drive automation workflows</p>
        </header>
        <div className="playbook-studio-controls__grid">
          <button
            type="button"
            className={buttonClass(true)}
            onClick={onPrepare}
            disabled={disabled}
          >
            Prepare
          </button>
          <button
            type="button"
            className={buttonClass(!disabled)}
            onClick={onExecute}
            disabled={disabled}
          >
            Execute
          </button>
          <button
            type="button"
            className={buttonClass(true)}
            onClick={onAudit}
            disabled={disabled}
          >
            Audit
          </button>
          <button
            type="button"
            className={buttonClass(!disabled)}
            onClick={onRefresh}
            disabled={false}
          >
            Refresh
          </button>
        </div>
      </section>
    );
  },
);

PlaybookStudioControls.displayName = 'PlaybookStudioControls';
