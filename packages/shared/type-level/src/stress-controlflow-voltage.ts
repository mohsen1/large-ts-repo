export type BranchSignal =
  | 'signal_00'
  | 'signal_01'
  | 'signal_02'
  | 'signal_03'
  | 'signal_04'
  | 'signal_05'
  | 'signal_06'
  | 'signal_07'
  | 'signal_08'
  | 'signal_09'
  | 'signal_10'
  | 'signal_11'
  | 'signal_12'
  | 'signal_13'
  | 'signal_14'
  | 'signal_15'
  | 'signal_16'
  | 'signal_17'
  | 'signal_18'
  | 'signal_19'
  | 'signal_20'
  | 'signal_21'
  | 'signal_22'
  | 'signal_23'
  | 'signal_24'
  | 'signal_25'
  | 'signal_26'
  | 'signal_27'
  | 'signal_28'
  | 'signal_29'
  | 'signal_30'
  | 'signal_31'
  | 'signal_32'
  | 'signal_33'
  | 'signal_34'
  | 'signal_35'
  | 'signal_36'
  | 'signal_37'
  | 'signal_38'
  | 'signal_39'
  | 'signal_40'
  | 'signal_41'
  | 'signal_42'
  | 'signal_43'
  | 'signal_44'
  | 'signal_45'
  | 'signal_46'
  | 'signal_47'
  | 'signal_48'
  | 'signal_49'
  | 'signal_50';

export type BranchKind =
  | 'critical'
  | 'degraded'
  | 'normal'
  | 'off'
  | 'warning';

export interface BranchFrame {
  readonly signal: BranchSignal;
  readonly severity: BranchKind;
  readonly score: number;
}

export interface BranchResult {
  readonly id: BranchSignal;
  readonly lane: 'alpha' | 'beta' | 'gamma' | 'delta' | 'epsilon';
  readonly cost: number;
  readonly active: boolean;
  readonly notes: string[];
}

export const branchProfiles: Record<BranchSignal, BranchFrame> = {
  signal_00: { signal: 'signal_00', severity: 'critical', score: 99 },
  signal_01: { signal: 'signal_01', severity: 'warning', score: 88 },
  signal_02: { signal: 'signal_02', severity: 'warning', score: 77 },
  signal_03: { signal: 'signal_03', severity: 'degraded', score: 66 },
  signal_04: { signal: 'signal_04', severity: 'degraded', score: 55 },
  signal_05: { signal: 'signal_05', severity: 'normal', score: 44 },
  signal_06: { signal: 'signal_06', severity: 'off', score: 33 },
  signal_07: { signal: 'signal_07', severity: 'normal', score: 22 },
  signal_08: { signal: 'signal_08', severity: 'critical', score: 98 },
  signal_09: { signal: 'signal_09', severity: 'warning', score: 89 },
  signal_10: { signal: 'signal_10', severity: 'warning', score: 78 },
  signal_11: { signal: 'signal_11', severity: 'degraded', score: 67 },
  signal_12: { signal: 'signal_12', severity: 'degraded', score: 56 },
  signal_13: { signal: 'signal_13', severity: 'normal', score: 45 },
  signal_14: { signal: 'signal_14', severity: 'off', score: 34 },
  signal_15: { signal: 'signal_15', severity: 'critical', score: 97 },
  signal_16: { signal: 'signal_16', severity: 'warning', score: 88 },
  signal_17: { signal: 'signal_17', severity: 'warning', score: 79 },
  signal_18: { signal: 'signal_18', severity: 'degraded', score: 68 },
  signal_19: { signal: 'signal_19', severity: 'degraded', score: 57 },
  signal_20: { signal: 'signal_20', severity: 'normal', score: 46 },
  signal_21: { signal: 'signal_21', severity: 'off', score: 35 },
  signal_22: { signal: 'signal_22', severity: 'critical', score: 96 },
  signal_23: { signal: 'signal_23', severity: 'warning', score: 87 },
  signal_24: { signal: 'signal_24', severity: 'warning', score: 76 },
  signal_25: { signal: 'signal_25', severity: 'degraded', score: 65 },
  signal_26: { signal: 'signal_26', severity: 'degraded', score: 54 },
  signal_27: { signal: 'signal_27', severity: 'normal', score: 43 },
  signal_28: { signal: 'signal_28', severity: 'off', score: 32 },
  signal_29: { signal: 'signal_29', severity: 'critical', score: 95 },
  signal_30: { signal: 'signal_30', severity: 'warning', score: 86 },
  signal_31: { signal: 'signal_31', severity: 'warning', score: 75 },
  signal_32: { signal: 'signal_32', severity: 'degraded', score: 64 },
  signal_33: { signal: 'signal_33', severity: 'degraded', score: 53 },
  signal_34: { signal: 'signal_34', severity: 'normal', score: 42 },
  signal_35: { signal: 'signal_35', severity: 'off', score: 31 },
  signal_36: { signal: 'signal_36', severity: 'critical', score: 94 },
  signal_37: { signal: 'signal_37', severity: 'warning', score: 85 },
  signal_38: { signal: 'signal_38', severity: 'warning', score: 74 },
  signal_39: { signal: 'signal_39', severity: 'degraded', score: 63 },
  signal_40: { signal: 'signal_40', severity: 'degraded', score: 52 },
  signal_41: { signal: 'signal_41', severity: 'normal', score: 41 },
  signal_42: { signal: 'signal_42', severity: 'off', score: 30 },
  signal_43: { signal: 'signal_43', severity: 'critical', score: 93 },
  signal_44: { signal: 'signal_44', severity: 'warning', score: 84 },
  signal_45: { signal: 'signal_45', severity: 'warning', score: 73 },
  signal_46: { signal: 'signal_46', severity: 'degraded', score: 62 },
  signal_47: { signal: 'signal_47', severity: 'degraded', score: 51 },
  signal_48: { signal: 'signal_48', severity: 'normal', score: 40 },
  signal_49: { signal: 'signal_49', severity: 'off', score: 29 },
  signal_50: { signal: 'signal_50', severity: 'critical', score: 92 },
};

