export interface DeepSpanAnchor {
  readonly anchor: true;
}

export interface DeepSpanOne extends DeepSpanAnchor {
  readonly stageOne: 1;
}
export interface DeepSpanTwo extends DeepSpanOne {
  readonly stageTwo: 2;
}
export interface DeepSpanThree extends DeepSpanTwo {
  readonly stageThree: 3;
}
export interface DeepSpanFour extends DeepSpanThree {
  readonly stageFour: 4;
}
export interface DeepSpanFive extends DeepSpanFour {
  readonly stageFive: 5;
}
export interface DeepSpanSix extends DeepSpanFive {
  readonly stageSix: 6;
}
export interface DeepSpanSeven extends DeepSpanSix {
  readonly stageSeven: 7;
}
export interface DeepSpanEight extends DeepSpanSeven {
  readonly stageEight: 8;
}
export interface DeepSpanNine extends DeepSpanEight {
  readonly stageNine: 9;
}
export interface DeepSpanTen extends DeepSpanNine {
  readonly stageTen: 10;
}
export interface DeepSpanEleven extends DeepSpanTen {
  readonly stageEleven: 11;
}
export interface DeepSpanTwelve extends DeepSpanEleven {
  readonly stageTwelve: 12;
}
export interface DeepSpanThirteen extends DeepSpanTwelve {
  readonly stageThirteen: 13;
}
export interface DeepSpanFourteen extends DeepSpanThirteen {
  readonly stageFourteen: 14;
}
export interface DeepSpanFifteen extends DeepSpanFourteen {
  readonly stageFifteen: 15;
}
export interface DeepSpanSixteen extends DeepSpanFifteen {
  readonly stageSixteen: 16;
}
export interface DeepSpanSeventeen extends DeepSpanSixteen {
  readonly stageSeventeen: 17;
}
export interface DeepSpanEighteen extends DeepSpanSeventeen {
  readonly stageEighteen: 18;
}
export interface DeepSpanNineteen extends DeepSpanEighteen {
  readonly stageNineteen: 19;
}
export interface DeepSpanTwenty extends DeepSpanNineteen {
  readonly stageTwenty: 20;
}
export interface DeepSpanTwentyOne extends DeepSpanTwenty {
  readonly stageTwentyOne: 21;
}
export interface DeepSpanTwentyTwo extends DeepSpanTwentyOne {
  readonly stageTwentyTwo: 22;
}
export interface DeepSpanTwentyThree extends DeepSpanTwentyTwo {
  readonly stageTwentyThree: 23;
}
export interface DeepSpanTwentyFour extends DeepSpanTwentyThree {
  readonly stageTwentyFour: 24;
}
export interface DeepSpanTwentyFive extends DeepSpanTwentyFour {
  readonly stageTwentyFive: 25;
}
export interface DeepSpanTwentySix extends DeepSpanTwentyFive {
  readonly stageTwentySix: 26;
}
export interface DeepSpanTwentySeven extends DeepSpanTwentySix {
  readonly stageTwentySeven: 27;
}
export interface DeepSpanTwentyEight extends DeepSpanTwentySeven {
  readonly stageTwentyEight: 28;
}
export interface DeepSpanTwentyNine extends DeepSpanTwentyEight {
  readonly stageTwentyNine: 29;
}
export interface DeepSpanThirty extends DeepSpanTwentyNine {
  readonly stageThirty: 30;
}
export interface DeepSpanThirtyOne extends DeepSpanThirty {
  readonly stageThirtyOne: 31;
}
export interface DeepSpanThirtyTwo extends DeepSpanThirtyOne {
  readonly stageThirtyTwo: 32;
}
export interface DeepSpanThirtyThree extends DeepSpanThirtyTwo {
  readonly stageThirtyThree: 33;
}
export interface DeepSpanThirtyFour extends DeepSpanThirtyThree {
  readonly stageThirtyFour: 34;
}
export interface DeepSpanThirtyFive extends DeepSpanThirtyFour {
  readonly stageThirtyFive: 35;
}
export interface DeepSpanThirtySix extends DeepSpanThirtyFive {
  readonly stageThirtySix: 36;
}
export interface DeepSpanThirtySeven extends DeepSpanThirtySix {
  readonly stageThirtySeven: 37;
}
export interface DeepSpanThirtyEight extends DeepSpanThirtySeven {
  readonly stageThirtyEight: 38;
}
export interface DeepSpanThirtyNine extends DeepSpanThirtyEight {
  readonly stageThirtyNine: 39;
}
export interface DeepSpanForty extends DeepSpanThirtyNine {
  readonly stageForty: 40;
}

export type DeepSpanChain = DeepSpanForty;

export const isDeepSpanChain = (value: DeepSpanChain): value is DeepSpanChain => value !== null;

