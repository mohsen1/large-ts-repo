export type BranchSeverity = 'low' | 'medium' | 'high' | 'critical';
export type BranchPath = 'mesh' | 'planner' | 'runtime' | 'policy' | 'signal' | 'governance' | 'orchestrator' | 'observability';

export type BranchCode =
  | 'branch-01' | 'branch-02' | 'branch-03' | 'branch-04' | 'branch-05' | 'branch-06' | 'branch-07' | 'branch-08' | 'branch-09' | 'branch-10'
  | 'branch-11' | 'branch-12' | 'branch-13' | 'branch-14' | 'branch-15' | 'branch-16' | 'branch-17' | 'branch-18' | 'branch-19' | 'branch-20'
  | 'branch-21' | 'branch-22' | 'branch-23' | 'branch-24' | 'branch-25' | 'branch-26' | 'branch-27' | 'branch-28' | 'branch-29' | 'branch-30'
  | 'branch-31' | 'branch-32' | 'branch-33' | 'branch-34' | 'branch-35' | 'branch-36' | 'branch-37' | 'branch-38' | 'branch-39' | 'branch-40'
  | 'branch-41' | 'branch-42' | 'branch-43' | 'branch-44' | 'branch-45' | 'branch-46' | 'branch-47' | 'branch-48' | 'branch-49' | 'branch-50'
  | 'branch-51' | 'branch-52' | 'branch-53' | 'branch-54' | 'branch-55' | 'branch-56' | 'branch-57' | 'branch-58' | 'branch-59' | 'branch-60';

export interface BranchPayload {
  readonly code: BranchCode;
  readonly domain: BranchPath;
  readonly score: number;
  readonly enabled: boolean;
  readonly message: string;
}

export interface BranchInput {
  readonly code: BranchCode;
  readonly domain: BranchPath;
  readonly severity: BranchSeverity;
  readonly score: number;
  readonly retries: number;
  readonly trace: string[];
  readonly payload?: {
    readonly token?: string;
    readonly metadata?: Record<string, string>;
  };
  readonly enabled: boolean;
}

export type BranchDecision = {
  readonly accepted: boolean;
  readonly reason: string;
  readonly next: BranchCode | undefined;
};

export type BranchLog = {
  readonly id: BranchCode;
  readonly decision: BranchDecision;
  readonly elapsedMs: number;
  readonly severity: BranchSeverity;
};

export type BranchResult = {
  readonly input: BranchInput;
  readonly decision: BranchDecision;
  readonly trail: BranchLog[];
};

const branchCodes = [
  'branch-01',
  'branch-02',
  'branch-03',
  'branch-04',
  'branch-05',
  'branch-06',
  'branch-07',
  'branch-08',
  'branch-09',
  'branch-10',
  'branch-11',
  'branch-12',
  'branch-13',
  'branch-14',
  'branch-15',
  'branch-16',
  'branch-17',
  'branch-18',
  'branch-19',
  'branch-20',
  'branch-21',
  'branch-22',
  'branch-23',
  'branch-24',
  'branch-25',
  'branch-26',
  'branch-27',
  'branch-28',
  'branch-29',
  'branch-30',
  'branch-31',
  'branch-32',
  'branch-33',
  'branch-34',
  'branch-35',
  'branch-36',
  'branch-37',
  'branch-38',
  'branch-39',
  'branch-40',
  'branch-41',
  'branch-42',
  'branch-43',
  'branch-44',
  'branch-45',
  'branch-46',
  'branch-47',
  'branch-48',
  'branch-49',
  'branch-50',
  'branch-51',
  'branch-52',
  'branch-53',
  'branch-54',
  'branch-55',
  'branch-56',
  'branch-57',
  'branch-58',
  'branch-59',
  'branch-60',
] as const satisfies readonly BranchCode[];

