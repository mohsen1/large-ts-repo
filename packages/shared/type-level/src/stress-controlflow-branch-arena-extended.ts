export type BranchToken =
  | 'branch-01'
  | 'branch-02'
  | 'branch-03'
  | 'branch-04'
  | 'branch-05'
  | 'branch-06'
  | 'branch-07'
  | 'branch-08'
  | 'branch-09'
  | 'branch-10'
  | 'branch-11'
  | 'branch-12'
  | 'branch-13'
  | 'branch-14'
  | 'branch-15'
  | 'branch-16'
  | 'branch-17'
  | 'branch-18'
  | 'branch-19'
  | 'branch-20'
  | 'branch-21'
  | 'branch-22'
  | 'branch-23'
  | 'branch-24'
  | 'branch-25'
  | 'branch-26'
  | 'branch-27'
  | 'branch-28'
  | 'branch-29'
  | 'branch-30'
  | 'branch-31'
  | 'branch-32'
  | 'branch-33'
  | 'branch-34'
  | 'branch-35'
  | 'branch-36'
  | 'branch-37'
  | 'branch-38'
  | 'branch-39'
  | 'branch-40'
  | 'branch-41'
  | 'branch-42'
  | 'branch-43'
  | 'branch-44'
  | 'branch-45';

export type BranchSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface BranchContext {
  readonly token: BranchToken;
  readonly level: number;
  readonly region: 'us-east' | 'eu-west' | 'ap-south';
  readonly healthy: boolean;
  readonly retries: number;
  readonly metadata: Record<string, string>;
  readonly checks: readonly number[];
}

export interface BranchTrace {
  token: BranchToken;
  severity: BranchSeverity;
  score: number;
  route: string;
  attempts: number;
}

export const classifyToken = (token: BranchToken, context: BranchContext): BranchSeverity => {
  if (context.level > 80 && context.healthy) {
    return token >= 'branch-30' ? 'low' : 'medium';
  }
  if (context.region === 'us-east' && context.retries > 2) {
    return token < 'branch-15' ? 'high' : 'critical';
  }
  if (!context.healthy) {
    return context.level > 40 ? 'high' : 'critical';
  }
  if (context.retries === 0) {
    return token.endsWith('1') ? 'medium' : 'low';
  }
  if (context.checks.length > 12 && context.checks.every((value) => value > 0)) {
    return token > 'branch-30' ? 'low' : 'medium';
  }
  return token.endsWith('5') ? 'high' : 'low';
};

export const executeBranchGrid = (token: BranchToken, context: BranchContext): BranchTrace => {
  let score = context.level;
  let attempts = 0;
  const route = `/${context.region}/${token}/${context.token}`;
  const trace: BranchTrace = {
    token,
    severity: 'low',
    score,
    route,
    attempts,
  };
  try {
    for (let cycle = 0; cycle < Math.min(context.checks.length, 6); cycle += 1) {
      attempts += 1;
      const sample = context.checks[cycle] ?? cycle;
      if (sample < 0) {
        score -= 1;
      } else if (sample === 0) {
        score += 1;
      } else if (sample > 10) {
        score += 2;
      } else {
        score += sample;
      }
    }

    if (context.healthy && context.region === 'us-east') {
      if (context.level > 70) {
        score += 7;
      } else if (context.level > 35) {
        score += 3;
      } else {
        score += 1;
      }
    } else if (!context.healthy) {
      score -= 5;
    }

    switch (token) {
      case 'branch-01':
        trace.attempts = attempts;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-02':
        trace.attempts = attempts + 1;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-03':
        trace.attempts = attempts + 2;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-04':
        trace.attempts = attempts + 3;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-05':
        trace.attempts = attempts + 4;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-06':
        trace.attempts = attempts + 5;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-07':
        trace.attempts = attempts + 6;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-08':
        trace.attempts = attempts + 7;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-09':
        trace.attempts = attempts + 8;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-10':
        trace.attempts = attempts + 9;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-11':
        trace.attempts = attempts + 10;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-12':
        trace.attempts = attempts + 11;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-13':
        trace.attempts = attempts + 12;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-14':
        trace.attempts = attempts + 13;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-15':
        trace.attempts = attempts + 14;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-16':
        trace.attempts = attempts + 15;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-17':
        trace.attempts = attempts + 16;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-18':
        trace.attempts = attempts + 17;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-19':
        trace.attempts = attempts + 18;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-20':
        trace.attempts = attempts + 19;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-21':
        trace.attempts = attempts + 20;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-22':
        trace.attempts = attempts + 21;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-23':
        trace.attempts = attempts + 22;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-24':
        trace.attempts = attempts + 23;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-25':
        trace.attempts = attempts + 24;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-26':
        trace.attempts = attempts + 25;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-27':
        trace.attempts = attempts + 26;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-28':
        trace.attempts = attempts + 27;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-29':
        trace.attempts = attempts + 28;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-30':
        trace.attempts = attempts + 29;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-31':
        trace.attempts = attempts + 30;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-32':
        trace.attempts = attempts + 31;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-33':
        trace.attempts = attempts + 32;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-34':
        trace.attempts = attempts + 33;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-35':
        trace.attempts = attempts + 34;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-36':
        trace.attempts = attempts + 35;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-37':
        trace.attempts = attempts + 36;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-38':
        trace.attempts = attempts + 37;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-39':
        trace.attempts = attempts + 38;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-40':
        trace.attempts = attempts + 39;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-41':
        trace.attempts = attempts + 40;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-42':
        trace.attempts = attempts + 41;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-43':
        trace.attempts = attempts + 42;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-44':
        trace.attempts = attempts + 43;
        trace.severity = classifyToken(token, context);
        break;
      case 'branch-45':
        trace.attempts = attempts + 44;
        trace.severity = classifyToken(token, context);
        break;
      default:
        trace.severity = 'low';
        trace.attempts = attempts;
        break;
    }

    if (context.region === 'eu-west' && context.retries > 1) {
      trace.score = score + trace.attempts;
    } else if (context.region === 'ap-south') {
      trace.score = score - trace.attempts;
    } else {
      trace.score = score;
    }

    if (trace.severity === 'critical' && context.checks.length > 3) {
      trace.score += 13;
    }
  } catch (_error) {
    trace.severity = 'critical';
    trace.attempts = attempts + 99;
    trace.score = -1;
  }
  return trace;
};

export const routeConstellationGrid = [
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
] as const;

export const branchMap = routeConstellationGrid.map((token) => token as BranchToken);
