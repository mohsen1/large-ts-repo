export type StageMarker = `S${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10}`;

export interface BaseSignalPayload {
  readonly root: 'signal-root';
  readonly createdAt: number;
}

export interface PipelineLayer01 extends BaseSignalPayload {
  readonly step01: '01';
  readonly marker: StageMarker;
  readonly value01: number;
}

export interface PipelineLayer02 extends PipelineLayer01 {
  readonly step02: '02';
  readonly value02: string;
}

export interface PipelineLayer03 extends PipelineLayer02 {
  readonly step03: '03';
  readonly value03: boolean;
}

export interface PipelineLayer04 extends PipelineLayer03 {
  readonly step04: '04';
  readonly value04: `v4-${string}`;
}

export interface PipelineLayer05 extends PipelineLayer04 {
  readonly step05: '05';
  readonly value05: readonly number[];
}

export interface PipelineLayer06 extends PipelineLayer05 {
  readonly step06: '06';
  readonly value06: readonly [string, string];
}

export interface PipelineLayer07 extends PipelineLayer06 {
  readonly step07: '07';
  readonly value07: string[];
}

export interface PipelineLayer08 extends PipelineLayer07 {
  readonly step08: '08';
  readonly value08: bigint;
}

export interface PipelineLayer09 extends PipelineLayer08 {
  readonly step09: '09';
  readonly value09: null;
}

export interface PipelineLayer10 extends PipelineLayer09 {
  readonly step10: '10';
  readonly value10: undefined;
}

export interface PipelineLayer11 extends PipelineLayer10 {
  readonly step11: '11';
  readonly value11: { readonly scope: 'a' };
}

export interface PipelineLayer12 extends PipelineLayer11 {
  readonly step12: '12';
  readonly value12: { readonly scope: 'b' };
}

export interface PipelineLayer13 extends PipelineLayer12 {
  readonly step13: '13';
  readonly value13: { readonly scope: 'c' };
}

export interface PipelineLayer14 extends PipelineLayer13 {
  readonly step14: '14';
  readonly value14: { readonly scope: 'd' };
}

export interface PipelineLayer15 extends PipelineLayer14 {
  readonly step15: '15';
  readonly value15: { readonly scope: 'e' };
}

export interface PipelineLayer16 extends PipelineLayer15 {
  readonly step16: '16';
  readonly value16: { readonly scope: 'f' };
}

export interface PipelineLayer17 extends PipelineLayer16 {
  readonly step17: '17';
  readonly value17: { readonly scope: 'g' };
}

export interface PipelineLayer18 extends PipelineLayer17 {
  readonly step18: '18';
  readonly value18: { readonly scope: 'h' };
}

export interface PipelineLayer19 extends PipelineLayer18 {
  readonly step19: '19';
  readonly value19: { readonly scope: 'i' };
}

export interface PipelineLayer20 extends PipelineLayer19 {
  readonly step20: '20';
  readonly value20: { readonly scope: 'j' };
}

export interface PipelineLayer21 extends PipelineLayer20 {
  readonly step21: '21';
  readonly value21: { readonly scope: 'k' };
}

export interface PipelineLayer22 extends PipelineLayer21 {
  readonly step22: '22';
  readonly value22: { readonly scope: 'l' };
}

export interface PipelineLayer23 extends PipelineLayer22 {
  readonly step23: '23';
  readonly value23: { readonly scope: 'm' };
}

export interface PipelineLayer24 extends PipelineLayer23 {
  readonly step24: '24';
  readonly value24: { readonly scope: 'n' };
}

export interface PipelineLayer25 extends PipelineLayer24 {
  readonly step25: '25';
  readonly value25: { readonly scope: 'o' };
}

export interface PipelineLayer26 extends PipelineLayer25 {
  readonly step26: '26';
  readonly value26: { readonly scope: 'p' };
}

export interface PipelineLayer27 extends PipelineLayer26 {
  readonly step27: '27';
  readonly value27: { readonly scope: 'q' };
}

export interface PipelineLayer28 extends PipelineLayer27 {
  readonly step28: '28';
  readonly value28: { readonly scope: 'r' };
}

export interface PipelineLayer29 extends PipelineLayer28 {
  readonly step29: '29';
  readonly value29: { readonly scope: 's' };
}

export interface PipelineLayer30 extends PipelineLayer29 {
  readonly step30: '30';
  readonly value30: { readonly scope: 't' };
}

export interface PipelineLayer31 extends PipelineLayer30 {
  readonly step31: '31';
  readonly value31: { readonly scope: 'u' };
}

export interface PipelineLayer32 extends PipelineLayer31 {
  readonly step32: '32';
  readonly value32: { readonly scope: 'v' };
}

export interface PipelineLayer33 extends PipelineLayer32 {
  readonly step33: '33';
  readonly value33: { readonly scope: 'w' };
}

export interface PipelineLayer34 extends PipelineLayer33 {
  readonly step34: '34';
  readonly value34: { readonly scope: 'x' };
}

export interface PipelineLayer35 extends PipelineLayer34 {
  readonly step35: '35';
  readonly value35: { readonly scope: 'y' };
}

export interface PipelineLayer36 extends PipelineLayer35 {
  readonly step36: '36';
  readonly value36: { readonly scope: 'z' };
}

export interface PipelineLayer37 extends PipelineLayer36 {
  readonly step37: '37';
  readonly value37: { readonly scope: 'aa' };
}

export interface PipelineLayer38 extends PipelineLayer37 {
  readonly step38: '38';
  readonly value38: { readonly scope: 'ab' };
}

export interface PipelineLayer39 extends PipelineLayer38 {
  readonly step39: '39';
  readonly value39: { readonly scope: 'ac' };
}

