interface LayerAlpha {
  readonly layer: number;
  readonly alphaFlag: `alpha-${number}`;
}

interface LayerBeta extends LayerAlpha {
  readonly betaFlag: `beta-${number}`;
}

interface LayerGamma extends LayerBeta {
  readonly gammaFlag: `gamma-${number}`;
}

interface LayerDelta extends LayerGamma {
  readonly deltaFlag: `delta-${number}`;
}

interface LayerEpsilon extends LayerDelta {
  readonly epsilonFlag: `epsilon-${number}`;
}

interface LayerZeta extends LayerEpsilon {
  readonly zetaFlag: `zeta-${number}`;
}

interface LayerEta extends LayerZeta {
  readonly etaFlag: `eta-${number}`;
}

interface LayerTheta extends LayerEta {
  readonly thetaFlag: `theta-${number}`;
}

interface LayerIota extends LayerTheta {
  readonly iotaFlag: `iota-${number}`;
}

interface LayerKappa extends LayerIota {
  readonly kappaFlag: `kappa-${number}`;
}

interface LayerLambda extends LayerKappa {
  readonly lambdaFlag: `lambda-${number}`;
}

interface LayerMu extends LayerLambda {
  readonly muFlag: `mu-${number}`;
}

interface LayerNu extends LayerMu {
  readonly nuFlag: `nu-${number}`;
}

interface LayerXi extends LayerNu {
  readonly xiFlag: `xi-${number}`;
}

interface LayerOmicron extends LayerXi {
  readonly omicronFlag: `omicron-${number}`;
}

interface LayerPi extends LayerOmicron {
  readonly piFlag: `pi-${number}`;
}

interface LayerRho extends LayerPi {
  readonly rhoFlag: `rho-${number}`;
}

interface LayerSigma extends LayerRho {
  readonly sigmaFlag: `sigma-${number}`;
}

interface LayerTau extends LayerSigma {
  readonly tauFlag: `tau-${number}`;
}

interface LayerUpsilon extends LayerTau {
  readonly upsilonFlag: `upsilon-${number}`;
}

interface LayerPhi extends LayerUpsilon {
  readonly phiFlag: `phi-${number}`;
}

interface LayerChi extends LayerPhi {
  readonly chiFlag: `chi-${number}`;
}

interface LayerPsi extends LayerChi {
  readonly psiFlag: `psi-${number}`;
}

interface LayerOmega extends LayerPsi {
  readonly omegaFlag: `omega-${number}`;
}

interface LayerOne extends LayerOmega {
  readonly oneFlag: `one-${number}`;
}

interface LayerTwo extends LayerOne {
  readonly twoFlag: `two-${number}`;
}

interface LayerThree extends LayerTwo {
  readonly threeFlag: `three-${number}`;
}

interface LayerFour extends LayerThree {
  readonly fourFlag: `four-${number}`;
}

interface LayerFive extends LayerFour {
  readonly fiveFlag: `five-${number}`;
}

interface LayerSix extends LayerFive {
  readonly sixFlag: `six-${number}`;
}

interface LayerSeven extends LayerSix {
  readonly sevenFlag: `seven-${number}`;
}

interface LayerEight extends LayerSeven {
  readonly eightFlag: `eight-${number}`;
}

interface LayerNine extends LayerEight {
  readonly nineFlag: `nine-${number}`;
}

interface LayerTen extends LayerNine {
  readonly tenFlag: `ten-${number}`;
}

interface LayerEleven extends LayerTen {
  readonly elevenFlag: `eleven-${number}`;
}

interface LayerTwelve extends LayerEleven {
  readonly twelveFlag: `twelve-${number}`;
}

interface LayerThirteen extends LayerTwelve {
  readonly thirteenFlag: `thirteen-${number}`;
}

interface LayerFourteen extends LayerThirteen {
  readonly fourteenFlag: `fourteen-${number}`;
}

interface LayerFifteen extends LayerFourteen {
  readonly fifteenFlag: `fifteen-${number}`;
}

interface LayerSixteen extends LayerFifteen {
  readonly sixteenFlag: `sixteen-${number}`;
}

interface LayerSeventeen extends LayerSixteen {
  readonly seventeenFlag: `seventeen-${number}`;
}

interface LayerEighteen extends LayerSeventeen {
  readonly eighteenFlag: `eighteen-${number}`;
}

interface LayerNineteen extends LayerEighteen {
  readonly nineteenFlag: `nineteen-${number}`;
}

interface LayerTwenty extends LayerNineteen {
  readonly twentyFlag: `twenty-${number}`;
}

export type DeepLayerChain = LayerTwenty;
export type LayerTrace<T extends DeepLayerChain> = T['layer'];

export type ClassLayer<T extends ReadonlyArray<LayerAlpha>> = T extends readonly [infer Head extends LayerAlpha, ...infer Tail extends LayerAlpha[]]
  ? Tail extends []
    ? Head
    : Head & ClassLayer<Tail>
  : {};

class LayerNodeBase<TTag extends string, TLayer extends number> {
  public readonly tag: TTag;
  public readonly index: TLayer;
  public readonly createdAt: number;

  public constructor(tag: TTag, index: TLayer) {
    this.tag = tag;
    this.index = index;
    this.createdAt = Date.now();
  }

