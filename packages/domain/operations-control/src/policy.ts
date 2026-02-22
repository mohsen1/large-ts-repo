import { RiskBand, WindowState, ControlPolicySettings, ControlSignal, estimateRiskBand, hasAllowedWindow, PolicyEvaluation } from './types';

export interface PolicyInput {
  policyId: string;
  windowState: WindowState;
  retries: number;
  settings: ControlPolicySettings;
  signals: readonly ControlSignal[];
  requestedBy: string;
}

export interface PolicyCheck {
  state: WindowState;
  approved: boolean;
  reason: string;
}

export const evaluatePolicy = (input: PolicyInput): PolicyEvaluation => {
  const reasons: string[] = [];

  const modeOk = hasAllowedWindow(input.settings.allowedModes, input.windowState);
  if (!modeOk) reasons.push(`mode ${input.windowState} not allowed`);

  const riskBand = estimateRiskBand(input.signals, input.retries);
  const riskOk = riskFloorPriority(riskBand) >= riskFloorPriority(input.settings.riskFloor);
  if (!riskOk) reasons.push(`risk band ${riskBand} exceeds floor ${input.settings.riskFloor}`);

  const concurrencyOk = Number.isFinite(input.settings.concurrencyCap) && input.settings.concurrencyCap > 0;
  if (!concurrencyOk) reasons.push('invalid concurrency cap');

  const timeoutOk = input.settings.timeoutSeconds >= 1;
  if (!timeoutOk) reasons.push('timeout must be at least one second');

  return {
    policyId: input.policyId as any,
    allowed: reasons.length === 0,
    reasons,
    riskBand,
  };
};

export const enforcePolicy = (checks: readonly PolicyCheck[]): PolicyEvaluation => {
  const blocked = checks.filter((check) => !check.approved);
  const allowed = blocked.length === 0;
  return {
    policyId: 'aggregated' as any,
    allowed,
    reasons: blocked.map((item) => `${item.state}: ${item.reason}`),
    riskBand: blocked.length ? 'red' : 'green',
  };
};

export const buildInitialChecks = (input: PolicyInput): PolicyCheck[] => [
  {
    state: input.windowState,
    approved: hasAllowedWindow(input.settings.allowedModes, input.windowState),
    reason: 'state allowed by settings',
  },
  {
    state: input.windowState,
    approved: estimateRiskBand(input.signals, input.retries) === 'green' || estimateRiskBand(input.signals, input.retries) === 'amber',
    reason: 'risk band within limits',
  },
];

export const riskFloorPriority = (risk: RiskBand): number => {
  if (risk === 'green') return 1;
  if (risk === 'amber') return 2;
  if (risk === 'red') return 3;
  return 4;
};
