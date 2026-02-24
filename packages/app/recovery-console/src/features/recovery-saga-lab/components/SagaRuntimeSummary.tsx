import type { SagaWorkspaceState } from '../types';
import type { ReactElement } from 'react';

interface Props {
  readonly state: SagaWorkspaceState;
}

const severity = (value: number): 'low' | 'mid' | 'high' => {
  if (value > 80) return 'high';
  if (value > 40) return 'mid';
  return 'low';
};

const safeCount = (value: number | undefined): number => (Number.isFinite(value ?? NaN) ? value! : 0);

export const SagaRuntimeSummary = ({ state }: Props): ReactElement => {
  const run = state.run;
  const plan = state.plan;
  const policy = state.policy;

  if (!run || !plan || !policy) {
    return <section>No active run loaded.</section>;
  }

  const stepCount = safeCount(plan?.steps.length);
  const pluginCount = state.pluginStatus.length;
  const warningCount = state.lastSummary.includes('failed') ? 1 : 0;
  const level = severity(stepCount + pluginCount * 3 + warningCount);

  return (
    <section className="saga-runtime-summary">
      <h3>Overview</h3>
      <dl>
        <div>
          <dt>Run</dt>
          <dd>{run.id}</dd>
        </div>
        <div>
          <dt>Policy</dt>
          <dd>{policy.name}</dd>
        </div>
        <div>
          <dt>Namespace</dt>
          <dd>{run.domain}</dd>
        </div>
        <div>
          <dt>Steps</dt>
          <dd>{stepCount}</dd>
        </div>
        <div>
          <dt>Plugins</dt>
          <dd>{pluginCount}</dd>
        </div>
        <div>
          <dt>Warnings</dt>
          <dd>{warningCount}</dd>
        </div>
        <div>
          <dt>Priority</dt>
          <dd>{level}</dd>
        </div>
      </dl>
      <p>{state.lastSummary}</p>
    </section>
  );
};
