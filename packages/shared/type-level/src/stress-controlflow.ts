import { Brand } from './patterns';

export type ControlDomain = 'agent' | 'mesh' | 'playbook' | 'policy' | 'observability';
export type ControlAction = 'start' | 'check' | 'warn' | 'fail' | 'recover' | 'verify' | 'resolve' | 'finalize';
export type ControlSeverity = 'low' | 'medium' | 'high' | 'critical' | 'emergency';

export type ControlEvent = {
  readonly id: Brand<string, 'control-event-id'>;
  readonly domain: ControlDomain;
  readonly action: ControlAction;
  readonly severity: ControlSeverity;
  readonly active: boolean;
  readonly metric: number;
  readonly tags: readonly string[];
};

export type ControlDecision =
  | { readonly kind: 'ignore'; readonly level: 0 }
  | { readonly kind: 'warn'; readonly level: 1 }
  | { readonly kind: 'escalate'; readonly level: 2 }
  | { readonly kind: 'isolate'; readonly level: 3 }
  | { readonly kind: 'recover'; readonly level: 4 }
  | { readonly kind: 'audit'; readonly level: 5 }
  | { readonly kind: 'shutdown'; readonly level: 6 }
  | { readonly kind: 'resolve'; readonly level: 2 };

const routeSwitch = (event: ControlEvent): ControlDecision => {
  const score =
    (event.active && event.metric > 70) || (!event.active && event.metric > 95)
      ? event.metric
      : (event.metric > 50 && event.action === 'warn') || event.tags.includes('manual') ? event.metric + 1 : event.metric - 1;

  const normalized = `${event.domain}-${event.action}-${event.severity}`;
  const shouldAutoRecover = normalized.includes('recover') && score > 40;
  const label = `${event.id}:${event.domain}:${event.action}`;

  if (!event.active && !event.tags.includes('hold')) {
    return { kind: 'ignore', level: 0 };
  }

  if (event.severity === 'emergency' || event.metric >= 95 || shouldAutoRecover) {
    return { kind: 'shutdown', level: 6 };
  }

  if (event.domain === 'mesh') {
    if (event.action === 'start' && event.metric > 70) {
      return { kind: 'recover', level: 4 };
    }

    if (event.action === 'check' && event.severity === 'critical') {
      return { kind: 'isolate', level: 3 };
    }

    if (event.metric > 60) {
      return { kind: 'warn', level: 1 };
    }

    return { kind: 'ignore', level: 0 };
  }

  switch (event.action) {
    case 'start': {
      if (event.severity === 'low' && event.metric < 30) {
        return { kind: 'ignore', level: 0 };
      }
      if (event.tags.includes('smoke')) {
        return { kind: 'warn', level: 1 };
      }
      return { kind: 'resolve', level: 2 };
    }
    case 'check': {
      const chain = event.tags.includes('retry') ? event.tags.length : 1;
      if (chain >= 3 && event.metric > 80) {
        return { kind: 'recover', level: 4 };
      }
      return event.metric > 30 ? { kind: 'warn', level: 1 } : { kind: 'ignore', level: 0 };
    }
    case 'warn': {
      if (event.tags.includes('compliance')) {
        return { kind: 'audit', level: 5 };
      }
      return event.metric > 60 ? { kind: 'escalate', level: 2 } : { kind: 'warn', level: 1 };
    }
    case 'fail': {
      if (event.metric > 90) {
        return { kind: 'shutdown', level: 6 };
      }
      if (event.metric > 60) {
        return { kind: 'isolate', level: 3 };
      }
      return { kind: 'warn', level: 1 };
    }
    case 'recover': {
      if (event.metric > 80 || event.severity === 'critical') {
        return { kind: 'recover', level: 4 };
      }
      return { kind: 'resolve', level: 2 };
    }
    case 'verify': {
      if (event.active && event.metric < 50) {
        return { kind: 'ignore', level: 0 };
      }
      return event.tags.includes('audit') ? { kind: 'audit', level: 5 } : { kind: 'resolve', level: 2 };
    }
    case 'resolve': {
      return event.metric > 20 ? { kind: 'resolve', level: 2 } : { kind: 'warn', level: 1 };
    }
    case 'finalize': {
      if (event.metric > 90) {
        return { kind: 'audit', level: 5 };
      }
      return { kind: 'ignore', level: 0 };
    }
    default: {
      return { kind: 'warn', level: 1 };
    }
  }
};