export type BranchDecision<T extends BranchSignal> =
  T extends 'signal_00' | 'signal_03' | 'signal_06' | 'signal_09' | 'signal_12' | 'signal_15' | 'signal_18' | 'signal_21' | 'signal_24' | 'signal_27' | 'signal_30' | 'signal_33' | 'signal_36' | 'signal_39' | 'signal_42' | 'signal_45' | 'signal_48'
    ? 'alpha'
    : T extends
      | 'signal_01'
      | 'signal_04'
      | 'signal_07'
      | 'signal_10'
      | 'signal_13'
      | 'signal_16'
      | 'signal_19'
      | 'signal_22'
      | 'signal_25'
      | 'signal_28'
      | 'signal_31'
      | 'signal_34'
      | 'signal_37'
      | 'signal_40'
      | 'signal_43'
      | 'signal_46'
      | 'signal_49'
      ? 'beta'
      : T extends
'signal_02' | 'signal_05' | 'signal_08' | 'signal_11' | 'signal_14' | 'signal_17' | 'signal_20' | 'signal_23' | 'signal_26' | 'signal_29' | 'signal_32' | 'signal_35' | 'signal_38' | 'signal_41' | 'signal_44' | 'signal_47' | 'signal_50'
      ? 'gamma'
      : 'delta';

