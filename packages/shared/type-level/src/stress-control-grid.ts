export type ControlOpcode =
  | 'A00'
  | 'A01'
  | 'A02'
  | 'A03'
  | 'A04'
  | 'A05'
  | 'A06'
  | 'A07'
  | 'A08'
  | 'A09'
  | 'A10'
  | 'A11'
  | 'A12'
  | 'A13'
  | 'A14'
  | 'A15'
  | 'A16'
  | 'A17'
  | 'A18'
  | 'A19'
  | 'A20'
  | 'A21'
  | 'A22'
  | 'A23'
  | 'A24'
  | 'A25'
  | 'A26'
  | 'A27'
  | 'A28'
  | 'A29'
  | 'A30'
  | 'A31'
  | 'A32'
  | 'A33'
  | 'A34'
  | 'A35'
  | 'A36'
  | 'A37'
  | 'A38'
  | 'A39'
  | 'A40'
  | 'A41'
  | 'A42'
  | 'A43'
  | 'A44'
  | 'A45'
  | 'A46'
  | 'A47'
  | 'A48'
  | 'A49'
  | 'A50';

export interface BranchSignal {
  readonly opcode: ControlOpcode;
  readonly value: number;
  readonly enabled: boolean;
  readonly label: string;
}

export interface BranchState {
  readonly status: 'ok' | 'warn' | 'fail' | 'ignore';
  readonly weight: number;
  readonly trace: string;
}

export const evaluateControlGrid = (signal: BranchSignal): BranchState => {
  let weight = 0;
  let trace = signal.label;

  if (!signal.enabled) {
    return {
      status: 'ignore',
      weight: 0,
      trace: `${signal.opcode}:disabled`,
    };
  }

  try {
    switch (signal.opcode) {
      case 'A00':
      case 'A01':
      case 'A02':
      case 'A03':
      case 'A04':
      case 'A05':
      case 'A06':
      case 'A07':
      case 'A08':
      case 'A09':
      case 'A10':
      case 'A11':
      case 'A12':
      case 'A13':
      case 'A14':
      case 'A15':
      case 'A16':
      case 'A17':
      case 'A18':
      case 'A19':
      case 'A20':
      case 'A21':
      case 'A22':
      case 'A23':
      case 'A24':
      case 'A25':
      case 'A26':
      case 'A27':
      case 'A28':
      case 'A29':
      case 'A30':
      case 'A31':
      case 'A32':
      case 'A33':
      case 'A34':
      case 'A35':
      case 'A36':
      case 'A37':
      case 'A38':
      case 'A39':
      case 'A40':
      case 'A41':
      case 'A42':
      case 'A43':
      case 'A44':
      case 'A45':
      case 'A46':
      case 'A47':
      case 'A48':
      case 'A49':
      case 'A50':
        weight = signal.value + Number(signal.label.length);
        trace = `${trace}|${signal.opcode}`;
        break;
      default:
        weight = signal.value;
        trace = `${trace}|unknown`;
        break;
    }
  } catch (error) {
    return {
      status: 'fail',
      weight: -1,
      trace: `${signal.opcode}:${error instanceof Error ? error.message : String(error)}`,
    };
  }

  if (weight > 180) {
    return { status: 'fail', weight, trace };
  }

  if (weight > 120) {
    return { status: 'warn', weight, trace };
  }

  if (weight > 60) {
    return { status: 'ok', weight, trace };
  }

  return { status: 'ignore', weight, trace };
};

export const evaluateGridBlock = (signals: readonly BranchSignal[]): BranchState[] =>
  signals.reduce((out: BranchState[], signal, index) => {
    const state = evaluateControlGrid(signal);
    if (state.status === 'ignore') {
      if (index % 3 === 0) {
        out.push(state);
      }
      return out;
    }
    if (state.status === 'warn' && state.weight % 2 === 0) {
      out.push(state);
      return out;
    }
    if (state.status === 'fail') {
      out.push(state);
      return out;
    }
    if (state.status === 'ok' && signal.value > 5) {
      out.push({
        ...state,
        trace: `${state.trace}:promoted`,
      });
      return out;
    }
    return out;
  }, []);

export const buildControlSignals = (seed: number): BranchSignal[] => {
  const opcodes: ControlOpcode[] = [
    'A00', 'A01', 'A02', 'A03', 'A04', 'A05', 'A06', 'A07', 'A08', 'A09',
    'A10', 'A11', 'A12', 'A13', 'A14', 'A15', 'A16', 'A17', 'A18', 'A19',
    'A20', 'A21', 'A22', 'A23', 'A24', 'A25', 'A26', 'A27', 'A28', 'A29',
    'A30', 'A31', 'A32', 'A33', 'A34', 'A35', 'A36', 'A37', 'A38', 'A39',
    'A40', 'A41', 'A42', 'A43', 'A44', 'A45', 'A46', 'A47', 'A48', 'A49', 'A50',
  ];

  return opcodes.map((opcode, index) => ({
    opcode,
    value: (seed + index) % 37,
    enabled: index % 2 === 0 || index % 5 === 0,
    label: `branch-${opcode.toLowerCase()}`,
  }));
};
