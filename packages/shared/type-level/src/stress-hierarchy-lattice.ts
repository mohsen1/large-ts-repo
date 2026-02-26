export interface LayerAtom<Level extends number, Token extends string, Payload = unknown> {
  readonly level: Level;
  readonly token: Token;
  readonly payload: Payload;
}

export interface LayerA<T = unknown> extends LayerAtom<1, 'LayerA', T> {
  readonly nextLevel: LayerB<T>;
}

export interface LayerB<T = unknown> extends LayerAtom<2, 'LayerB', T> {
  readonly nextLevel: LayerC<T>;
}

export interface LayerC<T = unknown> extends LayerAtom<3, 'LayerC', T> {
  readonly nextLevel: LayerD<T>;
}

export interface LayerD<T = unknown> extends LayerAtom<4, 'LayerD', T> {
  readonly nextLevel: LayerE<T>;
}

export interface LayerE<T = unknown> extends LayerAtom<5, 'LayerE', T> {
  readonly nextLevel: LayerF<T>;
}

export interface LayerF<T = unknown> extends LayerAtom<6, 'LayerF', T> {
  readonly nextLevel: LayerG<T>;
}

export interface LayerG<T = unknown> extends LayerAtom<7, 'LayerG', T> {
  readonly nextLevel: LayerH<T>;
}

export interface LayerH<T = unknown> extends LayerAtom<8, 'LayerH', T> {
  readonly nextLevel: LayerI<T>;
}

export interface LayerI<T = unknown> extends LayerAtom<9, 'LayerI', T> {
  readonly nextLevel: LayerJ<T>;
}

export interface LayerJ<T = unknown> extends LayerAtom<10, 'LayerJ', T> {
  readonly nextLevel: LayerK<T>;
}

export interface LayerK<T = unknown> extends LayerAtom<11, 'LayerK', T> {
  readonly nextLevel: LayerL<T>;
}

export interface LayerL<T = unknown> extends LayerAtom<12, 'LayerL', T> {
  readonly nextLevel: LayerM<T>;
}

export interface LayerM<T = unknown> extends LayerAtom<13, 'LayerM', T> {
  readonly nextLevel: LayerN<T>;
}

export interface LayerN<T = unknown> extends LayerAtom<14, 'LayerN', T> {
  readonly nextLevel: LayerO<T>;
}

export interface LayerO<T = unknown> extends LayerAtom<15, 'LayerO', T> {
  readonly nextLevel: LayerP<T>;
}

export interface LayerP<T = unknown> extends LayerAtom<16, 'LayerP', T> {
  readonly nextLevel: LayerQ<T>;
}

export interface LayerQ<T = unknown> extends LayerAtom<17, 'LayerQ', T> {
  readonly nextLevel: LayerR<T>;
}

export interface LayerR<T = unknown> extends LayerAtom<18, 'LayerR', T> {
  readonly nextLevel: LayerS<T>;
}

export interface LayerS<T = unknown> extends LayerAtom<19, 'LayerS', T> {
  readonly nextLevel: LayerT<T>;
}

export interface LayerT<T = unknown> extends LayerAtom<20, 'LayerT', T> {
  readonly nextLevel: LayerU<T>;
}

export interface LayerU<T = unknown> extends LayerAtom<21, 'LayerU', T> {
  readonly nextLevel: LayerV<T>;
}

export interface LayerV<T = unknown> extends LayerAtom<22, 'LayerV', T> {
  readonly nextLevel: LayerW<T>;
}

export interface LayerW<T = unknown> extends LayerAtom<23, 'LayerW', T> {
  readonly nextLevel: LayerX<T>;
}

export interface LayerX<T = unknown> extends LayerAtom<24, 'LayerX', T> {
  readonly nextLevel: LayerY<T>;
}

export interface LayerY<T = unknown> extends LayerAtom<25, 'LayerY', T> {
  readonly nextLevel: LayerZ<T>;
}

export interface LayerZ<T = unknown> extends LayerAtom<26, 'LayerZ', T> {
  readonly nextLevel: LayerAA<T>;
}

export interface LayerAA<T = unknown> extends LayerAtom<27, 'LayerAA', T> {
  readonly nextLevel: LayerAB<T>;
}

export interface LayerAB<T = unknown> extends LayerAtom<28, 'LayerAB', T> {
  readonly nextLevel: LayerAC<T>;
}

export interface LayerAC<T = unknown> extends LayerAtom<29, 'LayerAC', T> {
  readonly nextLevel: LayerAD<T>;
}

export interface LayerAD<T = unknown> extends LayerAtom<30, 'LayerAD', T> {
  readonly nextLevel: LayerAE<T>;
}

export interface LayerAE<T = unknown> extends LayerAtom<31, 'LayerAE', T> {
  readonly nextLevel: LayerAF<T>;
}

export interface LayerAF<T = unknown> extends LayerAtom<32, 'LayerAF', T> {
  readonly nextLevel: LayerAG<T>;
}