  public label(): string {
    return `${this.tag}-${this.index}-${this.createdAt}`;
  }
}

class LayerClassAlpha extends LayerNodeBase<'alpha', 0> implements LayerAlpha {
  public readonly layer = 0;
  public readonly alphaFlag = `alpha-${0}`;
}

class LayerClassBeta<T extends { readonly seed: string }> extends LayerClassAlpha implements LayerBeta {
  public readonly betaFlag = `beta-${1}`;
  public readonly seedValue: T['seed'];

  public constructor(seed: T['seed']) {
    super('alpha', 0);
    this.seedValue = seed;
  }
}

class LayerClassGamma<T extends { readonly seed: string }, TScope> extends LayerClassBeta<T> implements LayerGamma {
  public readonly gammaFlag = `gamma-${2}`;
  public readonly scope: TScope;

  public constructor(seed: T['seed'], scope: TScope) {
    super(seed);
    this.scope = scope;
  }
}

class LayerClassDelta<T extends { readonly seed: string }, TScope, TValue> extends LayerClassGamma<T, TScope> implements LayerDelta {
  public readonly deltaFlag = `delta-${3}`;
  public readonly value: TValue;

  public constructor(seed: T['seed'], scope: TScope, value: TValue) {
    super(seed, scope);
    this.value = value;
  }
}

class LayerClassEpsilon<TScope, TValue> extends LayerClassDelta<{ readonly seed: string }, TScope, TValue> implements LayerEpsilon {
  public readonly epsilonFlag = `epsilon-${4}`;
  public readonly epsilonSeed = 'epsilon';

  public constructor(seed: string, scope: TScope, value: TValue) {
    super(seed, scope, value);
  }
}

class LayerClassZeta<TScope, TValue, TMeta> extends LayerClassEpsilon<TScope, TValue> implements LayerZeta {
  public readonly zetaFlag = `zeta-${5}`;
  public readonly metadata: TMeta;

  public constructor(seed: string, scope: TScope, value: TValue, metadata: TMeta) {
    super(seed, scope, value);
    this.metadata = metadata;
  }
}

class LayerClassEta<TScope, TValue, TMeta, TTag extends string>
  extends LayerClassZeta<TScope, TValue, TMeta>
  implements LayerEta {
  public readonly etaFlag = `eta-${6}`;
  public readonly etaTag: TTag;

  public constructor(seed: string, scope: TScope, value: TValue, metadata: TMeta, etaTag: TTag) {
    super(seed, scope, value, metadata);
    this.etaTag = etaTag;
  }
}

export type BuildGenericChain<TScope, TValue, TMeta, TTag extends string> =
  LayerClassEta<TScope, TValue, TMeta, TTag> extends LayerTwenty
    ? LayerClassEta<TScope, TValue, TMeta, TTag>
    : never;

export type DeepHierarchyProbe = LayerAlpha &
  LayerBeta &
  LayerGamma &
  LayerDelta &
  LayerEpsilon &
  LayerZeta &
  LayerEta &
  LayerTheta &
  LayerIota &
  LayerKappa;

export const ensureLayerChainCompatibility = <TLeaf extends LayerTwenty>(leaf: TLeaf): LayerTwenty => leaf;

export const makeLeafNode = (seed: string): LayerTwenty => ({
  layer: 43,
  alphaFlag: 'alpha-0',
  betaFlag: 'beta-1',
  gammaFlag: 'gamma-2',
  deltaFlag: 'delta-3',
  epsilonFlag: 'epsilon-4',
  zetaFlag: 'zeta-5',
  etaFlag: 'eta-6',
  thetaFlag: 'theta-7',
  iotaFlag: 'iota-8',
  kappaFlag: 'kappa-9',
  lambdaFlag: 'lambda-10',
  muFlag: 'mu-11',
  nuFlag: 'nu-12',
  xiFlag: 'xi-13',
  omicronFlag: 'omicron-14',
  piFlag: 'pi-15',
  rhoFlag: 'rho-16',
  sigmaFlag: 'sigma-17',
  tauFlag: 'tau-18',
  upsilonFlag: 'upsilon-19',
  phiFlag: 'phi-20',
  chiFlag: 'chi-21',
  psiFlag: 'psi-22',
  omegaFlag: 'omega-23',
  oneFlag: 'one-24',
  twoFlag: 'two-25',
  threeFlag: 'three-26',
  fourFlag: 'four-27',
  fiveFlag: 'five-28',
  sixFlag: 'six-29',
  sevenFlag: 'seven-30',
  eightFlag: 'eight-31',
  nineFlag: 'nine-32',
  tenFlag: 'ten-33',
  elevenFlag: 'eleven-34',
  twelveFlag: 'twelve-35',
  thirteenFlag: 'thirteen-36',
  fourteenFlag: 'fourteen-37',
  fifteenFlag: 'fifteen-38',
  sixteenFlag: 'sixteen-39',
  seventeenFlag: 'seventeen-40',
  eighteenFlag: 'eighteen-41',
  nineteenFlag: 'nineteen-42',
  twentyFlag: 'twenty-43',
});

export const buildLayerClass = <TSeed extends string>(
  seed: TSeed,
  scope: string,
): LayerClassEta<string, number, { scope: string }, 'eta'> => {
  return new LayerClassEta(seed, scope, 43, { scope }, 'eta');
};
