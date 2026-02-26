export interface ChainBase<T extends string = 'root'> {
  readonly marker: T;
  readonly level: number;
}

export interface ChainOne extends ChainBase<'one'> {}
export interface ChainTwo extends ChainOne {
  readonly oneToTwo: true;
}
export interface ChainThree extends ChainTwo {
  readonly twoToThree: true;
}
export interface ChainFour extends ChainThree {
  readonly threeToFour: true;
}
export interface ChainFive extends ChainFour {
  readonly fourToFive: true;
}
export interface ChainSix extends ChainFive {
  readonly fiveToSix: true;
}
export interface ChainSeven extends ChainSix {
  readonly sixToSeven: true;
}
export interface ChainEight extends ChainSeven {
  readonly sevenToEight: true;
}
export interface ChainNine extends ChainEight {
  readonly eightToNine: true;
}
export interface ChainTen extends ChainNine {
  readonly nineToTen: true;
}
export interface ChainEleven extends ChainTen {
  readonly tenToEleven: true;
}
export interface ChainTwelve extends ChainEleven {
  readonly elevenToTwelve: true;
}
export interface ChainThirteen extends ChainTwelve {
  readonly twelveToThirteen: true;
}
export interface ChainFourteen extends ChainThirteen {
  readonly thirteenToFourteen: true;
}
export interface ChainFifteen extends ChainFourteen {
  readonly fourteenToFifteen: true;
}
export interface ChainSixteen extends ChainFifteen {
  readonly fifteenToSixteen: true;
}
export interface ChainSeventeen extends ChainSixteen {
  readonly sixteenToSeventeen: true;
}
export interface ChainEighteen extends ChainSeventeen {
  readonly seventeenToEighteen: true;
}
export interface ChainNineteen extends ChainEighteen {
  readonly eighteenToNineteen: true;
}
export interface ChainTwenty extends ChainNineteen {
  readonly nineteenToTwenty: true;
}
export interface ChainTwentyOne extends ChainTwenty {
  readonly twentyToTwentyOne: true;
}
export interface ChainTwentyTwo extends ChainTwentyOne {
  readonly twentyOneToTwentyTwo: true;
}
export interface ChainTwentyThree extends ChainTwentyTwo {
  readonly twentyTwoToTwentyThree: true;
}
export interface ChainTwentyFour extends ChainTwentyThree {
  readonly twentyThreeToTwentyFour: true;
}
export interface ChainTwentyFive extends ChainTwentyFour {
  readonly twentyFourToTwentyFive: true;
}
export interface ChainTwentySix extends ChainTwentyFive {
  readonly twentyFiveToTwentySix: true;
}
export interface ChainTwentySeven extends ChainTwentySix {
  readonly twentySixToTwentySeven: true;
}
export interface ChainTwentyEight extends ChainTwentySeven {
  readonly twentySevenToTwentyEight: true;
}
export interface ChainTwentyNine extends ChainTwentyEight {
  readonly twentyEightToTwentyNine: true;
}
export interface ChainThirty extends ChainTwentyNine {
  readonly twentyNineToThirty: true;
}
export interface ChainThirtyOne extends ChainThirty {
  readonly thirtyToThirtyOne: true;
}
export interface ChainThirtyTwo extends ChainThirtyOne {
  readonly thirtyOneToThirtyTwo: true;
}
export interface ChainThirtyThree extends ChainThirtyTwo {
  readonly thirtyTwoToThirtyThree: true;
}
export interface ChainThirtyFour extends ChainThirtyThree {
  readonly thirtyThreeToThirtyFour: true;
}
export interface ChainThirtyFive extends ChainThirtyFour {
  readonly thirtyFourToThirtyFive: true;
}
export interface ChainThirtySix extends ChainThirtyFive {
  readonly thirtyFiveToThirtySix: true;
}
export interface ChainThirtySeven extends ChainThirtySix {
  readonly thirtySixToThirtySeven: true;
}
export interface ChainThirtyEight extends ChainThirtySeven {
  readonly thirtySevenToThirtyEight: true;
}
export interface ChainThirtyNine extends ChainThirtyEight {
  readonly thirtyEightToThirtyNine: true;
}
export interface ChainForty extends ChainThirtyNine {
  readonly thirtyNineToForty: true;
}

