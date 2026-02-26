export type StageKind =
  | 'seed'
  | 'detect'
  | 'verify'
  | 'plan'
  | 'approve'
  | 'orchestrate'
  | 'execute'
  | 'monitor'
  | 'report'
  | 'reconcile';

export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface StageBase {
  readonly kind: StageKind;
  readonly severity: Severity;
  readonly active: boolean;
}

export interface StageInputBase {
  readonly tenantId: string;
  readonly nodeId: string;
  readonly attempt: number;
}

export interface SeedStage extends StageBase, StageInputBase {
  readonly kind: 'seed';
  readonly seed: string;
}

export interface DetectStage extends StageBase, StageInputBase {
  readonly kind: 'detect';
  readonly patterns: readonly string[];
}

export interface VerifyStage extends StageBase, StageInputBase {
  readonly kind: 'verify';
  readonly evidence: readonly number[];
}

export interface PlanStage extends StageBase, StageInputBase {
  readonly kind: 'plan';
  readonly actions: readonly string[];
  readonly windowMs: number;
}

export interface ApproveStage extends StageBase, StageInputBase {
  readonly kind: 'approve';
  readonly approvedBy: string;
}

export interface OrchestrateStage extends StageBase, StageInputBase {
  readonly kind: 'orchestrate';
  readonly dependencies: readonly string[];
}

export interface ExecuteStage extends StageBase, StageInputBase {
  readonly kind: 'execute';
  readonly target: string;
  readonly timeoutMs: number;
}

export interface MonitorStage extends StageBase, StageInputBase {
  readonly kind: 'monitor';
  readonly metrics: Record<string, number>;
}

export interface ReportStage extends StageBase, StageInputBase {
  readonly kind: 'report';
  readonly recipients: readonly string[];
}

export interface ReconcileStage extends StageBase, StageInputBase {
  readonly kind: 'reconcile';
  readonly success: boolean;
}

export type StageEvent =
  | SeedStage
  | DetectStage
  | VerifyStage
  | PlanStage
  | ApproveStage
  | OrchestrateStage
  | ExecuteStage
  | MonitorStage
  | ReportStage
  | ReconcileStage;

export type StageResultByKind<T extends StageKind> = T extends 'seed'
  ? { status: 'seeded'; value: string }
  : T extends 'detect'
    ? { status: 'detected'; hits: number }
    : T extends 'verify'
      ? { status: 'verified'; score: number }
      : T extends 'plan'
        ? { status: 'planned'; actions: number }
        : T extends 'approve'
          ? { status: 'approved'; approver: string }
          : T extends 'orchestrate'
            ? { status: 'orchestrated'; count: number }
            : T extends 'execute'
              ? { status: 'executed'; ok: boolean }
              : T extends 'monitor'
                ? { status: 'monitored'; samples: number }
                : T extends 'report'
                  ? { status: 'reported'; recipients: number }
                  : { status: 'reconciled'; success: boolean };

export type StageState =
  | { kind: 'ready'; event: StageEvent }
  | { kind: 'running'; event: StageEvent; startedAt: number }
  | { kind: 'retry'; event: StageEvent; retryReason: string; attempts: number }
  | { kind: 'halted'; event: StageEvent; reason: string }
  | { kind: 'complete'; event: StageEvent; result: StageResultByKind<StageKind> };

export type BranchCode = 'n1' | 's1' | 'e1' | 'w1' | 'd1' | 'r1' | 'f1' | 'x1' | 'q1';
export type BranchDomain = 'incident' | 'policy' | 'mesh' | 'continuity' | 'telemetry' | 'planner' | 'runtime' | 'fabric';

export type BranchInput = {
  readonly code: BranchCode;
  readonly domain: BranchDomain;
  readonly severity: Severity;
  readonly score: number;
  readonly retries: number;
  readonly trace: readonly string[];
  readonly payload: { readonly token: string };
  readonly enabled: boolean;
};

export type BranchDecision = {
  readonly accepted: boolean;
  readonly next?: BranchCode;
  readonly reason?: string;
};

export type BranchResult = {
  readonly code: BranchCode;
  readonly domain: BranchDomain;
  readonly trace: readonly string[];
  readonly decision: {
    readonly decision: BranchDecision;
    readonly accepted: boolean;
  };
};

export const branchUnion: readonly BranchCode[] = ['n1', 's1', 'e1', 'w1', 'd1', 'r1', 'f1', 'x1', 'q1'];

