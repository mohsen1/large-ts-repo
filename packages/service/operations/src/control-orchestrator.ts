import {
  asControlSignalId,
  buildEnvelope,
  evaluatePolicy,
  hasAllowedWindow,
  normalizeControlWindow,
  normalizePlanState,
  PlannerInput,
  PolicyInput,
  PolicyEvaluation,
  PreparedPlan,
  RiskBand,
  buildSignalScore,
} from '@domain/operations-control';
import {
  calculateSignalStrength,
  OperationSignal,
  PlanTemplate,
  estimatePlanMinutes,
  selectSignalsForWindow,
} from '@domain/operations-orchestration';
import { Result, fail, ok } from '@shared/result';
import {
  ControlOperationsRepository,
  InMemoryControlOperationsRepository,
  makeRunRecord,
} from '@data/operations-control-store';

export interface ControlOrchestratorInput {
  tenantId: string;
  requestId: string;
  policy: PlanTemplate;
  stepContext: readonly string[];
  signals: readonly OperationSignal[];
  window: {
    startsAt: string;
    endsAt: string;
    owner: string;
    region: string;
  };
  settings?: {
    maxRetries?: number;
    timeoutSeconds?: number;
    concurrencyCap?: number;
    allowedModes?: readonly ('draft' | 'active' | 'throttled' | 'completed' | 'failed')[];
    riskFloor?: RiskBand;
  };
}

interface ControlOrchestrationOutput {
  ok: boolean;
  runId?: string;
  state: ReturnType<typeof normalizePlanState>;
  planWindow: string;
  diagnostics: readonly string[];
}

const buildPolicyInput = (input: ControlOrchestratorInput): PolicyInput => ({
  policyId: input.policy.id,
  windowState: input.settings?.allowedModes?.includes('active') ? 'active' : 'draft',
  retries: input.settings?.maxRetries ?? 2,
  settings: {
    maxRetries: input.settings?.maxRetries ?? 2,
    timeoutSeconds: input.settings?.timeoutSeconds ?? 30,
    concurrencyCap: input.settings?.concurrencyCap ?? 50,
    allowedModes: input.settings?.allowedModes ?? ['active', 'draft'],
    riskFloor: input.settings?.riskFloor ?? 'green',
  },
  requestedBy: input.tenantId,
});

const toSignal = (input: OperationSignal): { name: string; weight: number; severity: number; emittedAt: string } => ({
  name: input.name,
  weight: input.weight,
  severity: Number((input.weight || 0) * 10),
  emittedAt: input.emittedAt,
});

const planTemplateToInput = (input: ControlOrchestratorInput): PlannerInput => {
  const templateWindow = normalizeControlWindow({
    from: input.window.startsAt,
    to: input.window.endsAt,
    owner: input.window.owner,
    region: input.window.region,
  });

  const steps = [
    {
      key: `${input.requestId}:resolve`,
      name: 'resolve',
      action: 'resolve-runtime',
      timeoutMs: 3_000,
      dependencies: [],
      tags: ['control', 'runtime'],
      context: { template: input.policy.id },
    },
    {
      key: `${input.requestId}:notify`,
      name: 'notify',
      action: 'dispatch-ops-event',
      timeoutMs: 1_000,
      dependencies: [`${input.requestId}:resolve`],
      tags: ['control', 'event'],
      context: { trace: input.stepContext.join('>') },
    },
  ] as const;

  return {
    tenantId: input.tenantId,
    requestId: input.requestId,
    template: {
      id: input.policy.id,
      name: input.policy.policyName,
      owner: 'operations',
      description: `${input.policy.id} control plan`,
      windows: [templateWindow],
      defaultSettings: {
        maxRetries: input.settings?.maxRetries ?? 3,
        timeoutSeconds: input.settings?.timeoutSeconds ?? 60,
        concurrencyCap: input.settings?.concurrencyCap ?? 20,
        allowedModes: input.settings?.allowedModes ?? ['draft', 'active'],
        riskFloor: input.settings?.riskFloor ?? 'green',
      },
      steps: [...steps].map((step) => ({
        ...step,
        key: step.key,
      })),
    },
    steps: [...steps].map((step) => ({
      ...step,
      key: `${step.key}-${input.requestId}`,
    })),
    signals: [...input.signals, ...input.signals].map((signal) => ({
      id: asControlSignalId(`${input.requestId}:${signal.name}`),
      name: signal.name,
      source: signal.name,
      weight: signal.weight,
      severity: Number(signal.weight || 0) * 10,
      observedAt: signal.emittedAt,
      payload: signal,
    })),
    settings: {
      maxRetries: input.settings?.maxRetries ?? 3,
      timeoutSeconds: input.settings?.timeoutSeconds ?? 60,
      concurrencyCap: input.settings?.concurrencyCap ?? 20,
      allowedModes: input.settings?.allowedModes ?? ['draft', 'active'],
      riskFloor: input.settings?.riskFloor ?? 'green',
    },
    spanStart: input.window.startsAt,
    spanEnd: input.window.endsAt,
  };
};

const evaluateWindowPolicy = (input: ControlOrchestratorInput, policyInput: PolicyInput): PolicyEvaluation => {
  const fromPolicy = evaluatePolicy(policyInput);
  if (!hasAllowedWindow(policyInput.settings.allowedModes, policyInput.windowState)) {
    return {
      ...fromPolicy,
      reasons: [...fromPolicy.reasons, 'window state denied by policy settings'],
    };
  }
  return fromPolicy;
};

export const createControlOrchestrator = (repository?: ControlOperationsRepository) => {
  const sink: ControlOperationsRepository = repository ?? new InMemoryControlOperationsRepository();

  return async (input: ControlOrchestratorInput): Promise<Result<ControlOrchestrationOutput, Error>> => {
    const policyInput = buildPolicyInput(input);
    const policyEval = evaluateWindowPolicy(input, policyInput);
    if (!policyEval.allowed) {
      return fail(new Error(`control policy blocked: ${policyEval.reasons.join(', ')}`));
    }

    const plannerInput = planTemplateToInput(input);
    const prepared: PreparedPlan = buildEnvelope(plannerInput);

    const signalStrength = calculateSignalStrength(selectSignalsForWindow(plannerInput.signals, 'critical'));
    const score = Math.round(signalStrength + estimatePlanMinutes(plannerInput.template.steps as any));

    const runRecord = makeRunRecord(input.tenantId, input.requestId, prepared.plan);
    const saved = await sink.upsertRun(runRecord);
    if (!saved.ok) return fail(saved.error);

    await sink.appendTimeline({
      runId: runRecord.runId,
      at: new Date().toISOString(),
      signals: plannerInput.signals,
    });

    return ok({
      ok: true,
      runId: runRecord.runId,
      state: normalizePlanState(prepared.plan.state),
      planWindow: `${plannerInput.spanStart}->${plannerInput.spanEnd}`,
      diagnostics: [...prepared.diagnostics, `score=${score}`, `risk=${policyEval.riskBand}`, `signals=${buildSignalScore(plannerInput.signals)}`],
    });
  };
};

export const controlOutcome = (inputs: readonly OperationSignal[]): { score: number; passed: boolean; reasons: readonly string[] } => {
  const sorted = [...inputs].sort((left, right) => right.weight - left.weight);
  const sample = sorted.slice(0, 5);
  const score = sample.reduce((sum, signal) => sum + signal.weight, 0);
  const strength = calculateSignalStrength(sorted);
  const passed = score >= 1 && strength >= 1;
  const reasons = passed ? [] : ['insufficient signal strength'];
  return {
    score: Math.round((score + strength) * 10),
    passed,
    reasons,
  };
};
