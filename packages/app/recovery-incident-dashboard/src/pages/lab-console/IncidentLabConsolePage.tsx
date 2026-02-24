import { useMemo, useState } from 'react';
import { useIncidentLabConsole } from '../../hooks/useIncidentLabConsole';
import { LabConsoleDashboard } from '../../components/lab-console/LabConsoleDashboard';

const seedSignals = ['topology', 'signal', 'command', 'readiness', 'policy'] as const;

interface SeedSelectorProps {
  readonly selected: string;
  readonly onSelect: (signal: string) => void;
}

const SeedSelector = ({ selected, onSelect }: SeedSelectorProps) => (
  <section style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
    {seedSignals.map((signal) => (
      <button
        type="button"
        key={signal}
        onClick={() => onSelect(signal)}
        style={{
          color: selected === signal ? '#0b101b' : '#dce6ff',
          background: selected === signal ? '#6fe3ff' : '#0e1826',
          border: '1px solid #495c81',
          borderRadius: '0.6rem',
          padding: '0.35rem 0.7rem',
        }}
      >
        {signal}
      </button>
    ))}
  </section>
);

const buildSignal = (seed: string, index: number): string => `${seed}-${index}`;

export const IncidentLabConsolePage = () => {
  const [seed, setSeed] = useState('incident');
  const selected = useMemo(() => buildSignal(seed, 2), [seed]);
  const seedWithMode = `${selected}.${new Date().toISOString()}`;
  const { run } = useIncidentLabConsole(seedWithMode);

  return (
    <main style={{ padding: '1rem', display: 'grid', gap: '1rem' }}>
      <h1>Incident Lab Console</h1>
      <p style={{ marginTop: '-0.2rem' }}>
        Synthetic orchestration surface with plugin registry, timeline reconstruction, and typed event stream.
      </p>
      <SeedSelector selected={seed} onSelect={setSeed} />
      <button type="button" onClick={() => void run()}>run now</button>
      <LabConsoleDashboard workspaceSignal={seedWithMode} />
    </main>
  );
};
