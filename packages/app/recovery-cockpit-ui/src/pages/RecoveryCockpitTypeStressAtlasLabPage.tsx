import { useCallback, useState } from 'react';
import { TypeStressAtlasBoard } from '../components/stress/TypeStressAtlasBoard';
import { TypeStressAtlasControlPanel, type ControlResult } from '../components/stress/TypeStressAtlasControlPanel';
import { TypeStressAtlasMatrixPanel } from '../components/stress/TypeStressAtlasMatrixPanel';
import { useTypeStressAtlas } from '../hooks/useTypeStressAtlas';

type LogLevel = 'info' | 'warn' | 'error';

type LabLog = {
  readonly level: LogLevel;
  readonly at: number;
  readonly label: string;
};

const initialLogs = (seed: number): readonly LabLog[] => [
  { level: 'info', at: seed, label: `seed:${seed}` },
];

const nextIndex = (logs: readonly LabLog[]) => logs.length + 1;

const toSeverity = (result: ControlResult): LogLevel => {
  if (result.ok) {
    return result.routed >= result.chainLength ? 'info' : 'warn';
  }
  return 'error';
};

const mergeLogs = (logs: readonly LabLog[], result: ControlResult): readonly LabLog[] => {
  const next = logs.length;
  return [
    ...logs,
    {
      level: toSeverity(result),
      at: next,
      label: `${result.summary} (${result.chainLength}/${result.routed})`,
    },
  ];
};

const labelForLevel = (level: LogLevel): string => {
  if (level === 'error') return '[ERR]';
  if (level === 'warn') return '[WRN]';
  return '[INF]';
};

export const RecoveryCockpitTypeStressAtlasLabPage = () => {
  const [logs, setLogs] = useState<readonly LabLog[]>(initialLogs(1));
  const { status, bootstrap } = useTypeStressAtlas();

  const handleResult = useCallback((result: ControlResult) => {
    setLogs((current) => mergeLogs(current, result));
  }, []);

  const clearLogs = useCallback(() => {
    setLogs((current) => (current.length === 0 ? current : [current[0]]));
  }, []);

  const handleBucket = useCallback(async () => {
    await bootstrap();
    setLogs((current) => {
      const next = nextIndex(current);
      return [...current, { level: 'info', at: next, label: `bootstrap-${status}` }];
    });
  }, [bootstrap, status]);

  return (
    <main style={{ display: 'grid', gap: 12, padding: 16 }}>
      <h2>Type Stress Atlas Lab</h2>
      <TypeStressAtlasControlPanel heading="atlas controls" tenants={['global', 'tenant-a', 'tenant-b']} onResult={handleResult} />
      <TypeStressAtlasMatrixPanel title="bucket matrix" onBucketSelect={() => void handleBucket()} />
      <TypeStressAtlasBoard title="atlas board" onDispatch={() => void 0} />
      <section>
        <div style={{ marginBottom: 8 }}>
          <button type="button" onClick={clearLogs}>clear</button>
        </div>
        <ul>
          {logs.map((entry) => (
            <li key={`${entry.level}-${entry.at}`}>
              {labelForLevel(entry.level)}
              {' '}
              {entry.label}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
};
