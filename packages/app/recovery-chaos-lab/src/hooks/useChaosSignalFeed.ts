import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ControlPlaneEvent, ControlPlaneStream } from '../services/chaosControlPlane';
import { ChaosControlPlaneService } from '../services/chaosControlPlane';

export interface SignalFeedConfig {
  readonly namespace: string;
  readonly windowMs: number;
  readonly profileIndex: number;
}

export interface SignalFeedState {
  readonly events: readonly ControlPlaneEvent[];
  readonly running: boolean;
  readonly error: string | null;
  readonly tick: number;
}

export function useChaosSignalFeed(config: SignalFeedConfig) {
  const service = useMemo(() => new ChaosControlPlaneService(), []);
  const streamRef = useRef<ControlPlaneStream | null>(null);
  const [state, setState] = useState<SignalFeedState>({
    events: [],
    running: false,
    error: null,
    tick: 0
  });

  useEffect(() => {
    return () => {
      void service[Symbol.asyncDispose]();
    };
  }, [service]);

  const run = useCallback(async () => {
    setState((current) => ({
      ...current,
      running: true,
      error: null
    }));

    const synthetic = [{ at: Date.now(), kind: 'bootstrap', payload: { namespace: config.namespace, phase: 'start' } }];
    const iterator = service.streamSignals(config.namespace, synthetic);
    streamRef.current = iterator;

    const chunks: ControlPlaneEvent[] = [];
    for await (const event of iterator) {
      chunks.push(event);
      setState((current) => ({
        ...current,
        events: [...chunks],
        tick: current.tick + 1
      }));
    }

    setState((current) => ({
      ...current,
      running: false
    }));
  }, [config.namespace, service]);

  const stop = useCallback(() => {
    setState((current) => ({
      ...current,
      running: false,
      error: 'stopped'
    }));
    streamRef.current = null;
  }, []);

  return useMemo(
    () => ({
      ...state,
      run,
      stop
    }),
    [run, state, stop]
  );
}