export const evaluateBranchInput = (input: BranchInput): BranchResult => {
  const accepted = input.enabled && input.score > 2 && input.retries < 12;
  const reason = accepted ? 'stable' : input.retries > 10 ? 'retry-limit' : 'low-score';
  return {
    code: input.code,
    domain: input.domain,
    trace: input.trace,
    decision: {
      decision: {
        accepted,
        next: accepted ? branchUnion[(branchUnion.indexOf(input.code) + 1) % branchUnion.length] : undefined,
        reason,
      },
      accepted,
    },
  };
};

export const buildBranchTrace = (): readonly BranchResult[] => {
  return branchUnion.map((code, index) =>
    evaluateBranchInput({
      code,
      domain: index % 2 === 0 ? 'incident' : 'policy',
      severity: index % 2 === 0 ? 'high' : 'low',
      score: index + 1,
      retries: index,
      trace: [code, `idx-${index}`, 'boot'],
      payload: { token: `branch-${index}` },
      enabled: index !== 3,
    }),
  );
};

export type FlowBranch =
  | 'north'
  | 'south'
  | 'east'
  | 'west'
  | 'diag'
  | 'spiral'
  | 'ring'
  | 'fallback';

export interface StageRouter {
  route(stage: StageEvent, branch: FlowBranch): StageState[];
}

export const isSeed = (event: StageEvent): event is SeedStage => event.kind === 'seed';
export const isDetect = (event: StageEvent): event is DetectStage => event.kind === 'detect';
export const isVerify = (event: StageEvent): event is VerifyStage => event.kind === 'verify';
export const isPlan = (event: StageEvent): event is PlanStage => event.kind === 'plan';
export const isApprove = (event: StageEvent): event is ApproveStage => event.kind === 'approve';
export const isOrchestrate = (event: StageEvent): event is OrchestrateStage => event.kind === 'orchestrate';
export const isExecute = (event: StageEvent): event is ExecuteStage => event.kind === 'execute';
export const isMonitor = (event: StageEvent): event is MonitorStage => event.kind === 'monitor';
export const isReport = (event: StageEvent): event is ReportStage => event.kind === 'report';
export const isReconcile = (event: StageEvent): event is ReconcileStage => event.kind === 'reconcile';

