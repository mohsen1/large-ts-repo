import { PolicyNode, OrchestrationNodeId, PolicyExecutionWindow, PolicyPlan, PolicyPlanStep } from './models';
import { collectTemplateVariables, PolicyScenarioTemplate, renderTemplate } from './workflow-template';

export type MatrixRowId = `row:${string}`;
export type MatrixCellValue = number;

export type RecursiveMatrix<T extends MatrixCellValue, N extends number, State extends MatrixCellValue[] = []> = State['length'] extends N
  ? State
  : RecursiveMatrix<T, N, [...State, T]>;

interface MatrixAxis {
  readonly label: string;
  readonly title: string;
  readonly weight: number;
}

export interface PolicyMatrixStep {
  readonly stepId: MatrixRowId;
  readonly title: string;
  readonly axis: readonly MatrixAxis[];
  readonly values: readonly MatrixCellValue[];
  readonly wave: PolicyPlanStep['order'];
}

export interface PolicyMatrixInput {
  readonly templates: readonly PolicyScenarioTemplate[];
  readonly nodes: readonly PolicyNode[];
  readonly windows: readonly PolicyExecutionWindow[];
}

export interface PolicyMatrix {
  readonly rows: readonly PolicyMatrixStep[];
  readonly dimensions: readonly string[];
  readonly summary: {
    readonly total: number;
    readonly active: number;
    readonly estimatedMs: number;
  };
  readonly cellMap: Readonly<Record<string, number[]>>;
}

type WindowList = readonly PolicyExecutionWindow[];

const phaseWeights: Record<string, number> = {
  discover: 0.4,
  simulate: 1.2,
  enforce: 2.0,
  rollback: 1.0,
};

const windowToAxis = (windows: WindowList, fallbackSuffix: string): readonly MatrixAxis[] => {
  return windows.length > 0
    ? windows.map((window, index) => ({
        label: `window-${fallbackSuffix}-${index}`,
        title: `${window.start}..${window.end}`,
        weight: Math.max(1, (Date.parse(window.end) - Date.parse(window.start)) / 1000_000),
      }))
    : [
        {
          label: `window-${fallbackSuffix}-fallback`,
          title: new Date().toISOString(),
          weight: 1,
        },
      ];
};

const toCellSeries = (values: readonly number[], width = 12): readonly number[] =>
  Array.isArray(values) ? values.slice(0, width) : [];

export const buildPolicyMatrix = (input: PolicyMatrixInput): PolicyMatrix => {
  const rows: PolicyMatrixStep[] = [];
  const dimensions = input.templates.map((template) => template.id);
  const cellMap: Record<string, number[]> = {};

  for (const template of input.templates) {
    const templateAxis = windowToAxis(input.windows, template.id);
    const rendered = renderTemplate({ template, values: template.defaults });
    const weight = phaseWeights[template.phase] ?? 1;
    const numeric = input.nodes.map((node, index) => {
      const variableBonus = collectTemplateVariables(template.body).length * 2;
      const renderedLength = rendered.length;
      return node.retries + node.timeoutSeconds + node.slaWindowMinutes + Math.max(index + 1, 1) * weight + variableBonus + renderedLength;
    });
    rows.push({
      stepId: `row:${template.id}` as MatrixRowId,
      title: template.name,
      axis: templateAxis,
      values: toCellSeries(numeric),
      wave: Math.round(input.nodes.length / Math.max(1, numeric.length)),
    });
    cellMap[template.id] = [...numeric];
  }

  return {
    rows,
    dimensions,
    summary: {
      total: rows.length,
      active: rows.filter((row) => row.values.some((value) => value > 0)).length,
      estimatedMs: rows.reduce((acc, row) => acc + row.values.reduce((carry, value) => carry + value, 0), 0),
    },
    cellMap,
  };
};

export const summarizePlanWindows = (plan: PolicyPlan): Readonly<Record<string, number>> => {
  return plan.steps.reduce<Record<string, number>>(
    (acc, step) => ({ ...acc, [`wave:${step.order}`]: step.nodeIds.length + step.estimatedLatencyMs }),
    {},
  );
};

export const matrixShape = <TNode extends string>(nodes: readonly TNode[]): readonly [TNode, ...TNode[]] => {
  if (nodes.length < 1) throw new Error('nodes must not be empty');
  const [first, ...rest] = nodes;
  return [first, ...rest] as readonly [TNode, ...TNode[]];
};

export const matrixSeries = <T extends number>(values: readonly T[], size: number): readonly RecursiveMatrix<T, 12>[] => {
  const matrix: readonly T[] = values.slice(0, size);
  return [matrix as RecursiveMatrix<T, 12>];
};
