import { type ReactElement, useEffect, useMemo, useState } from 'react';

interface TickerFrame {
  readonly at: string;
  readonly signature: string;
}

interface TickerProps {
  readonly frames: readonly TickerFrame[];
  readonly maxFrames?: number;
}

export const RecoveryLabSignalTicker = ({ frames, maxFrames = 6 }: TickerProps): ReactElement => {
  const [cursor, setCursor] = useState(0);
  const sliced = useMemo(
    () => frames.toSorted((left, right) => right.at.localeCompare(left.at)).slice(0, maxFrames),
    [frames, maxFrames],
  );
  const tick = sliced.map((frame, index) => `${index + 1}. ${frame.signature}`);
  const latest = sliced.at(cursor % Math.max(1, sliced.length));

  useEffect(() => {
    if (sliced.length === 0) {
      return;
    }
    const ticker = setInterval(() => {
      setCursor((current) => (current + 1) % Math.max(1, sliced.length));
    }, 1200);
    return () => clearInterval(ticker);
  }, [sliced.length]);

  return (
    <section className="recovery-lab-signal-ticker">
      <header>
        <h2>Signal ticker</h2>
      </header>
      <p>{latest ? `latest: ${latest.signature}` : 'waiting for signals'}</p>
      <ul>
        {tick.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>
    </section>
  );
};