export const routeStage = (stage: StageEvent, branch: FlowBranch): StageState[] => {
  const startedAt = Date.now();
  const ready = { kind: 'ready', event: stage } as StageState;
  const profile = evaluateBranchInput({
    code: branch === 'north' ? 'n1' : branch === 'south' ? 's1' : branch === 'east' ? 'e1' : branch === 'west' ? 'w1' : branch === 'ring' ? 'r1' : 'f1',
    domain: stage.nodeId.includes('inc') ? 'incident' : branch === 'diag' ? 'telemetry' : 'mesh',
    severity: stage.severity,
    score: stage.attempt + 2,
    retries: stage.attempt,
    trace: [branch, stage.nodeId, stage.kind],
    payload: { token: `${branch}-${stage.kind}` },
    enabled: stage.active,
  });

  switch (branch) {
    case 'north': {
      if (profile.decision.decision.accepted && stage.severity === 'critical' && isSeed(stage)) {
        return [
          ready,
          { kind: 'running', event: stage, startedAt },
          { kind: 'complete', event: stage, result: { status: 'seeded', value: `north-${stage.seed}` } },
        ];
      }
      if (stage.severity === 'high' || stage.attempt > 6) {
        return [
          { kind: 'retry', event: stage, retryReason: 'severity-shift', attempts: stage.attempt + 1 },
          { kind: 'halted', event: stage, reason: 'high-velocity' },
        ];
      }
      return [{ kind: 'complete', event: stage, result: { status: 'detected', hits: stage.attempt } }];
    }
    case 'south': {
      if (isDetect(stage) && stage.patterns.length > 2) {
        return [
          ready,
          { kind: 'running', event: stage, startedAt },
          { kind: 'complete', event: stage, result: { status: 'verified', score: stage.patterns.length } },
        ];
      }
      return [ready, { kind: 'complete', event: stage, result: { status: 'reported', recipients: stage.attempt } }];
    }
    case 'east': {
      if (isExecute(stage) && stage.timeoutMs < 900) {
        return [
          { kind: 'retry', event: stage, retryReason: 'timeout', attempts: stage.attempt + 1 },
          { kind: 'complete', event: stage, result: { status: 'executed', ok: true } },
        ];
      }
      if (isApprove(stage)) {
        return [
          { kind: 'running', event: stage, startedAt },
          { kind: 'complete', event: stage, result: { status: 'approved', approver: stage.approvedBy } },
        ];
      }
      if (isVerify(stage)) {
        return [
          { kind: 'running', event: stage, startedAt },
          { kind: 'complete', event: stage, result: { status: 'verified', score: stage.evidence.length } },
        ];
      }
      return [ready, { kind: 'complete', event: stage, result: { status: 'reconciled', success: false } }];
    }
    case 'west':
      if (isReconcile(stage)) {
        return [ready, { kind: 'complete', event: stage, result: { status: 'reconciled', success: stage.success } }];
      }
      if (stage.severity === 'critical' && isPlan(stage)) {
        return [ready, { kind: 'halted', event: stage, reason: 'critical-plan' }];
      }
      return [
        { kind: 'running', event: stage, startedAt },
        { kind: 'complete', event: stage, result: { status: 'orchestrated', count: stage.attempt } },
      ];
    case 'diag':
      if (isMonitor(stage)) {
        const metricCount = Object.keys(stage.metrics).length;
        if (metricCount === 0) {
          return [{ kind: 'halted', event: stage, reason: 'no-metric' }];
        }
        return [
          { kind: 'running', event: stage, startedAt },
          { kind: 'complete', event: stage, result: { status: 'monitored', samples: metricCount } },
        ];
      }
      return [{ kind: 'ready', event: stage }];
    case 'spiral':
      if (stage.attempt % 3 === 0) {
        return [
          { kind: 'running', event: stage, startedAt },
          { kind: 'retry', event: stage, retryReason: 'spiral-cooldown', attempts: stage.attempt + 1 },
          { kind: 'complete', event: stage, result: { status: 'verified', score: stage.attempt } },
        ];
      }
      return [ready, { kind: 'complete', event: stage, result: { status: 'reconciled', success: true } }];
    case 'ring':
      for (let index = 0; index < 3; index += 1) {
        if (isSeed(stage)) {
          return [
            {
              kind: 'complete',
              event: stage,
              result: { status: 'seeded', value: `${stage.seed}-${index}` },
            },
          ];
        }
      }
      return [ready, { kind: 'complete', event: stage, result: { status: 'orchestrated', count: stage.attempt } }];
    case 'fallback':
    default:
      if (isReport(stage)) {
        return [
          { kind: 'running', event: stage, startedAt },
          { kind: 'complete', event: stage, result: { status: 'reported', recipients: stage.recipients.length } },
        ];
      }
      if (isApprove(stage)) {
        return [
          { kind: 'running', event: stage, startedAt },
          { kind: 'complete', event: stage, result: { status: 'approved', approver: stage.approvedBy } },
        ];
      }
      return [ready];
  }
};

export const executeFlow = (seed: string, stages: readonly StageEvent[]): StageState[] => {
  let branch: FlowBranch = 'fallback';
  const out: StageState[] = [];
  for (const stage of stages) {
    if (seed.includes('north')) {
      branch = 'north';
    } else if (seed.includes('south')) {
      branch = 'south';
    } else if (seed.includes('east')) {
      branch = 'east';
    } else if (seed.includes('west')) {
      branch = 'west';
    } else if (seed.includes('diag')) {
      branch = 'diag';
    } else if (seed.includes('spiral')) {
      branch = 'spiral';
    } else if (seed.includes('ring')) {
      branch = 'ring';
    } else {
      branch = 'fallback';
    }
    const nextStates = routeStage(stage, branch);
    for (const state of nextStates) {
      out.push(state);
      if (state.kind === 'halted') {
        break;
      }
    }
  }
  return out;
};

export type BranchEnvelope = {
  readonly branch: FlowBranch;
  readonly states: StageState[];
};

export const runBranches = (seed: string, matrix: readonly StageEvent[][]): BranchEnvelope[] => {
  const branches: FlowBranch[] = ['north', 'south', 'east', 'west', 'diag', 'spiral', 'ring', 'fallback'];
  return branches.map((branch, index) => {
    const matrixIndex = index % Math.max(matrix.length, 1);
    const states = matrix[matrixIndex]?.flatMap((state) => routeStage(state, branch)) ?? [];
    return { branch, states };
  });
};

export const branchCoverage = (envelopes: BranchEnvelope[]): number =>
  envelopes.reduce((acc, item) => acc + item.states.length, 0);
