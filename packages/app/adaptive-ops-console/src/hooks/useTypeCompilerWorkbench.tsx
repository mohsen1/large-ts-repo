import { useEffect, useMemo, useState } from 'react';
import type {
  WorkbenchEvent,
  WorkbenchOpcode,
  TraceStep,
} from '@domain/recovery-lab-synthetic-orchestration';
import {
  runControlFlow,
  expandWorkflow,
} from '@domain/recovery-lab-synthetic-orchestration';
import {
  runRuntimeBench,
  synthManifest,
  toTemplateKey,
} from '@domain/recovery-lab-synthetic-orchestration';

export interface TypeCompilerWorkbenchOptions {
  readonly tenant: string;
  readonly routeCount: number;
  readonly opcode: WorkbenchOpcode;
}

export interface TypeCompilerWorkbenchState {
  readonly tenant: string;
  readonly eventCount: number;
  readonly steps: readonly TraceStep[];
  readonly manifestId: string;
  readonly routeTemplate: string;
  readonly loading: boolean;
  readonly seed: string;
}

type EventConfig = {
  readonly opcode: WorkbenchOpcode;
  readonly tenant: string;
  readonly runId: string;
  readonly attempt: number;
};

const makeEvent = ({ opcode, tenant, runId, attempt }: EventConfig): WorkbenchEvent => {
  if (attempt % 3 === 0) {
    return {
      opcode,
      tenant,
      runId,
      attempt,
      kind: 'bool',
      payload: attempt % 2 === 0,
    };
  }

  if (attempt % 3 === 1) {
    return {
      opcode,
      tenant,
      runId,
      attempt,
      kind: 'text',
      payload: `${tenant}-${opcode}-${attempt}`,
    };
  }

  return {
    opcode,
    tenant,
    runId,
    attempt,
    kind: 'route',
    payload: {
      path: `/${tenant}/${opcode}/${attempt}`,
      domain: `${opcode}-domain`,
    },
  };
};

export const useTypeCompilerWorkbench = (options: TypeCompilerWorkbenchOptions): TypeCompilerWorkbenchState => {
  const [loading, setLoading] = useState(true);
  const routeTemplate = toTemplateKey('discover:incident:critical');

  const events = useMemo(
    () =>
      Array.from({ length: options.routeCount }, (_value, index) => makeEvent({
        opcode: options.opcode,
        tenant: options.tenant,
        runId: `${options.tenant}-run-${index}`,
        attempt: index + 1,
      })),
    [options.opcode, options.routeCount, options.tenant],
  );

  const steps = useMemo(() => {
    const expanded = expandWorkflow(events);
    return runControlFlow(events, expanded);
  }, [events]);

  const [manifestId, seed] = useMemo(() => {
    const manifest = synthManifest(options.tenant, ['discover:incident:critical', 'assess:incident:high']);
    const seedValue = `seed-${manifest.tenant}`;
    return [manifest.tenant, seedValue];
  }, [options.tenant]);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      if (!mounted) return;
      await runRuntimeBench(events, options.opcode);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [events, options.opcode]);

  return {
    tenant: options.tenant,
    eventCount: events.length,
    steps,
    manifestId,
    routeTemplate,
    loading,
    seed,
  };
};