const evaluateDecision = (seed: number, decision: ControlDecision): number => {
  let score = seed;
  for (let i = 0; i < decision.level; i += 1) {
    score += i * 2;
    if (i % 2 === 0) {
      score -= 1;
    } else {
      score += 3;
    }
  }

  if (decision.kind === 'shutdown') {
    score += 100;
  } else if (decision.kind === 'audit') {
    score += 40;
  } else if (decision.kind === 'isolate') {
    score += 20;
  } else if (decision.kind === 'recover') {
    score += 10;
  } else if (decision.kind === 'warn') {
    score += 2;
  }

  return score;
};

export const evaluateControlGraph = (events: readonly ControlEvent[]): number => {
  let aggregate = 0;
  try {
    for (const event of events) {
      const decision = routeSwitch(event);
      let step = event.tags.length;
      while (step > 0) {
        if (event.metric > 50 && event.active) {
          aggregate += evaluateDecision(aggregate, decision);
        } else if (event.metric > 20 || event.tags.includes('forced')) {
          aggregate += evaluateDecision(aggregate % 10, decision);
        } else {
          aggregate += 1;
        }
        step -= 1;
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'RangeError') {
        aggregate = Number.NaN;
      } else if (error.message.includes('missing')) {
        aggregate = 0;
      }
    }
  } finally {
    aggregate = Number.isNaN(aggregate) ? 0 : aggregate;
  }
  return aggregate;
};

export const stressTruthiness = (event: ControlEvent | undefined | null): string => {
  if (!event) {
    return 'unresolved';
  }

  if (event.active && event.action && event.domain && event.metric) {
    return event.tags.length > 0 ? 'active' : 'active-empty';
  }

  const status = event.metric > 90 ? 'critical' : event.metric > 75 ? 'high' : event.metric > 55 ? 'elevated' : 'normal';
  return status;
};

export const buildControlFlowMatrix = (): readonly ControlDecision[] => {
  const actions = ['start', 'check', 'warn', 'fail', 'recover', 'verify', 'resolve', 'finalize'] as const;
  const domains = ['agent', 'mesh', 'playbook', 'policy', 'observability'] as const;
  const severities = ['low', 'medium', 'high', 'critical', 'emergency'] as const;
  const matrix: ControlDecision[] = [];

  for (const action of actions) {
    for (const domain of domains) {
      for (const severity of severities) {
        const decision = routeSwitch({
          id: `event-${action}-${domain}-${severity}` as Brand<string, 'control-event-id'>,
          domain: domain as ControlDomain,
          action: action as ControlAction,
          severity: severity as ControlSeverity,
          active: (action === 'start' || action === 'recover'),
          metric: (action === 'fail' ? 99 : action === 'warn' ? 76 : 43) + severity.length,
          tags: [domain, action],
        });
        matrix.push(decision);
      }
    }
  }

  return matrix;
};

export const runControlFlowSuite = (): {
  readonly matrix: readonly ControlDecision[];
  readonly score: number;
  readonly label: string;
} => {
  const matrix = buildControlFlowMatrix();
  const score = evaluateControlGraph(
    matrix.map((entry, index) => ({
      id: `m-${index}` as Brand<string, 'control-event-id'>,
      domain: (['agent', 'mesh', 'playbook', 'policy', 'observability'][index % 5] ?? 'agent') as ControlDomain,
      action: (['start', 'check', 'warn', 'fail', 'recover', 'verify', 'resolve', 'finalize'][index % 8] ??
        'start') as ControlAction,
      severity: (['low', 'medium', 'high', 'critical', 'emergency'][index % 5] ?? 'low') as ControlSeverity,
      active: index % 2 === 0,
      metric: 42 + index,
      tags: ['suite', entry.kind],
    })),
  );

  const label = matrix
    .reduce<string>((acc, entry, index) => `${acc}|${index}:${entry.kind}:${entry.level}`, '')
    .slice(1);

  return {
    matrix,
    score,
    label,
  };
};
