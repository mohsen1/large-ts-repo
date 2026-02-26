import {
  atlasRouteCatalogRoutes,
  type AtlasIntersectionGrid,
  type AtlasHierarchyChain,
  type RecoveryCommand,
  type RecoveryRoute,
} from '@shared/type-level/stress-synthetic-atlas';

type MatrixCell = {
  readonly row: number;
  readonly column: number;
  readonly value: number;
  readonly enabled: boolean;
  readonly state: 'on' | 'off' | 'warn';
};

export interface ControlMatrixInput {
  readonly seed: number;
  readonly size: number;
  readonly mode: 'scan' | 'route' | 'reconcile' | 'audit';
}

export interface ControlMatrixResult {
  readonly seed: number;
  readonly summary: number;
  readonly warnings: number;
  readonly cells: readonly MatrixCell[];
  readonly routes: readonly RecoveryRoute[];
  readonly hierarchy: AtlasHierarchyChain;
  readonly intersections: AtlasIntersectionGrid;
}

export type MatrixCommandMap = {
  [K in RecoveryCommand]: readonly RecoveryRoute[];
};

const commandBuckets = atlasRouteCatalogRoutes.reduce((acc, route) => {
  const command = route.split(':')[0] as RecoveryCommand;
  const existing = acc[command] ?? [];
  acc[command] = [...existing, route];
  return acc;
}, {} as MatrixCommandMap);

const commandGroups = Object.entries(commandBuckets).map(([command, routes]) => ({
  command: command as RecoveryCommand,
  routes,
}));

export const classifyCell = (value: number, threshold: number): 'on' | 'off' | 'warn' => {
  if (value > threshold) return 'on';
  if (value === threshold) return 'warn';
  return 'off';
};

export const executeCell = (cell: MatrixCell, command: RecoveryCommand, route: RecoveryRoute): MatrixCell => {
  const commandWeight = command.length * 3;
  const routeWeight = route.length;
  const updated = (cell.value + commandWeight + routeWeight) % 17;
  const state = classifyCell(updated, 12);
  return {
    ...cell,
    value: updated,
    enabled: state !== 'off',
    state,
  };
};

const resolveBySwitch = (input: ControlMatrixInput, index: number): number => {
  const offset = input.size % 11;
  switch (input.mode) {
    case 'scan':
      return offset + index + 1;
    case 'route':
      return offset + index * 2;
    case 'reconcile':
      return offset + index * 3;
    case 'audit':
      return offset + index * 4;
    default: {
      const _never: never = input.mode;
      return offset + String(_never).length;
    }
  }
};

const classifyRoute = (route: RecoveryRoute): number => {
  if (route.startsWith('boot:')) return 1;
  if (route.startsWith('recover:')) return 2;
  if (route.startsWith('restore:')) return 3;
  if (route.startsWith('snapshot:')) return 4;
  if (route.startsWith('drill:')) return 5;
  if (route.startsWith('compact:')) return 6;
  if (route.startsWith('observe:')) return 7;
  if (route.startsWith('publish:')) return 8;
  if (route.startsWith('notify:')) return 9;
  if (route.startsWith('synchronize:')) return 10;
  if (route.startsWith('simulate:')) return 11;
  if (route.startsWith('verify:')) return 12;
  if (route.startsWith('seal:')) return 13;
  if (route.startsWith('continue:')) return 14;
  if (route.startsWith('adapt:')) return 15;
  if (route.startsWith('quarantine:')) return 16;
  if (route.startsWith('route:')) return 17;
  if (route.startsWith('ingest:')) return 18;
  if (route.startsWith('drain:')) return 19;
  if (route.startsWith('handoff:')) return 20;
  if (route.startsWith('degrade:')) return 21;
  if (route.startsWith('evacuate:')) return 22;
  if (route.startsWith('isolate:')) return 23;
  if (route.startsWith('rollback:')) return 24;
  if (route.startsWith('rebalance:')) return 25;
  if (route.startsWith('failover:')) return 26;
  if (route.startsWith('resume:')) return 27;
  if (route.startsWith('throttle:')) return 28;
  if (route.startsWith('compact:')) return 29;
  if (route.startsWith('seal:')) return 30;
  if (route.startsWith('shutdown:')) return 31;
  if (route.startsWith('reboot:')) return 32;
  if (route.startsWith('assess:')) return 33;
  if (route.startsWith('contain:')) return 34;
  if (route.startsWith('isolate:')) return 35;
  if (route.startsWith('audit:')) return 36;
  if (route.startsWith('hydrate:')) return 37;
  if (route.startsWith('stabilize:')) return 38;
  if (route.startsWith('drill:')) return 39;
  if (route.startsWith('handoff:')) return 40;
  if (route.startsWith('promote:')) return 41;
  if (route.startsWith('elevate:')) return 42;
  if (route.startsWith('degrade:')) return 43;
  if (route.startsWith('snapshot:')) return 44;
  if (route.startsWith('publish:')) return 45;
  if (route.startsWith('compact:')) return 46;
  if (route.startsWith('drain:')) return 47;
  if (route.startsWith('publish:')) return 48;
  if (route.startsWith('notify:')) return 49;
  if (route.startsWith('quarantine:')) return 50;
  return 99;
};

