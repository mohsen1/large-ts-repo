export type BranchKind =
  | 'alpha'
  | 'beta'
  | 'gamma'
  | 'delta'
  | 'epsilon'
  | 'zeta'
  | 'eta'
  | 'theta'
  | 'iota'
  | 'kappa'
  | 'lambda'
  | 'mu'
  | 'nu'
  | 'xi'
  | 'omicron'
  | 'pi'
  | 'rho'
  | 'sigma'
  | 'tau'
  | 'upsilon'
  | 'phi'
  | 'chi'
  | 'psi'
  | 'omega'
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
  | 'branch-45'
  | 'branch-46'
  | 'branch-47'
  | 'branch-48'
  | 'branch-49'
  | 'branch-50';

export type BranchEventBase = {
  readonly payload: string;
  readonly attempts: number;
};

export type BranchEvent =
  | ({ [K in BranchKind]: BranchEventBase & { readonly kind: K } })[BranchKind]
  | ({
      readonly kind: 'retry';
      readonly payload: string;
      readonly attempts: number;
      readonly retryWindowMs: number;
    } & BranchEventBase);

export interface BranchResult {
  readonly kind: BranchKind;
  readonly weight: number;
  readonly accepted: boolean;
  readonly metadata: string;
  readonly next?: BranchKind;
}

export const resolveBranch = (event: BranchEvent): BranchResult => {
  switch (event.kind) {
    case 'alpha':
      return { kind: 'alpha', weight: 1, accepted: event.attempts < 2, metadata: `alpha:${event.payload}` };
    case 'beta':
      return { kind: 'beta', weight: 2, accepted: event.attempts < 3, metadata: `beta:${event.payload}` };
    case 'gamma':
      return { kind: 'gamma', weight: 3, accepted: event.attempts < 4, metadata: `gamma:${event.payload}` };
    case 'delta':
      return { kind: 'delta', weight: 4, accepted: event.attempts < 5, metadata: `delta:${event.payload}` };
    case 'epsilon':
      return { kind: 'epsilon', weight: 5, accepted: event.attempts < 6, metadata: `epsilon:${event.payload}` };
    case 'zeta':
      return { kind: 'zeta', weight: 6, accepted: event.attempts < 7, metadata: `zeta:${event.payload}` };
    case 'eta':
      return { kind: 'eta', weight: 7, accepted: event.attempts < 8, metadata: `eta:${event.payload}` };
    case 'theta':
      return { kind: 'theta', weight: 8, accepted: event.attempts < 9, metadata: `theta:${event.payload}` };
    case 'iota':
      return { kind: 'iota', weight: 9, accepted: event.attempts < 10, metadata: `iota:${event.payload}` };
    case 'kappa':
      return { kind: 'kappa', weight: 10, accepted: event.attempts < 11, metadata: `kappa:${event.payload}` };
    case 'lambda':
      return { kind: 'lambda', weight: 11, accepted: event.attempts < 12, metadata: `lambda:${event.payload}` };
    case 'mu':
      return { kind: 'mu', weight: 12, accepted: event.attempts < 13, metadata: `mu:${event.payload}` };
    case 'nu':
      return { kind: 'nu', weight: 13, accepted: event.attempts < 14, metadata: `nu:${event.payload}` };
    case 'xi':
      return { kind: 'xi', weight: 14, accepted: event.attempts < 15, metadata: `xi:${event.payload}` };
    case 'omicron':
      return { kind: 'omicron', weight: 15, accepted: event.attempts < 16, metadata: `omicron:${event.payload}` };
    case 'pi':
      return { kind: 'pi', weight: 16, accepted: event.attempts < 17, metadata: `pi:${event.payload}` };
    case 'rho':
      return { kind: 'rho', weight: 17, accepted: event.attempts < 18, metadata: `rho:${event.payload}` };
    case 'sigma':
      return { kind: 'sigma', weight: 18, accepted: event.attempts < 19, metadata: `sigma:${event.payload}` };
    case 'tau':
      return { kind: 'tau', weight: 19, accepted: event.attempts < 20, metadata: `tau:${event.payload}` };
    case 'upsilon':
      return { kind: 'upsilon', weight: 20, accepted: event.attempts < 21, metadata: `upsilon:${event.payload}` };
    case 'phi':
      return { kind: 'phi', weight: 21, accepted: event.attempts < 22, metadata: `phi:${event.payload}` };
    case 'chi':
      return { kind: 'chi', weight: 22, accepted: event.attempts < 23, metadata: `chi:${event.payload}` };
    case 'psi':
      return { kind: 'psi', weight: 23, accepted: event.attempts < 24, metadata: `psi:${event.payload}` };
    case 'omega':
      return { kind: 'omega', weight: 24, accepted: event.attempts < 25, metadata: `omega:${event.payload}` };
    case 'branch-24':
      return { kind: 'branch-24', weight: 25, accepted: event.attempts < 26, metadata: `b24:${event.payload}` };
    case 'branch-25':
      return { kind: 'branch-25', weight: 26, accepted: event.attempts < 27, metadata: `b25:${event.payload}` };
    case 'branch-26':
      return { kind: 'branch-26', weight: 27, accepted: event.attempts < 28, metadata: `b26:${event.payload}` };
    case 'branch-27':
      return { kind: 'branch-27', weight: 28, accepted: event.attempts < 29, metadata: `b27:${event.payload}` };
    case 'branch-28':
      return { kind: 'branch-28', weight: 29, accepted: event.attempts < 30, metadata: `b28:${event.payload}` };
    case 'branch-29':
      return { kind: 'branch-29', weight: 30, accepted: event.attempts < 31, metadata: `b29:${event.payload}` };
    case 'branch-30':
      return { kind: 'branch-30', weight: 31, accepted: event.attempts < 32, metadata: `b30:${event.payload}` };
    case 'branch-31':
      return { kind: 'branch-31', weight: 32, accepted: event.attempts < 33, metadata: `b31:${event.payload}` };
    case 'branch-32':
      return { kind: 'branch-32', weight: 33, accepted: event.attempts < 34, metadata: `b32:${event.payload}` };
    case 'branch-33':
      return { kind: 'branch-33', weight: 34, accepted: event.attempts < 35, metadata: `b33:${event.payload}` };
    case 'branch-34':
      return { kind: 'branch-34', weight: 35, accepted: event.attempts < 36, metadata: `b34:${event.payload}` };
    case 'branch-35':
      return { kind: 'branch-35', weight: 36, accepted: event.attempts < 37, metadata: `b35:${event.payload}` };
    case 'branch-36':
      return { kind: 'branch-36', weight: 37, accepted: event.attempts < 38, metadata: `b36:${event.payload}` };
    case 'branch-37':
      return { kind: 'branch-37', weight: 38, accepted: event.attempts < 39, metadata: `b37:${event.payload}` };
    case 'branch-38':
      return { kind: 'branch-38', weight: 39, accepted: event.attempts < 40, metadata: `b38:${event.payload}` };
    case 'branch-39':
      return { kind: 'branch-39', weight: 40, accepted: event.attempts < 41, metadata: `b39:${event.payload}` };
    case 'branch-40':
      return { kind: 'branch-40', weight: 41, accepted: event.attempts < 42, metadata: `b40:${event.payload}` };
    case 'branch-41':
      return { kind: 'branch-41', weight: 42, accepted: event.attempts < 43, metadata: `b41:${event.payload}` };
    case 'branch-42':
      return { kind: 'branch-42', weight: 43, accepted: event.attempts < 44, metadata: `b42:${event.payload}` };
    case 'branch-43':
      return { kind: 'branch-43', weight: 44, accepted: event.attempts < 45, metadata: `b43:${event.payload}` };
    case 'branch-44':
      return { kind: 'branch-44', weight: 45, accepted: event.attempts < 46, metadata: `b44:${event.payload}` };
    case 'branch-45':
      return { kind: 'branch-45', weight: 46, accepted: event.attempts < 47, metadata: `b45:${event.payload}` };
    case 'branch-46':
      return { kind: 'branch-46', weight: 47, accepted: event.attempts < 48, metadata: `b46:${event.payload}` };
    case 'branch-47':
      return { kind: 'branch-47', weight: 48, accepted: event.attempts < 49, metadata: `b47:${event.payload}` };
    case 'branch-48':
      return { kind: 'branch-48', weight: 49, accepted: event.attempts < 50, metadata: `b48:${event.payload}` };
    case 'branch-49':
      return { kind: 'branch-49', weight: 50, accepted: event.attempts < 51, metadata: `b49:${event.payload}` };
    case 'branch-50':
      return { kind: 'branch-50', weight: 51, accepted: event.attempts < 52, metadata: `b50:${event.payload}` };
    default:
      return { kind: 'alpha', weight: 0, accepted: false, metadata: 'unknown-event' };
  }
};