export const resolveBranch = (frame: BranchFrame): BranchResult => {
  const score = frame.score;
  switch (frame.signal) {
    case 'signal_00':
    case 'signal_01':
    case 'signal_02':
    case 'signal_03':
    case 'signal_04':
    case 'signal_05':
    case 'signal_06':
      if (score > 80) {
        return { id: frame.signal, lane: 'alpha', cost: 8, active: true, notes: ['hot-path'] };
      }
      return { id: frame.signal, lane: 'beta', cost: 5, active: true, notes: ['warm-path'] };
    case 'signal_07':
    case 'signal_08':
    case 'signal_09':
    case 'signal_10':
    case 'signal_11':
    case 'signal_12':
    case 'signal_13':
      if (frame.severity === 'critical') {
        return { id: frame.signal, lane: 'alpha', cost: 6, active: true, notes: ['critical'] };
      }
      if (frame.severity === 'warning') {
        return { id: frame.signal, lane: 'beta', cost: 4, active: true, notes: ['warning'] };
      }
      return { id: frame.signal, lane: 'gamma', cost: 3, active: false, notes: ['stable'] };
    case 'signal_14':
    case 'signal_15':
    case 'signal_16':
    case 'signal_17':
    case 'signal_18':
    case 'signal_19':
      if (frame.severity === 'off') {
        return { id: frame.signal, lane: 'delta', cost: 2, active: false, notes: ['disabled'] };
      }
      if (score > 60) {
        return { id: frame.signal, lane: 'alpha', cost: 7, active: true, notes: ['escalation'] };
      }
      return { id: frame.signal, lane: 'epsilon', cost: 5, active: true, notes: ['pending'] };
    case 'signal_20':
    case 'signal_21':
    case 'signal_22':
    case 'signal_23':
    case 'signal_24':
    case 'signal_25':
      switch (frame.severity) {
        case 'critical':
          return { id: frame.signal, lane: 'alpha', cost: 12, active: true, notes: ['nested-critical'] };
        case 'warning':
          return { id: frame.signal, lane: 'beta', cost: 8, active: true, notes: ['nested-warning'] };
        case 'degraded':
          return { id: frame.signal, lane: 'gamma', cost: 4, active: true, notes: ['nested-degraded'] };
        default:
          return { id: frame.signal, lane: 'delta', cost: 2, active: false, notes: ['nested-default'] };
      }
    case 'signal_26':
    case 'signal_27':
    case 'signal_28':
    case 'signal_29':
    case 'signal_30':
    case 'signal_31':
    case 'signal_32':
    case 'signal_33':
      if (frame.signal.endsWith('0') || frame.signal.endsWith('2') || frame.signal.endsWith('4') || frame.signal.endsWith('6') || frame.signal.endsWith('8')) {
        return { id: frame.signal, lane: 'epsilon', cost: 11, active: true, notes: ['even'] };
      }
      return { id: frame.signal, lane: 'gamma', cost: 6, active: true, notes: ['odd'] };
    case 'signal_34':
    case 'signal_35':
    case 'signal_36':
    case 'signal_37':
    case 'signal_38':
    case 'signal_39':
    case 'signal_40':
    case 'signal_41':
      if (frame.score > 90) {
        return { id: frame.signal, lane: 'alpha', cost: 10, active: true, notes: ['high-score'] };
      }
      if (frame.score > 70) {
        return { id: frame.signal, lane: 'beta', cost: 8, active: true, notes: ['medium-score'] };
      }
      if (frame.score > 50) {
        return { id: frame.signal, lane: 'gamma', cost: 6, active: true, notes: ['low-score'] };
      }
      return { id: frame.signal, lane: 'delta', cost: 2, active: true, notes: ['base-score'] };
    case 'signal_42':
    case 'signal_43':
    case 'signal_44':
    case 'signal_45':
    case 'signal_46':
    case 'signal_47':
    case 'signal_48':
    case 'signal_49':
    case 'signal_50':
      if (frame.severity === 'critical') {
        return { id: frame.signal, lane: 'alpha', cost: 9, active: true, notes: ['end-segment', 'critical'] };
      }
      if (frame.severity === 'warning') {
        return { id: frame.signal, lane: 'beta', cost: 7, active: true, notes: ['end-segment', 'warning'] };
      }
      if (frame.severity === 'degraded') {
        return { id: frame.signal, lane: 'gamma', cost: 5, active: true, notes: ['end-segment', 'degraded'] };
      }
      if (frame.severity === 'normal') {
        return { id: frame.signal, lane: 'delta', cost: 3, active: false, notes: ['end-segment', 'normal'] };
      }
      return { id: frame.signal, lane: 'epsilon', cost: 1, active: false, notes: ['end-segment', 'off'] };
    default:
      return { id: frame.signal, lane: 'delta', cost: 0, active: false, notes: ['unknown'] };
  }
};

export const evaluateBranches = (seed: BranchSignal[]): BranchResult[] => {
  const results: BranchResult[] = [];

  for (const signal of seed) {
    const profile = branchProfiles[signal];
    if (profile.severity === 'off' && profile.score < 40) {
      continue;
    }

    try {
      const result = resolveBranch(profile);
      for (let i = 0; i < (profile.score % 3) + 1; i++) {
        results.push({
          ...result,
          notes: [...result.notes, `iter-${i}`],
        });
      }
    } catch {
      results.push({ id: signal, lane: 'delta', cost: 1, active: false, notes: ['error'] });
    }

    const branchResult = ((): BranchResult => {
      if (Number(signal.slice(7)) >= 10 && Number(signal.slice(7)) <= 20) {
        return {
          id: signal,
          lane: 'epsilon',
          cost: 2,
          active: true,
          notes: ['range-branch'],
        };
      }
      return {
        id: signal,
        lane: 'gamma',
        cost: 2,
        active: true,
        notes: ['fallback'],
      };
    })();

    if (branchResult.lane === 'epsilon' && branchResult.cost > 1) {
      results.push(branchResult);
    }
  }

  return results;
};