const branchDomain = (code: BranchCode): BranchPath => {
  if (code === 'branch-01' || code === 'branch-02' || code === 'branch-03') {
    return 'mesh';
  }
  if (code === 'branch-04' || code === 'branch-05' || code === 'branch-06') {
    return 'planner';
  }
  if (
    code === 'branch-07' ||
    code === 'branch-08' ||
    code === 'branch-09' ||
    code === 'branch-10'
  ) {
    return 'runtime';
  }
  if (
    code === 'branch-11' ||
    code === 'branch-12' ||
    code === 'branch-13'
  ) {
    return 'policy';
  }
  if (
    code === 'branch-14' ||
    code === 'branch-15' ||
    code === 'branch-16' ||
    code === 'branch-17'
  ) {
    return 'signal';
  }
  if (
    code === 'branch-18' ||
    code === 'branch-19' ||
    code === 'branch-20'
  ) {
    return 'governance';
  }
  if (
    code === 'branch-21' ||
    code === 'branch-22' ||
    code === 'branch-23' ||
    code === 'branch-24'
  ) {
    return 'orchestrator';
  }
  return 'observability';
};

export const branchUnion = [...branchCodes] as const satisfies readonly BranchCode[];

export const evaluateBranchInput = (input: BranchInput): BranchResult => {
  const start = Date.now();
  const trail: BranchLog[] = [];

  const record = (id: BranchCode, decision: BranchDecision): BranchLog => ({
    id,
    decision,
    elapsedMs: Date.now() - start,
    severity: input.severity,
  });

  const fallback = (decision: BranchDecision): BranchResult => ({
    input: { ...input, payload: input.payload ?? { token: 'fallback' } },
    decision,
    trail,
  });

  try {
    const baseDomain = branchDomain(input.code);

    for (const step of input.trace) {
      if (!step) {
        trail.push(record(input.code, { accepted: false, reason: 'fallback', next: undefined }));
      }
    }

    if (input.score < 0 && input.retries > 0) {
      return fallback({ accepted: false, reason: 'blocked', next: undefined });
    }

    switch (input.code) {
      case 'branch-01': {
        const local = 1;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '02') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-01' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '02') as BranchCode,
          };
          trail.push(record(('branch-01' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-01' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-02': {
        const local = 2;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '03') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-02' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '03') as BranchCode,
          };
          trail.push(record(('branch-02' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-02' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-03': {
        const local = 3;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '04') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-03' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '04') as BranchCode,
          };
          trail.push(record(('branch-03' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-03' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-04': {
        const local = 4;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '05') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-04' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '05') as BranchCode,
          };
          trail.push(record(('branch-04' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-04' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-05': {
        const local = 5;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '06') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-05' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '06') as BranchCode,
          };
          trail.push(record(('branch-05' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-05' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-06': {
        const local = 6;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '07') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-06' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '07') as BranchCode,
          };
          trail.push(record(('branch-06' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-06' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-07': {
        const local = 7;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '08') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-07' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '08') as BranchCode,
          };
          trail.push(record(('branch-07' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-07' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-08': {
        const local = 8;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '09') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-08' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '09') as BranchCode,
          };
          trail.push(record(('branch-08' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-08' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-09': {
        const local = 9;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '10') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-09' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '10') as BranchCode,
          };
          trail.push(record(('branch-09' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-09' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-10': {
        const local = 10;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '11') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-10' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '11') as BranchCode,
          };
          trail.push(record(('branch-10' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-10' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-11': {
        const local = 11;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '12') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-11' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '12') as BranchCode,
          };
          trail.push(record(('branch-11' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-11' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-12': {
        const local = 12;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '13') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-12' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '13') as BranchCode,
          };
          trail.push(record(('branch-12' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-12' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-13': {
        const local = 13;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '14') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-13' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '14') as BranchCode,
          };
          trail.push(record(('branch-13' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-13' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-14': {
        const local = 14;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '15') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-14' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '15') as BranchCode,
          };
          trail.push(record(('branch-14' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-14' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-15': {
        const local = 15;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '16') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-15' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '16') as BranchCode,
          };
          trail.push(record(('branch-15' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-15' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-16': {
        const local = 16;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '17') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-16' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '17') as BranchCode,
          };
          trail.push(record(('branch-16' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-16' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-17': {
        const local = 17;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '18') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-17' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '18') as BranchCode,
          };
          trail.push(record(('branch-17' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-17' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-18': {
        const local = 18;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '19') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-18' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '19') as BranchCode,
          };
          trail.push(record(('branch-18' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-18' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-19': {
        const local = 19;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '20') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-19' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '20') as BranchCode,
          };
          trail.push(record(('branch-19' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-19' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-20': {
        const local = 20;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '21') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-20' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '21') as BranchCode,
          };
          trail.push(record(('branch-20' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-20' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-21': {
        const local = 21;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '22') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-21' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '22') as BranchCode,
          };
          trail.push(record(('branch-21' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-21' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-22': {
        const local = 22;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '23') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-22' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '23') as BranchCode,
          };
          trail.push(record(('branch-22' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-22' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-23': {
        const local = 23;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '24') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-23' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '24') as BranchCode,
          };
          trail.push(record(('branch-23' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-23' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-24': {
        const local = 24;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '25') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-24' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '25') as BranchCode,
          };
          trail.push(record(('branch-24' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-24' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-25': {
        const local = 25;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '26') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-25' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '26') as BranchCode,
          };
          trail.push(record(('branch-25' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-25' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-26': {
        const local = 26;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '27') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-26' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '27') as BranchCode,
          };
          trail.push(record(('branch-26' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-26' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-27': {
        const local = 27;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '28') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-27' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '28') as BranchCode,
          };
          trail.push(record(('branch-27' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-27' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-28': {
        const local = 28;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '29') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-28' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '29') as BranchCode,
          };
          trail.push(record(('branch-28' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-28' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-29': {
        const local = 29;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '30') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-29' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '30') as BranchCode,
          };
          trail.push(record(('branch-29' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-29' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-30': {
        const local = 30;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '31') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-30' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '31') as BranchCode,
          };
          trail.push(record(('branch-30' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-30' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-31': {
        const local = 31;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '32') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-31' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '32') as BranchCode,
          };
          trail.push(record(('branch-31' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-31' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-32': {
        const local = 32;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '33') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-32' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '33') as BranchCode,
          };
          trail.push(record(('branch-32' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-32' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-33': {
        const local = 33;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '34') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-33' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '34') as BranchCode,
          };
          trail.push(record(('branch-33' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-33' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-34': {
        const local = 34;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '35') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-34' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '35') as BranchCode,
          };
          trail.push(record(('branch-34' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-34' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-35': {
        const local = 35;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '36') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-35' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '36') as BranchCode,
          };
          trail.push(record(('branch-35' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-35' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-36': {
        const local = 36;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '37') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-36' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '37') as BranchCode,
          };
          trail.push(record(('branch-36' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-36' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-37': {
        const local = 37;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '38') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-37' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '38') as BranchCode,
          };
          trail.push(record(('branch-37' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-37' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-38': {
        const local = 38;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '39') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-38' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '39') as BranchCode,
          };
          trail.push(record(('branch-38' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-38' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-39': {
        const local = 39;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '40') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-39' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '40') as BranchCode,
          };
          trail.push(record(('branch-39' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-39' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-40': {
        const local = 40;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '41') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-40' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '41') as BranchCode,
          };
          trail.push(record(('branch-40' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-40' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-41': {
        const local = 41;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '42') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-41' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '42') as BranchCode,
          };
          trail.push(record(('branch-41' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-41' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-42': {
        const local = 42;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '43') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-42' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '43') as BranchCode,
          };
          trail.push(record(('branch-42' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-42' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-43': {
        const local = 43;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '44') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-43' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '44') as BranchCode,
          };
          trail.push(record(('branch-43' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-43' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-44': {
        const local = 44;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '45') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-44' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '45') as BranchCode,
          };
          trail.push(record(('branch-44' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-44' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-45': {
        const local = 45;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '46') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-45' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '46') as BranchCode,
          };
          trail.push(record(('branch-45' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-45' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-46': {
        const local = 46;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '47') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-46' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '47') as BranchCode,
          };
          trail.push(record(('branch-46' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-46' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-47': {
        const local = 47;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '48') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-47' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '48') as BranchCode,
          };
          trail.push(record(('branch-47' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-47' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-48': {
        const local = 48;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '49') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-48' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '49') as BranchCode,
          };
          trail.push(record(('branch-48' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-48' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-49': {
        const local = 49;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '50') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-49' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '50') as BranchCode,
          };
          trail.push(record(('branch-49' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-49' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-50': {
        const local = 50;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '51') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-50' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '51') as BranchCode,
          };
          trail.push(record(('branch-50' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-50' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-51': {
        const local = 51;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '52') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-51' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '52') as BranchCode,
          };
          trail.push(record(('branch-51' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-51' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-52': {
        const local = 52;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '53') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-52' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '53') as BranchCode,
          };
          trail.push(record(('branch-52' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-52' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-53': {
        const local = 53;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '54') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-53' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '54') as BranchCode,
          };
          trail.push(record(('branch-53' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-53' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-54': {
        const local = 54;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '55') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-54' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '55') as BranchCode,
          };
          trail.push(record(('branch-54' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-54' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-55': {
        const local = 55;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '56') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-55' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '56') as BranchCode,
          };
          trail.push(record(('branch-55' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-55' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-56': {
        const local = 56;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '57') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-56' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '57') as BranchCode,
          };
          trail.push(record(('branch-56' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-56' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-57': {
        const local = 57;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '58') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-57' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '58') as BranchCode,
          };
          trail.push(record(('branch-57' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-57' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-58': {
        const local = 58;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '59') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-58' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '59') as BranchCode,
          };
          trail.push(record(('branch-58' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-58' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-59': {
        const local = 59;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '60') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-59' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '60') as BranchCode,
          };
          trail.push(record(('branch-59' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-59' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
      case 'branch-60': {
        const local = 60;
        const branchScore = input.score + local;
        const severityPass =
          input.severity === 'critical'
            ? branchScore > 5
            : input.severity === 'high'
              ? branchScore > 15
              : input.severity === 'medium'
                ? branchScore > 25
                : branchScore > 35;

        if (severityPass && input.enabled) {
          const accepted = local % 3 !== 0;
          const decision = accepted
            ? {
                accepted: true,
                reason: local % 2 === 0 ? 'ack' : 'retry',
                next: local < 60 ? ('branch-' + '01') as BranchCode : undefined,
              }
            : {
                accepted: false,
                reason: local % 2 === 0 ? 'fallback' : 'blocked',
                next: undefined,
              };
          trail.push(record(('branch-60' as BranchCode), decision));
          return { input: { ...input, domain: baseDomain }, decision, trail };
        }

        if (local % 5 === 0 && input.retries < 2) {
          const decision = {
            accepted: false,
            reason: 'retry',
            next: ('branch-' + '01') as BranchCode,
          };
          trail.push(record(('branch-60' as BranchCode), decision));
          return fallback(decision);
        }

        if (local % 7 === 0) {
          const decision = { accepted: false, reason: 'blocked' as const, next: undefined };
          trail.push(record(('branch-60' as BranchCode), decision));
          return fallback(decision);
        }

        break;
      }
    }

    const terminalCode = input.code;
    const finalDecision: BranchDecision = { accepted: true, reason: 'ack', next: undefined };
    trail.push(record(terminalCode, finalDecision));
    return {
      input,
      decision: finalDecision,
      trail,
    };
  } catch (error) {
    trail.push({
      id: input.code,
      decision: { accepted: false, reason: 'blocked', next: undefined },
      elapsedMs: Date.now() - start,
      severity: 'critical',
    });
    return {
      input: { ...input, trace: [...input.trace, String(error)] },
      decision: { accepted: false, reason: 'blocked', next: undefined },
      trail,
    };
  } finally {
    if (trail.length > 0 && trail.every((entry) => entry.decision.accepted)) {
      trail.push({
        id: input.code,
        decision: { accepted: true, reason: 'ack', next: undefined },
        elapsedMs: Date.now() - start,
        severity: input.severity,
      });
    }
  }
}

export const branchMatrix = branchUnion.reduce((acc, code) => {
  const parsed = code.split('-')[1] ?? '00';
  const n = Number(parsed);
  const payload: BranchPayload = {
    code,
    domain: branchDomain(code),
    score: n,
    enabled: n % 2 === 0,
    message: 'branch-' + parsed + '-payload',
  };
  acc.push(payload);
  return acc;
}, [] as BranchPayload[]);

export const buildBranchTrace = () =>
  branchMatrix
    .slice(0, 20)
    .map((entry) => ({
      code: entry.code,
      domain: entry.domain,
      decision: evaluateBranchInput({
        code: entry.code,
        domain: entry.domain,
        severity: entry.score % 4 === 0 ? 'critical' : entry.score % 3 === 0 ? 'high' : entry.score % 2 === 0 ? 'medium' : 'low',
        score: entry.score,
        retries: entry.score % 5,
        trace: [entry.message, entry.code],
        payload: { token: entry.code },
        enabled: entry.enabled,
      }),
    }));
