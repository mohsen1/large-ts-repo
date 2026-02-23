import { useEffect, useState } from 'react';

export interface SignalRunTickerProps {
  readonly label: string;
  readonly frequencySeconds: number;
  readonly isRunning?: boolean;
}

const formatMs = (value: number): string => value.toString().padStart(2, '0');

export const SignalRunTicker = ({ label, frequencySeconds, isRunning = false }: SignalRunTickerProps) => {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isRunning) {
      return;
    }
    const timer = window.setInterval(() => {
      setTick((value) => value + 1);
    }, frequencySeconds * 1000);
    return () => window.clearInterval(timer);
  }, [frequencySeconds, isRunning]);

  const minutes = Math.floor(tick / 60);
  const seconds = tick % 60;

  return (
    <div>
      <h4>{label}</h4>
      <p>{`${label} tick ${formatMs(minutes)}:${formatMs(seconds)}`}</p>
      <p>{isRunning ? 'running' : 'paused'}</p>
    </div>
  );
};
