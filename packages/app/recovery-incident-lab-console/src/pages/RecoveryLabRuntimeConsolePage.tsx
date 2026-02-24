import { type ReactElement } from 'react';
import { LabConsoleRuntimePanel } from '../components/LabConsoleRuntimePanel';
import { LabConsoleRuntimeSummary } from '../components/LabConsoleRuntimeSummary';

const section = (index: number): string => `section-${index}`;

const bullets = [
  'topology-aware plugin orchestration',
  'typed manifest validation',
  'timeline, diagnostics, and trend extraction',
  'scope aware execution state',
  'retry safety with AsyncDisposable lifecycle',
];

export const RecoveryLabRuntimeConsolePage = (): ReactElement => {
  return (
    <main className="recovery-lab-runtime-console-page">
      <h1>Recovery Lab Runtime Console</h1>
      <p>
        This page demonstrates a strongly typed runtime orchestration path with plugin manifests,
        execution plan validation, and telemetry analysis.
      </p>
      <div className="runtime-console-layout">
        <LabConsoleRuntimePanel />
        <LabConsoleRuntimeSummary title="Runtime Summary" />
      </div>
      <section>
        <h2>Feature matrix</h2>
        <ul>
          {bullets.map((entry, index) => (
            <li key={section(index)}>{entry}</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