export interface LayerAG<T = unknown> extends LayerAtom<33, 'LayerAG', T> {
  readonly nextLevel: LayerAH<T>;
}

export interface LayerAH<T = unknown> extends LayerAtom<34, 'LayerAH', T> {
  readonly nextLevel: LayerAI<T>;
}

export interface LayerAI<T = unknown> extends LayerAtom<35, 'LayerAI', T> {
  readonly nextLevel: LayerAJ<T>;
}

export interface LayerAJ<T = unknown> extends LayerAtom<36, 'LayerAJ', T> {
  readonly nextLevel: LayerAK<T>;
}

export interface LayerAK<T = unknown> extends LayerAtom<37, 'LayerAK', T> {
  readonly nextLevel: LayerAL<T>;
}

export interface LayerAL<T = unknown> extends LayerAtom<38, 'LayerAL', T> {
  readonly nextLevel: LayerAM<T>;
}

export interface LayerAM<T = unknown> extends LayerAtom<39, 'LayerAM', T> {
  readonly nextLevel: LayerAN<T>;
}

export interface LayerAN<T = unknown> extends LayerAtom<40, 'LayerAN', T> {
  readonly nextLevel: LayerAO<T>;
}

export interface LayerAO<T = unknown> extends LayerAtom<41, 'LayerAO', T> {
  readonly nextLevel: LayerAP<T>;
}

export interface LayerAP<T = unknown> extends LayerAtom<42, 'LayerAP', T> {
  readonly nextLevel: LayerAQ<T>;
}

export interface LayerAQ<T = unknown> extends LayerAtom<43, 'LayerAQ', T> {
  readonly nextLevel: LayerAR<T>;
}

export interface LayerAR<T = unknown> extends LayerAtom<44, 'LayerAR', T> {
  readonly nextLevel: LayerAS<T>;
}

export interface LayerAS<T = unknown> extends LayerAtom<45, 'LayerAS', T> {
  readonly nextLevel: LayerAT<T>;
}

export interface LayerAT<T = unknown> extends LayerAtom<46, 'LayerAT', T> {
  readonly nextLevel: LayerAU<T>;
}

export interface LayerAU<T = unknown> extends LayerAtom<47, 'LayerAU', T> {
  readonly nextLevel: LayerAV<T>;
}

export interface LayerAV<T = unknown> extends LayerAtom<48, 'LayerAV', T> {
  readonly nextLevel: LayerAW<T>;
}

export interface LayerAW<T = unknown> extends LayerAtom<49, 'LayerAW', T> {
  readonly nextLevel: LayerAX<T>;
}

export interface LayerAX<T = unknown> extends LayerAtom<50, 'LayerAX', T> {
  readonly nextLevel: LayerAY<T>;
}

export interface LayerAY<T = unknown> extends LayerAtom<51, 'LayerAY', T> {
  readonly nextLevel: LayerAZ<T>;
}

export interface LayerAZ<T = unknown> {
  readonly level: 52;
  readonly token: 'LayerAZ';
  readonly payload: T;
  readonly nextLevel: undefined;
}

export type DeepLayerChain<T = unknown> =
  LayerA<T> &
  LayerB<T> &
  LayerC<T> &
  LayerD<T> &
  LayerE<T> &
  LayerF<T> &
  LayerG<T> &
  LayerH<T> &
  LayerI<T> &
  LayerJ<T> &
  LayerK<T> &
  LayerL<T> &
  LayerM<T> &
  LayerN<T> &
  LayerO<T> &
  LayerP<T> &
  LayerQ<T> &
  LayerR<T> &
  LayerS<T> &
  LayerT<T> &
  LayerU<T> &
  LayerV<T> &
  LayerW<T> &
  LayerX<T> &
  LayerY<T> &
  LayerZ<T> &
  LayerAA<T> &
  LayerAB<T> &
  LayerAC<T> &
  LayerAD<T> &
  LayerAE<T> &
  LayerAF<T> &
  LayerAG<T> &
  LayerAH<T> &
  LayerAI<T> &
  LayerAJ<T> &
  LayerAK<T> &
  LayerAL<T> &
  LayerAM<T> &
  LayerAN<T> &
  LayerAO<T> &
  LayerAP<T> &
  LayerAQ<T> &
  LayerAR<T> &
  LayerAS<T> &
  LayerAT<T> &
  LayerAU<T> &
  LayerAV<T> &
  LayerAW<T> &
  LayerAX<T> &
  LayerAY<T> &
  LayerAZ<T>;

export interface ChainNode<Payload, TName extends string> {
  readonly nodeName: TName;
  readonly payload: Payload;
}

export class ChainKernel<TPayload, TName extends string> {
  constructor(protected readonly payload: TPayload, public readonly nodeName: TName) {}