export const evaluateBranches = (events: readonly BranchEvent[]): BranchResult[] => {
  return events
    .map((event): BranchResult => {
      if (event.kind === 'alpha') {
        return { kind: 'alpha', weight: event.attempts * 2, accepted: true, metadata: event.payload };
      }
      if (event.kind === 'beta' || event.kind === 'gamma') {
        const branch = resolveBranch(event);
        return {
          ...branch,
          metadata: `${branch.metadata}:rechecked`,
          accepted: event.attempts < 1 ? false : branch.accepted,
        };
      }
      if (event.kind.startsWith('branch-')) {
        const kind = event.kind as BranchKind;
        const parsed = parseInt(event.kind.slice(7), 10);
        if (parsed % 2 === 0) {
          return { kind, weight: parsed, accepted: event.attempts === parsed, metadata: `${event.payload}:even` };
        }
        return { kind, weight: parsed + 1, accepted: event.attempts > parsed, metadata: `${event.payload}:odd` };
      }
      if (event.kind === 'retry') {
        return { kind: 'epsilon', weight: 0, accepted: event.attempts < (event.retryWindowMs % 60), metadata: 'retry' };
      }
      return resolveBranch(event as BranchEvent & { kind: BranchKind });
    });
};

export const branchMatrix = (items: readonly BranchEvent[]): number => {
  return evaluateBranches(items).reduce((acc, current) => {
    if (!current.accepted) {
      return acc;
    }
    if (current.next) {
      return acc + current.weight + (current.next.includes('branch') ? 1 : 0);
    }
    return acc + current.weight;
  }, 0);
};