export type StressChainObject =
  | ChainOne
  | ChainTwo
  | ChainThree
  | ChainFour
  | ChainFive
  | ChainSix
  | ChainSeven
  | ChainEight
  | ChainNine
  | ChainTen
  | ChainEleven
  | ChainTwelve
  | ChainThirteen
  | ChainFourteen
  | ChainFifteen
  | ChainSixteen
  | ChainSeventeen
  | ChainEighteen
  | ChainNineteen
  | ChainTwenty
  | ChainTwentyOne
  | ChainTwentyTwo
  | ChainTwentyThree
  | ChainTwentyFour
  | ChainTwentyFive
  | ChainTwentySix
  | ChainTwentySeven
  | ChainTwentyEight
  | ChainTwentyNine
  | ChainThirty
  | ChainThirtyOne
  | ChainThirtyTwo
  | ChainThirtyThree
  | ChainThirtyFour
  | ChainThirtyFive
  | ChainThirtySix
  | ChainThirtySeven
  | ChainThirtyEight
  | ChainThirtyNine
  | ChainForty;

export interface CascadeStep<T extends string, TNext extends string> {
  readonly name: T;
  readonly nextName: TNext;
  readonly depth: number;
}

export type StepToChain<TStep, TDepth extends number, TAcc = never> = TDepth extends 0
  ? TAcc
  : TStep extends CascadeStep<infer Name, infer Next>
    ? StepToChain<CascadeStep<Next & string, `${Name}-${Next & string}`>, Decrement<TDepth>, TAcc & { [K in Name & string]: Next & string }>
    : TAcc;

export type Decrement<T extends number> = T extends 0
  ? 0
  : NumericRange<T> extends readonly [infer _Head, ...infer Rest]
    ? Rest['length']
    : 0;

type NumericRange<
  TSize extends number,
  TAccumulator extends readonly unknown[] = [],
> = TAccumulator['length'] extends TSize
  ? TAccumulator
  : NumericRange<TSize, [...TAccumulator, TAccumulator['length']]>;

export class LayerOne<T extends ChainOne = ChainOne> {
  constructor(public readonly config: T, public readonly children: readonly LayerOne[] = []) {}
  readonly kind: string = 'one';
  label(): string {
    return `${this.kind}:${this.config.marker}:${this.config.level}`;
  }
}

export class LayerTwo extends LayerOne<ChainTwo> {
  readonly kind = 'two';
}
export class LayerThree extends LayerOne<ChainThree> {
  readonly kind = 'three';
}
export class LayerFour extends LayerOne<ChainFour> {
  readonly kind = 'four';
}
export class LayerFive extends LayerOne<ChainFive> {
  readonly kind = 'five';
}
export class LayerSix extends LayerOne<ChainSix> {
  readonly kind = 'six';
}
export class LayerSeven extends LayerOne<ChainSeven> {
  readonly kind = 'seven';
}
export class LayerEight extends LayerOne<ChainEight> {
  readonly kind = 'eight';
}
export class LayerNine extends LayerOne<ChainNine> {
  readonly kind = 'nine';
}
export class LayerTen extends LayerOne<ChainTen> {
  readonly kind = 'ten';
}
export class LayerEleven extends LayerOne<ChainEleven> {
  readonly kind = 'eleven';
}
export class LayerTwelve extends LayerOne<ChainTwelve> {
  readonly kind = 'twelve';
}
export class LayerThirteen extends LayerOne<ChainThirteen> {
  readonly kind = 'thirteen';
}
export class LayerFourteen extends LayerOne<ChainFourteen> {
  readonly kind = 'fourteen';
}
export class LayerFifteen extends LayerOne<ChainFifteen> {
  readonly kind = 'fifteen';
}
export class LayerSixteen extends LayerOne<ChainSixteen> {
  readonly kind = 'sixteen';
}
export class LayerSeventeen extends LayerOne<ChainSeventeen> {
  readonly kind = 'seventeen';
}
export class LayerEighteen extends LayerOne<ChainEighteen> {
  readonly kind = 'eighteen';
}
export class LayerNineteen extends LayerOne<ChainNineteen> {
  readonly kind = 'nineteen';
}
export class LayerTwenty extends LayerOne<ChainTwenty> {
  readonly kind = 'twenty';
}
export class LayerForty extends LayerOne<ChainForty> {
  readonly kind = 'forty';
}