  transform<NextPayload>(next: ChainNode<NextPayload, string>): ChainKernel<NextPayload, string> {
    return new ChainKernel(next.payload, next.nodeName);
  }
}

export class LayerOne<TPayload> extends ChainKernel<TPayload, 'one'> {
  constructor(payload: TPayload) {
    super(payload, 'one');
  }

  next<NextPayload>(next: ChainNode<NextPayload, 'two'>): LayerTwo<NextPayload> {
    return new LayerTwo(next.payload);
  }
}

export class LayerTwo<TPayload> extends ChainKernel<TPayload, 'two'> {
  constructor(payload: TPayload) {
    super(payload, 'two');
  }

  next<NextPayload>(next: ChainNode<NextPayload, 'three'>): LayerThree<NextPayload> {
    return new LayerThree(next.payload);
  }
}

export class LayerThree<TPayload> extends ChainKernel<TPayload, 'three'> {
  constructor(payload: TPayload) {
    super(payload, 'three');
  }

  next<NextPayload>(next: ChainNode<NextPayload, 'four'>): LayerFour<NextPayload> {
    return new LayerFour(next.payload);
  }
}

export class LayerFour<TPayload> extends ChainKernel<TPayload, 'four'> {
  constructor(payload: TPayload) {
    super(payload, 'four');
  }

  next<NextPayload>(next: ChainNode<NextPayload, 'five'>): LayerFive<NextPayload> {
    return new LayerFive(next.payload);
  }
}

export class LayerFive<TPayload> extends ChainKernel<TPayload, 'five'> {
  constructor(payload: TPayload) {
    super(payload, 'five');
  }

  next<NextPayload>(next: ChainNode<NextPayload, 'six'>): LayerSix<NextPayload> {
    return new LayerSix(next.payload);
  }
}

export class LayerSix<TPayload> extends ChainKernel<TPayload, 'six'> {
  constructor(payload: TPayload) {
    super(payload, 'six');
  }

  next<NextPayload>(next: ChainNode<NextPayload, 'seven'>): LayerSeven<NextPayload> {
    return new LayerSeven(next.payload);
  }
}

export class LayerSeven<TPayload> extends ChainKernel<TPayload, 'seven'> {
  constructor(payload: TPayload) {
    super(payload, 'seven');
  }

  next<NextPayload>(next: ChainNode<NextPayload, 'eight'>): LayerEight<NextPayload> {
    return new LayerEight(next.payload);
  }
}

export class LayerEight<TPayload> extends ChainKernel<TPayload, 'eight'> {
  constructor(payload: TPayload) {
    super(payload, 'eight');
  }

  next<NextPayload>(next: ChainNode<NextPayload, 'nine'>): LayerNine<NextPayload> {
    return new LayerNine(next.payload);
  }
}

export class LayerNine<TPayload> extends ChainKernel<TPayload, 'nine'> {
  constructor(payload: TPayload) {
    super(payload, 'nine');
  }

  next<NextPayload>(next: ChainNode<NextPayload, 'ten'>): LayerTen<NextPayload> {
    return new LayerTen(next.payload);
  }
}

export class LayerTen<TPayload> extends ChainKernel<TPayload, 'ten'> {
  constructor(payload: TPayload) {
    super(payload, 'ten');
  }

  seal(): ReadonlyArray<string> {
    return [
      this.nodeName,
      this.nodeName,
      this.nodeName,
      this.nodeName,
      this.nodeName,
      this.nodeName,
      this.nodeName,
      this.nodeName,
      this.nodeName,
      this.nodeName,
    ];
  }
}

export type LayerChainClass<TPayload> =
  | LayerOne<TPayload>
  | LayerTwo<TPayload>
  | LayerThree<TPayload>
  | LayerFour<TPayload>
  | LayerFive<TPayload>
  | LayerSix<TPayload>
  | LayerSeven<TPayload>
  | LayerEight<TPayload>
  | LayerNine<TPayload>
  | LayerTen<TPayload>;

export const runChain = (seed: string): ReadonlyArray<string> => {
  const root = new LayerOne(seed);
  const branchTwo = root.next({ nodeName: 'two', payload: `${seed}:2` });
  const branchThree = branchTwo.next({ nodeName: 'three', payload: `${seed}:3` });
  const branchFour = branchThree.next({ nodeName: 'four', payload: `${seed}:4` });
  const branchFive = branchFour.next({ nodeName: 'five', payload: `${seed}:5` });
  const branchSix = branchFive.next({ nodeName: 'six', payload: `${seed}:6` });
  const branchSeven = branchSix.next({ nodeName: 'seven', payload: `${seed}:7` });
  const branchEight = branchSeven.next({ nodeName: 'eight', payload: `${seed}:8` });
  const branchNine = branchEight.next({ nodeName: 'nine', payload: `${seed}:9` });
  const branchTen = branchNine.next({ nodeName: 'ten', payload: `${seed}:10` });
  return branchTen.seal();
};
