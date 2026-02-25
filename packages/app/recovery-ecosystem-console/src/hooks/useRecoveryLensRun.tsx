import { useCallback, useState } from 'react';
import { runRuntime } from '@service/recovery-lens-observability-orchestrator';

export const useRecoveryLensRun = (namespace: string) => {
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<string>('');

  const triggerRun = useCallback(async () => {
    setRunning(true);
    const points: readonly { [key: string]: unknown }[] = [{ namespace, boot: true }];
    const result = await runRuntime(namespace as never, points);
    setRunning(false);
    if (result.ok) {
      setLast(result.value);
    } else {
      setLast(`error:${result.error.message}`);
    }
  }, [namespace]);

  return {
    running,
    last,
    triggerRun,
  };
};