const evaluateRow = (input: ControlMatrixInput, command: RecoveryCommand, route: RecoveryRoute, offset: number, row: number): MatrixCell[] => {
  const results: MatrixCell[] = [];
  const base = command.length + route.length + offset;
  for (let column = 0; column < input.size; column += 1) {
    const step = resolveBySwitch(input, column);
    const updated = (base + step + row + column + classifyRoute(route)) % 53;
    const state = classifyCell(updated, 18);
    results.push({
      row,
      column,
      value: updated,
      enabled: state === 'on' || state === 'warn',
      state,
    });
  }
  return results;
};

const safeRows = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (value < 0) {
    return 0;
  }
  if (value > 100) {
    return 100;
  }
  return Math.floor(value);
};

export const compileControlMatrix = (input: ControlMatrixInput): ControlMatrixResult => {
  const cells: MatrixCell[] = [];
  const rows = safeRows(input.size || 10);
  const commands = commandGroups.map((group) => group.command);
  let warnings = 0;
  let summary = 0;

  const routeRows: RecoveryRoute[] = [];
  for (let row = 0; row < rows; row += 1) {
    const command = commands[row % commands.length] ?? commands[0];
    const candidates = commandBuckets[command] ?? [];
    for (const [routeIndex, route] of candidates.entries()) {
      const rowCells = evaluateRow(input, command, route, row + input.seed, row + routeIndex);
      for (const cell of rowCells) {
        if (cell.state === 'warn') {
          warnings += 1;
        }
        if (cell.enabled) {
          summary += cell.value;
        }
        cells.push(executeCell(cell, command, route));
        if (routeIndex % 3 === 0) {
          routeRows.push(route);
        }
      }
      if (rows > 0 && routeIndex > rows) {
        break;
      }
    }
    if (routeRows.length > input.size * 2) {
      break;
    }
  }

  return {
    seed: input.seed,
    summary,
    warnings,
    cells,
    routes: routeRows,
    hierarchy: {
      depth: 10,
      label: 'atlas-depth-10',
    },
    intersections: {
      alpha: { token: 'alpha', scale: 1 },
      beta: { token: 'beta', scale: 2 },
      gamma: { token: 'gamma', scale: 3 },
      delta: { token: 'delta', scale: 4 },
      epsilon: { token: 'epsilon', scale: 5 },
      zeta: { token: 'zeta', scale: 6 },
      eta: { token: 'eta', scale: 7 },
      theta: { token: 'theta', scale: 8 },
      iota: { token: 'iota', scale: 9 },
      kappa: { token: 'kappa', scale: 10 },
      lambda: { token: 'lambda', scale: 11 },
      mu: { token: 'mu', scale: 12 },
      nu: { token: 'nu', scale: 13 },
      xi: { token: 'xi', scale: 14 },
      omicron: { token: 'omicron', scale: 15 },
      pi: { token: 'pi', scale: 16 },
      rho: { token: 'rho', scale: 17 },
      sigma: { token: 'sigma', scale: 18 },
      tau: { token: 'tau', scale: 19 },
      upsilon: { token: 'upsilon', scale: 20 },
    },
  };
};

export const executeControlPlane = (
  input: ControlMatrixInput,
): readonly {
  readonly summary: number;
  readonly warnings: number;
  readonly matrixSize: number;
  readonly routeCount: number;
}[] => {
  const compiled = compileControlMatrix(input);
  const out: Array<{
    readonly summary: number;
    readonly warnings: number;
    readonly matrixSize: number;
    readonly routeCount: number;
  }> = [];

  let current = 0;
  for (const cell of compiled.cells) {
    if (!cell.enabled) {
      continue;
    }
    current += cell.value;
    if (current % 2 === 0) {
      out.push({
        summary: compiled.summary,
        warnings: compiled.warnings,
        matrixSize: compiled.cells.length,
        routeCount: compiled.routes.length,
      });
      if (out.length > 7) {
        break;
      }
    }
  }
  return out;
};

export const compareMatrix = (left: number, right: number): 'higher' | 'lower' | 'equal' => {
  if (left > right) {
    return 'higher';
  }
  if (left < right) {
    return 'lower';
  }
  return 'equal';
};

export const summarizeControlMatrices = (): {
  readonly audit: ReturnType<typeof compileControlMatrix>;
  readonly scan: ReturnType<typeof compileControlMatrix>;
  readonly reconcile: ReturnType<typeof compileControlMatrix>;
} => {
  const audit = compileControlMatrix({ seed: 3, size: 16, mode: 'audit' });
  const scan = compileControlMatrix({ seed: 5, size: 12, mode: 'scan' });
  const reconcile = compileControlMatrix({ seed: 8, size: 8, mode: 'reconcile' });
  return { audit, scan, reconcile };
};