type SpanLabel = `s-${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40}`;
export type DeepSpanMarker = SpanLabel;
export type DeepSpanRegistry = Record<DeepSpanMarker, boolean>;

type StageDepth = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

class DeepClassRoot {
  readonly stage: string = 's-1';
  readonly key: string = 'node-1';
  readonly namespace: string = 'ns-control';
  readonly marker: string = 'root';
  readonly depth: StageDepth = 1;
  readonly id = `${this.key}-${this.namespace}` as const;
  toLabel(): string {
    return `${this.namespace}/${this.key}#${this.stage}`;
  }
}

class DeepClassOne extends DeepClassRoot {
  readonly marker: string = 'one';
}
class DeepClassTwo extends DeepClassOne {
  readonly marker: string = 'two';
  readonly stage: string = 's-2';
  readonly depth: StageDepth = 2;
}
class DeepClassThree extends DeepClassTwo {
  readonly marker: string = 'three';
  readonly stage: string = 's-3';
  readonly depth: StageDepth = 3;
}
class DeepClassFour extends DeepClassThree {
  readonly marker: string = 'four';
  readonly stage: string = 's-4';
  readonly depth: StageDepth = 4;
}
class DeepClassFive extends DeepClassFour {
  readonly marker: string = 'five';
  readonly stage: string = 's-5';
  readonly depth: StageDepth = 5;
}
class DeepClassSix extends DeepClassFive {
  readonly marker: string = 'six';
  readonly stage: string = 's-6';
  readonly depth: StageDepth = 6;
}
class DeepClassSeven extends DeepClassSix {
  readonly marker: string = 'seven';
  readonly stage: string = 's-7';
  readonly depth: StageDepth = 7;
}
class DeepClassEight extends DeepClassSeven {
  readonly marker: string = 'eight';
  readonly stage: string = 's-8';
  readonly depth: StageDepth = 8;
}
class DeepClassNine extends DeepClassEight {
  readonly marker: string = 'nine';
  readonly stage: string = 's-9';
  readonly depth: StageDepth = 9;
}
class DeepClassTen extends DeepClassNine {
  readonly marker: string = 'ten';
  readonly stage: string = 's-10';
  readonly depth: StageDepth = 10;
}

export const buildClassLeaf = () => {
  return new DeepClassTen();
};

export const deepSpanInstance = buildClassLeaf();

export const deepSpanChainType = isDeepSpanChain({
  anchor: true,
  stageOne: 1,
  stageTwo: 2,
  stageThree: 3,
  stageFour: 4,
  stageFive: 5,
  stageSix: 6,
  stageSeven: 7,
  stageEight: 8,
  stageNine: 9,
  stageTen: 10,
  stageEleven: 11,
  stageTwelve: 12,
  stageThirteen: 13,
  stageFourteen: 14,
  stageFifteen: 15,
  stageSixteen: 16,
  stageSeventeen: 17,
  stageEighteen: 18,
  stageNineteen: 19,
  stageTwenty: 20,
  stageTwentyOne: 21,
  stageTwentyTwo: 22,
  stageTwentyThree: 23,
  stageTwentyFour: 24,
  stageTwentyFive: 25,
  stageTwentySix: 26,
  stageTwentySeven: 27,
  stageTwentyEight: 28,
  stageTwentyNine: 29,
  stageThirty: 30,
  stageThirtyOne: 31,
  stageThirtyTwo: 32,
  stageThirtyThree: 33,
  stageThirtyFour: 34,
  stageThirtyFive: 35,
  stageThirtySix: 36,
  stageThirtySeven: 37,
  stageThirtyEight: 38,
  stageThirtyNine: 39,
  stageForty: 40,
} as DeepSpanChain);

export const deepSpanCatalog = [
  's-1',
  's-2',
  's-3',
  's-4',
  's-5',
  's-6',
  's-7',
  's-8',
  's-9',
  's-10',
  's-11',
  's-12',
  's-13',
  's-14',
  's-15',
  's-16',
  's-17',
  's-18',
  's-19',
  's-20',
  's-21',
  's-22',
  's-23',
  's-24',
  's-25',
  's-26',
  's-27',
  's-28',
  's-29',
  's-30',
  's-31',
  's-32',
  's-33',
  's-34',
  's-35',
  's-36',
  's-37',
  's-38',
  's-39',
  's-40',
] as const satisfies ReadonlyArray<SpanLabel>;

export const deepSpanRegistry: DeepSpanRegistry = deepSpanCatalog.reduce((acc, item) => {
  acc[item as DeepSpanMarker] = true;
  return acc;
}, {} as DeepSpanRegistry);

export const consumeDeepSpanChain = (payload: DeepSpanChain): number => {
  return Object.keys(payload).length;
};