export interface LayerFortyShape extends ChainForty {
  readonly id: string;
}

export const collapseLayers = (input: readonly LayerOne[]) => {
  const labels = input.map((layer) => layer.label());
  return {
    head: labels.at(0) ?? 'none',
    tail: labels.slice(1),
    depth: labels.length,
  } satisfies {
    head: string;
    tail: readonly string[];
    depth: number;
  };
};

export const growCascade = (seed: ChainOne, size = 12): LayerOne[] => {
  const seedLayer = new LayerOne(seed);
  const chain: LayerOne[] = [seedLayer];
  const builders: Array<new (...args: [ChainOne]) => LayerOne> = [
    LayerTwo as unknown as new (...args: [ChainOne]) => LayerOne,
    LayerThree as unknown as new (...args: [ChainOne]) => LayerOne,
    LayerFour as unknown as new (...args: [ChainOne]) => LayerOne,
    LayerFive as unknown as new (...args: [ChainOne]) => LayerOne,
    LayerSix as unknown as new (...args: [ChainOne]) => LayerOne,
    LayerSeven as unknown as new (...args: [ChainOne]) => LayerOne,
    LayerEight as unknown as new (...args: [ChainOne]) => LayerOne,
    LayerNine as unknown as new (...args: [ChainOne]) => LayerOne,
    LayerTen as unknown as new (...args: [ChainOne]) => LayerOne,
    LayerEleven as unknown as new (...args: [ChainOne]) => LayerOne,
    LayerTwelve as unknown as new (...args: [ChainOne]) => LayerOne,
    LayerThirteen as unknown as new (...args: [ChainOne]) => LayerOne,
    LayerFourteen as unknown as new (...args: [ChainOne]) => LayerOne,
    LayerFifteen as unknown as new (...args: [ChainOne]) => LayerOne,
    LayerSixteen as unknown as new (...args: [ChainOne]) => LayerOne,
    LayerSeventeen as unknown as new (...args: [ChainOne]) => LayerOne,
    LayerEighteen as unknown as new (...args: [ChainOne]) => LayerOne,
    LayerNineteen as unknown as new (...args: [ChainOne]) => LayerOne,
    LayerTwenty as unknown as new (...args: [ChainOne]) => LayerOne,
    LayerForty as unknown as new (...args: [ChainOne]) => LayerOne,
  ];
  for (let i = 0; i < Math.max(0, size); i += 1) {
    const ClassType = builders[i % builders.length];
    chain.push(new ClassType(seed));
  }
  return chain;
};

export const deepChainIntersection = (size = 4): ChainForty[] => {
  const base: LayerFortyShape = {
    marker: 'one',
    level: 40,
    id: 'seed-root',
    oneToTwo: true,
    twoToThree: true,
    threeToFour: true,
    fourToFive: true,
    fiveToSix: true,
    sixToSeven: true,
    sevenToEight: true,
    eightToNine: true,
    nineToTen: true,
    tenToEleven: true,
    elevenToTwelve: true,
    twelveToThirteen: true,
    thirteenToFourteen: true,
    fourteenToFifteen: true,
    fifteenToSixteen: true,
    sixteenToSeventeen: true,
    seventeenToEighteen: true,
    eighteenToNineteen: true,
    nineteenToTwenty: true,
    twentyToTwentyOne: true,
    twentyOneToTwentyTwo: true,
    twentyTwoToTwentyThree: true,
    twentyThreeToTwentyFour: true,
    twentyFourToTwentyFive: true,
    twentyFiveToTwentySix: true,
    twentySixToTwentySeven: true,
    twentySevenToTwentyEight: true,
    twentyEightToTwentyNine: true,
    twentyNineToThirty: true,
    thirtyToThirtyOne: true,
    thirtyOneToThirtyTwo: true,
    thirtyTwoToThirtyThree: true,
    thirtyThreeToThirtyFour: true,
    thirtyFourToThirtyFive: true,
    thirtyFiveToThirtySix: true,
    thirtySixToThirtySeven: true,
    thirtySevenToThirtyEight: true,
    thirtyEightToThirtyNine: true,
    thirtyNineToForty: true,
  };

  return Array.from({ length: Math.max(0, size) }, (_, index) => {
    return {
      ...base,
      level: index,
      id: `forty-${index}`,
    } as unknown as ChainForty;
  });
};
