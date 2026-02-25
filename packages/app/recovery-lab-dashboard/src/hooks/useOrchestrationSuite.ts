import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  runStudioSuite,
  runBatchStudioSuite,
  buildRequest,
  type OrchestrationSuiteRunInput,
  type OrchestrationSuiteRunOutput,
} from '../services/orchestrationSuiteService';

type SuiteMode = 'single' | 'batch';

interface OrchestrationState {
  readonly mode: SuiteMode;
  readonly input: OrchestrationSuiteRunInput;
  readonly loading: boolean;
  readonly message: string;
  readonly outputs: readonly OrchestrationSuiteRunOutput[];
  readonly lastOutput: OrchestrationSuiteRunOutput | null;
  readonly outputCount: number;
  readonly runSuite: () => Promise<void>;
  readonly queue: () => Promise<void>;
  readonly setTenant: (tenant: string) => void;
  readonly setWorkspace: (workspace: string) => void;
  readonly setScenario: (scenario: string) => void;
  readonly setRepeats: (repeats: number) => void;
  readonly setMode: (mode: SuiteMode) => void;
}

const defaultInput = {
  tenant: 'default-tenant',
  workspace: 'default-workspace',
  scenario: 'default-scenario',
  repeats: 3,
} satisfies Omit<OrchestrationSuiteRunInput, 'policies'>;

const base = (index: number): OrchestrationSuiteRunInput => ({
  ...defaultInput,
  tenant: `tenant-${index}`,
  workspace: `workspace-${index}`,
  scenario: `scenario-${index}`,
  repeats: 2,
  policies: ['policy.detect', 'policy.verify'],
});

export const useOrchestrationSuite = (): OrchestrationState => {
  const [mode, setModeState] = useState<SuiteMode>('single');
  const [tenant, setTenantState] = useState(defaultInput.tenant);
  const [workspace, setWorkspaceState] = useState(defaultInput.workspace);
  const [scenario, setScenarioState] = useState(defaultInput.scenario);
  const [repeats, setRepeatsState] = useState(defaultInput.repeats);
  const [loading, setLoading] = useState(false);
  const [outputs, setOutputs] = useState<readonly OrchestrationSuiteRunOutput[]>([]);
  const messageRef = useRef('ready');
  const abortRef = useRef(new AbortController());

  const input = useMemo<OrchestrationSuiteRunInput>(
    () => ({
      tenant,
      workspace,
      scenario,
      repeats,
      policies: ['simulate', 'verify', 'restore'],
    }),
    [tenant, workspace, scenario, repeats],
  );

  const runSuite = useCallback(async () => {
    messageRef.current = 'running';
    abortRef.current.abort();
    abortRef.current = new AbortController();
    setLoading(true);
    try {
      if (mode === 'single') {
        const output = await runStudioSuite(input);
        setOutputs((previous) => [output, ...previous].slice(0, 20));
      } else {
        const batchInput = [base(1), base(2), base(3)].map((entry) => ({
          ...entry,
          tenant: input.tenant,
          repeats: input.repeats,
        }));
        const batchOutput = await runBatchStudioSuite(batchInput);
        setOutputs(batchOutput);
      }
      messageRef.current = 'complete';
    } finally {
      setLoading(false);
      void buildRequest(input);
    }
  }, [mode, input]);

  const queue = useCallback(async () => {
    setLoading(true);
    try {
      const payload = [1, 2, 3].map((index) => base(index));
      const batchOutput = await runBatchStudioSuite(payload);
      setOutputs((previous) => [...previous, ...batchOutput]);
    } finally {
      setLoading(false);
    }
  }, []);

  const setTenant = useCallback((next: string) => {
    setTenantState(next.trim() || defaultInput.tenant);
  }, []);

  const setWorkspace = useCallback((next: string) => {
    setWorkspaceState(next.trim() || defaultInput.workspace);
  }, []);

  const setScenario = useCallback((next: string) => {
    setScenarioState(next.trim() || defaultInput.scenario);
  }, []);

  const setRepeats = useCallback((next: number) => {
    setRepeatsState(Math.max(1, next));
  }, []);

  const setMode = useCallback((next: SuiteMode) => {
    setModeState(next);
  }, []);

  const lastOutput = useMemo(() => outputs.at(0) ?? null, [outputs]);
  const outputCount = outputs.length;
  const message = useMemo(() => messageRef.current, [outputs.length, loading]);

  useEffect(() => {
    void runSuite();
  }, [runSuite, tenant]);

  useEffect(() => () => {
    abortRef.current.abort();
  }, []);

  return {
    mode,
    input,
    loading,
    message,
    outputs,
    lastOutput,
    outputCount,
    runSuite,
    queue,
    setTenant,
    setWorkspace,
    setScenario,
    setRepeats,
    setMode,
  };
};
