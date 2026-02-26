export interface JunctionA {
  readonly nodeId: `node-a`;
  readonly nodeType: 'source';
  readonly resource: number;
}
export interface JunctionB {
  readonly nodeId: `node-b`;
  readonly nodeType: 'validator';
  readonly resource: number;
}
export interface JunctionC {
  readonly nodeId: `node-c`;
  readonly nodeType: 'planner';
  readonly resource: number;
}
export interface JunctionD {
  readonly nodeId: `node-d`;
  readonly nodeType: 'planner';
  readonly resource: number;
  readonly shared: { readonly key: 'D'; readonly active: true };
}
export interface JunctionE {
  readonly nodeId: `node-e`;
  readonly nodeType: 'executor';
  readonly shared: { readonly key: 'E'; readonly active: false };
}
export interface JunctionF {
  readonly nodeId: `node-f`;
  readonly nodeType: 'observer';
  readonly shared: { readonly key: 'E'; readonly active: false };
}
export interface JunctionG {
  readonly nodeId: `node-g`;
  readonly nodeType: 'executor';
  readonly resource: number;
}
export interface JunctionH {
  readonly nodeId: `node-h`;
  readonly nodeType: 'signal';
  readonly shared: { readonly key: 'H'; readonly active: true };
}
export interface JunctionI {
  readonly nodeId: `node-i`;
  readonly nodeType: 'signal';
  readonly shared: { readonly key: 'I'; readonly active: true };
}
export interface JunctionJ {
  readonly nodeId: `node-j`;
  readonly nodeType: 'coordinator';
  readonly throttle: number;
}
export interface JunctionK {
  readonly nodeId: `node-k`;
  readonly nodeType: 'coordinator';
  readonly throttle: number;
}
export interface JunctionL {
  readonly nodeId: `node-l`;
  readonly nodeType: 'introspector';
  readonly throttle: number;
}
export interface JunctionM {
  readonly nodeId: `node-m`;
  readonly nodeType: 'introspector';
  readonly auditId: `A-${string}`;
}
export interface JunctionN {
  readonly nodeId: `node-n`;
  readonly nodeType: 'policy';
  readonly auditId: `A-${string}`;
}
export interface JunctionO {
  readonly nodeId: `node-o`;
  readonly nodeType: 'policy';
  readonly auditId: `A-${string}`;
}
export interface JunctionP {
  readonly nodeId: `node-p`;
  readonly nodeType: 'bridge';
}
export interface JunctionQ {
  readonly nodeId: `node-q`;
  readonly nodeType: 'bridge';
  readonly lane: `lane-${number}`;
}
export interface JunctionR {
  readonly nodeId: `node-r`;
  readonly nodeType: 'bridge';
  readonly lane: `lane-${number}`;
}
export interface JunctionS {
  readonly nodeId: `node-s`;
  readonly nodeType: 'inspector';
  readonly lane: `lane-${number}`;
}
export interface JunctionT {
  readonly nodeId: `node-t`;
  readonly nodeType: 'inspector';
  readonly confidence: number;
}
export interface JunctionU {
  readonly nodeId: `node-u`;
  readonly nodeType: 'inspector';
  readonly confidence: number;
}
export interface JunctionV {
  readonly nodeId: `node-v`;
  readonly nodeType: 'ledger';
}
export interface JunctionW {
  readonly nodeId: `node-w`;
  readonly nodeType: 'ledger';
  readonly ledgerTag: `L-${number}`;
}
export interface JunctionX {
  readonly nodeId: `node-x`;
  readonly nodeType: 'ledger';
  readonly ledgerTag: `L-${number}`;
}
export interface JunctionY {
  readonly nodeId: `node-y`;
  readonly nodeType: 'scheduler';
  readonly sequence: readonly number[];
}
export interface JunctionZ {
  readonly nodeId: `node-z`;
  readonly nodeType: 'scheduler';
  readonly sequence: readonly number[];
}
export interface JunctionAA {
  readonly nodeId: `node-aa`;
  readonly nodeType: 'scheduler';
  readonly sequence: readonly number[];
}
export interface JunctionAB {
  readonly nodeId: `node-ab`;
  readonly nodeType: 'telemetry';
  readonly sequence: readonly number[];
}
export interface JunctionAC {
  readonly nodeId: `node-ac`;
  readonly nodeType: 'telemetry';
}
export interface JunctionAD {
  readonly nodeId: `node-ad`;
  readonly nodeType: 'telemetry';
}
export interface JunctionAE {
  readonly nodeId: `node-ae`;
  readonly nodeType: 'command';
}
export interface JunctionAF {
  readonly nodeId: `node-af`;
  readonly nodeType: 'command';
  readonly commandId: `cmd-${string}`;
}
export interface JunctionAG {
  readonly nodeId: `node-ag`;
  readonly nodeType: 'command';
  readonly commandId: `cmd-${string}`;
}
export interface JunctionAH {
  readonly nodeId: `node-ah`;
  readonly nodeType: 'auditor';
  readonly commandId: `cmd-${string}`;
}

export type LatticeIntersection =
  & JunctionA
  & JunctionB
  & JunctionC
  & JunctionD
  & JunctionE
  & JunctionF
  & JunctionG
  & JunctionH
  & JunctionI
  & JunctionJ
  & JunctionK
  & JunctionL
  & JunctionM
  & JunctionN
  & JunctionO
  & JunctionP
  & JunctionQ
  & JunctionR
  & JunctionS
  & JunctionT
  & JunctionU
  & JunctionV
  & JunctionW
  & JunctionX
  & JunctionY
  & JunctionZ
  & JunctionAA
  & JunctionAB
  & JunctionAC
  & JunctionAD
  & JunctionAE
  & JunctionAF
  & JunctionAG
  & JunctionAH;

export type ExtractIntersection<Target extends Record<string, unknown>> = {
  [K in keyof Target as K extends `node-${string}` ? K : never]: Target[K];
};

export type MergeOverlap<TLeft extends object, TRight extends object> = Omit<TLeft, keyof TRight> & TRight;

export type DeepIntersection<Targets extends readonly object[]> =
  Targets extends readonly [infer Head, ...infer Tail]
    ? Head extends object
      ? Tail extends readonly object[]
        ? MergeOverlap<Head, DeepIntersection<Tail>>
        : Head
      : never
    : {};

export type MappedIntersection<TInput extends Record<string, object>> = {
  [K in keyof TInput]:
    TInput[K] extends infer TV
      ? TV & {
          readonly source: K;
          readonly alias: `${Extract<K, string>}-alias`;
          readonly rank: number;
        }
      : never;
};

export const composeIntersection = <TInput extends readonly Record<string, object>[]>(
  input: TInput,
): DeepIntersection<TInput> => {
  let result = {} as Record<string, unknown>;
  for (const current of input) {
    result = { ...result, ...current };
  }
  return result as DeepIntersection<TInput>;
};

export const resolveIntersectionOverlap = <TInput extends Record<string, object>>(
  left: TInput,
  right: TInput,
): MergeOverlap<TInput, TInput> => ({
  ...left,
  ...right,
});