export interface PipelineLayer40 extends PipelineLayer39 {
  readonly step40: '40';
  readonly value40: { readonly scope: 'ad' };
}

export type DeepPipelineAnchor = PipelineLayer40;

export type AssertDeepChain = DeepPipelineAnchor extends PipelineLayer01 ? true : false;

export class StageCarrier<TInput, TMarker extends StageMarker = 'S1', TNext = BaseSignalPayload> {
  public constructor(
    public readonly input: TInput,
    public readonly marker: TMarker,
    public readonly next: TNext,
  ) {}
}

export class StageCarrier01<T, N extends StageMarker = 'S1'> extends StageCarrier<T, N, PipelineLayer01> {}
export class StageCarrier02<T, N extends StageMarker = 'S2'> extends StageCarrier01<T, N> {}
export class StageCarrier03<T, N extends StageMarker = 'S3'> extends StageCarrier02<T, N> {}
export class StageCarrier04<T, N extends StageMarker = 'S4'> extends StageCarrier03<T, N> {}
export class StageCarrier05<T, N extends StageMarker = 'S5'> extends StageCarrier04<T, N> {}
export class StageCarrier06<T, N extends StageMarker = 'S6'> extends StageCarrier05<T, N> {}
export class StageCarrier07<T, N extends StageMarker = 'S7'> extends StageCarrier06<T, N> {}
export class StageCarrier08<T, N extends StageMarker = 'S8'> extends StageCarrier07<T, N> {}
export class StageCarrier09<T, N extends StageMarker = 'S9'> extends StageCarrier08<T, N> {}
export class StageCarrier10<T, N extends StageMarker = 'S10'> extends StageCarrier09<T, N> {}

export type ExtractLayerKey<T> = T extends PipelineLayer01
  ? T['step01']
  : T extends PipelineLayer02
    ? T['step02']
    : T extends PipelineLayer03
      ? T['step03']
      : T extends PipelineLayer04
        ? T['step04']
        : T extends PipelineLayer05
          ? T['step05']
          : T extends PipelineLayer06
            ? T['step06']
            : T extends PipelineLayer07
              ? T['step07']
              : T extends PipelineLayer08
                ? T['step08']
                : T extends PipelineLayer09
                  ? T['step09']
                  : T extends PipelineLayer10
                    ? T['step10']
                    : T extends PipelineLayer11
                      ? T['step11']
                      : T extends PipelineLayer12
                        ? T['step12']
                        : T extends PipelineLayer13
                          ? T['step13']
                          : T extends PipelineLayer14
                            ? T['step14']
                            : T extends PipelineLayer15
                              ? T['step15']
                              : T extends PipelineLayer16
                                ? T['step16']
                                : T extends PipelineLayer17
                                  ? T['step17']
                                  : T extends PipelineLayer18
                                    ? T['step18']
                                    : T extends PipelineLayer19
                                      ? T['step19']
                                      : T extends PipelineLayer20
                                        ? T['step20']
                                        : T extends PipelineLayer21
                                          ? T['step21']
                                          : T extends PipelineLayer22
                                            ? T['step22']
                                            : T extends PipelineLayer23
                                              ? T['step23']
                                              : T extends PipelineLayer24
                                                ? T['step24']
                                                : T extends PipelineLayer25
                                                  ? T['step25']
                                                  : T extends PipelineLayer26
                                                    ? T['step26']
                                                    : T extends PipelineLayer27
                                                      ? T['step27']
                                                      : T extends PipelineLayer28
                                                        ? T['step28']
                                                        : T extends PipelineLayer29
                                                          ? T['step29']
                                                          : T extends PipelineLayer30
                                                            ? T['step30']
                                                            : T extends PipelineLayer31
                                                              ? T['step31']
                                                              : T extends PipelineLayer32
                                                                ? T['step32']
                                                                : T extends PipelineLayer33
                                                                  ? T['step33']
                                                                  : T extends PipelineLayer34
                                                                    ? T['step34']
                                                                    : T extends PipelineLayer35
                                                                      ? T['step35']
                                                                      : T extends PipelineLayer36
                                                                        ? T['step36']
                                                                        : T extends PipelineLayer37
                                                                          ? T['step37']
                                                                          : T extends PipelineLayer38
                                                                            ? T['step38']
                                                                            : T extends PipelineLayer39
                                                                              ? T['step39']
                                                                              : T extends PipelineLayer40
                                                                                ? T['step40']
                                                                                : never;

export type PipelineCompatibilityChecks<T extends PipelineLayer01> = T & {
  readonly compatibility: ExtractLayerKey<T> & string;
};

export type StructuralCompatibilityChain<T> = T extends PipelineLayer10
  ? PipelineCompatibilityChecks<T>
  : T extends PipelineLayer20
    ? PipelineCompatibilityChecks<T>
    : T extends PipelineLayer30
      ? PipelineCompatibilityChecks<T>
      : T extends PipelineLayer40
        ? PipelineCompatibilityChecks<T>
        : never;

export const deepLayerCatalog = [
  'L01',
  'L02',
  'L03',
  'L04',
  'L05',
  'L06',
  'L07',
  'L08',
  'L09',
  'L10',
  'L11',
  'L12',
  'L13',
  'L14',
  'L15',
  'L16',
  'L17',
  'L18',
  'L19',
  'L20',
  'L21',
  'L22',
  'L23',
  'L24',
  'L25',
  'L26',
  'L27',
  'L28',
  'L29',
  'L30',
  'L31',
  'L32',
  'L33',
  'L34',
  'L35',
  'L36',
  'L37',
  'L38',
  'L39',
  'L40',
] as const;

export type LayerCatalog = typeof deepLayerCatalog;
