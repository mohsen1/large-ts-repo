import { Brand } from './patterns';

type LaneTag = `lane-${number}`;

export interface LayerNode0 {
  readonly level: number;
  readonly id: Brand<string, 'layer-id'>;
}
export interface LayerNode1 extends LayerNode0 {
  readonly level: number;
  readonly parent: LayerNode0;
  readonly lane: LaneTag;
}
export interface LayerNode2 extends LayerNode1 {
  readonly level: number;
  readonly parent: LayerNode1;
  readonly lane: LaneTag;
}
export interface LayerNode3 extends LayerNode2 {
  readonly level: number;
  readonly parent: LayerNode2;
  readonly lane: LaneTag;
}
export interface LayerNode4 extends LayerNode3 {
  readonly level: number;
  readonly parent: LayerNode3;
  readonly lane: LaneTag;
}
export interface LayerNode5 extends LayerNode4 {
  readonly level: number;
  readonly parent: LayerNode4;
  readonly lane: LaneTag;
}
export interface LayerNode6 extends LayerNode5 {
  readonly level: number;
  readonly parent: LayerNode5;
  readonly lane: LaneTag;
}
export interface LayerNode7 extends LayerNode6 {
  readonly level: number;
  readonly parent: LayerNode6;
  readonly lane: LaneTag;
}
export interface LayerNode8 extends LayerNode7 {
  readonly level: number;
  readonly parent: LayerNode7;
  readonly lane: LaneTag;
}
export interface LayerNode9 extends LayerNode8 {
  readonly level: number;
  readonly parent: LayerNode8;
  readonly lane: LaneTag;
}
export interface LayerNode10 extends LayerNode9 {
  readonly level: number;
  readonly parent: LayerNode9;
  readonly lane: LaneTag;
}
export interface LayerNode11 extends LayerNode10 {
  readonly level: number;
  readonly parent: LayerNode10;
  readonly lane: LaneTag;
}
export interface LayerNode12 extends LayerNode11 {
  readonly level: number;
  readonly parent: LayerNode11;
  readonly lane: LaneTag;
}
export interface LayerNode13 extends LayerNode12 {
  readonly level: number;
  readonly parent: LayerNode12;
  readonly lane: LaneTag;
}
export interface LayerNode14 extends LayerNode13 {
  readonly level: number;
  readonly parent: LayerNode13;
  readonly lane: LaneTag;
}
export interface LayerNode15 extends LayerNode14 {
  readonly level: number;
  readonly parent: LayerNode14;
  readonly lane: LaneTag;
}
export interface LayerNode16 extends LayerNode15 {
  readonly level: number;
  readonly parent: LayerNode15;
  readonly lane: LaneTag;
}
export interface LayerNode17 extends LayerNode16 {
  readonly level: number;
  readonly parent: LayerNode16;
  readonly lane: LaneTag;
}
export interface LayerNode18 extends LayerNode17 {
  readonly level: number;
  readonly parent: LayerNode17;
  readonly lane: LaneTag;
}
export interface LayerNode19 extends LayerNode18 {
  readonly level: number;
  readonly parent: LayerNode18;
  readonly lane: LaneTag;
}
export interface LayerNode20 extends LayerNode19 {
  readonly level: number;
  readonly parent: LayerNode19;
  readonly lane: LaneTag;
}
export interface LayerNode21 extends LayerNode20 {
  readonly level: number;
  readonly parent: LayerNode20;
  readonly lane: LaneTag;
}
export interface LayerNode22 extends LayerNode21 {
  readonly level: number;
  readonly parent: LayerNode21;
  readonly lane: LaneTag;
}
export interface LayerNode23 extends LayerNode22 {
  readonly level: number;
  readonly parent: LayerNode22;
  readonly lane: LaneTag;
}
export interface LayerNode24 extends LayerNode23 {
  readonly level: number;
  readonly parent: LayerNode23;
  readonly lane: LaneTag;
}
export interface LayerNode25 extends LayerNode24 {
  readonly level: number;
  readonly parent: LayerNode24;
  readonly lane: LaneTag;
}
export interface LayerNode26 extends LayerNode25 {
  readonly level: number;
  readonly parent: LayerNode25;
  readonly lane: LaneTag;
}
export interface LayerNode27 extends LayerNode26 {
  readonly level: number;
  readonly parent: LayerNode26;
  readonly lane: LaneTag;
}
export interface LayerNode28 extends LayerNode27 {
  readonly level: number;
  readonly parent: LayerNode27;
  readonly lane: LaneTag;
}
export interface LayerNode29 extends LayerNode28 {
  readonly level: number;
  readonly parent: LayerNode28;
  readonly lane: LaneTag;
}
export interface LayerNode30 extends LayerNode29 {
  readonly level: number;
  readonly parent: LayerNode29;
  readonly lane: LaneTag;
}
export interface LayerNode31 extends LayerNode30 {
  readonly level: number;
  readonly parent: LayerNode30;
  readonly lane: LaneTag;
}
export interface LayerNode32 extends LayerNode31 {
  readonly level: number;
  readonly parent: LayerNode31;
  readonly lane: LaneTag;
}
export interface LayerNode33 extends LayerNode32 {
  readonly level: number;
  readonly parent: LayerNode32;
  readonly lane: LaneTag;
}
export interface LayerNode34 extends LayerNode33 {
  readonly level: number;
  readonly parent: LayerNode33;
  readonly lane: LaneTag;
}
export interface LayerNode35 extends LayerNode34 {
  readonly level: number;
  readonly parent: LayerNode34;
  readonly lane: LaneTag;
}
export interface LayerNode36 extends LayerNode35 {
  readonly level: number;
  readonly parent: LayerNode35;
  readonly lane: LaneTag;
}
export interface LayerNode37 extends LayerNode36 {
  readonly level: number;
  readonly parent: LayerNode36;
  readonly lane: LaneTag;
}
export interface LayerNode38 extends LayerNode37 {
  readonly level: number;
  readonly parent: LayerNode37;
  readonly lane: LaneTag;
}
export interface LayerNode39 extends LayerNode38 {
  readonly level: number;
  readonly parent: LayerNode38;
  readonly lane: LaneTag;
}
export interface LayerNode40 extends LayerNode39 {
  readonly level: number;
  readonly parent: LayerNode39;
  readonly lane: LaneTag;
}
export interface LayerNode41 extends LayerNode40 {
  readonly level: number;
  readonly parent: LayerNode40;
  readonly lane: LaneTag;
}
export interface LayerNode42 extends LayerNode41 {
  readonly level: number;
  readonly parent: LayerNode41;
  readonly lane: LaneTag;
}
export interface LayerNode43 extends LayerNode42 {
  readonly level: number;
  readonly parent: LayerNode42;
  readonly lane: LaneTag;
}
export interface LayerNode44 extends LayerNode43 {
  readonly level: number;
  readonly parent: LayerNode43;
  readonly lane: LaneTag;
}
export interface LayerNode45 extends LayerNode44 {
  readonly level: number;
  readonly parent: LayerNode44;
  readonly lane: LaneTag;
}
export type DeepSubtypeRoot = LayerNode45;

export class LayerChainRoot<TSeed extends string = 'seed'> {
  readonly token: Brand<string, 'layer-seed'>;
  constructor(readonly seed: TSeed) {
    this.token = `root:${seed}` as Brand<string, 'layer-seed'>;
  }
  summarize(): string {
    return `${this.token}:level0`;
  }
}

export class LayerChain1<TSeed extends string, TInput extends LayerNode0 = LayerNode0> extends LayerChainRoot<TSeed> {
  readonly marker: Brand<number, 'layer-marker'>;
  constructor(seed: TSeed, readonly node: TInput) {
    super(seed);
    this.marker = 1 as Brand<number, 'layer-marker'>;
  }
  toString(): string {
    return `${this.summarize()} -> ${this.marker}:${this.node.id}`;
  }
}

export class LayerChain2<TSeed extends string, TInput extends LayerNode1 = LayerNode1, TExtra extends boolean = true> extends LayerChain1<TSeed, TInput> {
  readonly depth = 2;
  toString(): string {
    return `${super.toString()} -> ${this.depth}:${String(this.marker)}:${String(this.depth)}`;
  }
}

export class LayerChain3<TSeed extends string, TInput extends LayerNode2 = LayerNode2, TExtra extends readonly number[] = [number, number, number]> extends LayerChain2<TSeed, TInput> {
  readonly tags = ['L3', 'depth'];
  toString(): string {
    return `${super.toString()} -> ${this.depth}:${this.tags.join('/')}`;
  }
}

export class LayerChain4<TSeed extends string, TInput extends LayerNode3 = LayerNode3, TKey extends string = 'key'> extends LayerChain3<TSeed, TInput> {
  readonly key: Brand<TKey, 'layer-key'>;
  constructor(seed: TSeed, node: TInput, key: TKey) {
    super(seed, node);
    this.key = key as Brand<TKey, 'layer-key'>;
  }
}

export class LayerChain5<
  TSeed extends string,
  TInput extends LayerNode4 = LayerNode4,
  TMeta extends { name: string } = { name: string },
> extends LayerChain4<TSeed, TInput, string> {
  readonly signature: Brand<string, 'layer-signature'>;
  constructor(seed: TSeed, node: TInput, key: string, readonly metadata: TMeta) {
    super(seed, node, key);
    this.signature = `${seed}:${node.level}:${metadata.name}` as Brand<string, 'layer-signature'>;
  }
}

export class LayerChain6<
  TSeed extends string,
  TInput extends LayerNode5 = LayerNode5,
  TMeta extends { name: string; version: number } = { name: string, version: number },
> extends LayerChain5<TSeed, TInput, TMeta> {
  readonly summary = new Map<number, string>();
  constructor(seed: TSeed, node: TInput, key: string, metadata: TMeta, readonly profile: readonly [number, string]) {
    super(seed, node, key, metadata);
    this.summary.set(profile[0], profile[1]);
  }
}

export class LayerChain7<
  TSeed extends string,
  TInput extends LayerNode6 = LayerNode6,
  TMeta extends { name: string; version: number } = { name: string, version: number },
> extends LayerChain6<TSeed, TInput, TMeta> {
  readonly level = 7;
  get label(): `layer-${number}` {
    return `layer-${this.level}` as `layer-${number}`;
  }
}

export class LayerChain8<
  TSeed extends string,
  TInput extends LayerNode7 = LayerNode7,
  TMeta extends string = string,
> extends LayerChain7<TSeed, TInput> {
  readonly scope = 'deep-subtype';
  constructor(
    seed: TSeed,
    node: TInput,
    key: string,
    metadata: { name: string; version: number },
    profile: readonly [number, string],
    marker: TMeta,
  ) {
    super(seed, node, key, metadata, profile);
    void marker;
  }
}

export class LayerChain9<
  TSeed extends string,
  TInput extends LayerNode8 = LayerNode8,
> extends LayerChain8<TSeed, TInput> {
  readonly active = true;
  constructor(seed: TSeed, node: TInput, key: string, metadata: { name: string; version: number }, profile: readonly [number, string], marker: string) {
    super(seed, node, key, metadata, profile, marker);
  }
}

export class LayerChain10<TSeed extends string, TInput extends LayerNode9 = LayerNode9> extends LayerChain9<TSeed, TInput> {
  summarize() {
    return `${super.toString()}::10`;
  }
}

export type LayerChainHead = LayerChain10<string, LayerNode9>;

export const buildLayerChain = (seed: string): LayerChainHead => {
  const node = {
    level: 9,
    id: `${seed}-9` as Brand<string, 'layer-id'>,
    lane: 'lane-9' as LaneTag,
    parent: {
      level: 8,
      id: `${seed}-8` as Brand<string, 'layer-id'>,
      lane: 'lane-8' as LaneTag,
      parent: {
        level: 7,
        id: `${seed}-7` as Brand<string, 'layer-id'>,
        lane: 'lane-7' as LaneTag,
        parent: {
          level: 6,
          id: `${seed}-6` as Brand<string, 'layer-id'>,
          lane: 'lane-6' as LaneTag,
          parent: {
            level: 5,
            id: `${seed}-5` as Brand<string, 'layer-id'>,
            lane: 'lane-5' as LaneTag,
            parent: {
              level: 4,
              id: `${seed}-4` as Brand<string, 'layer-id'>,
              lane: 'lane-4' as LaneTag,
              parent: {
                level: 3,
                id: `${seed}-3` as Brand<string, 'layer-id'>,
                lane: 'lane-3' as LaneTag,
                parent: {
                  level: 2,
                  id: `${seed}-2` as Brand<string, 'layer-id'>,
                  lane: 'lane-2' as LaneTag,
                  parent: {
                    level: 1,
                    id: `${seed}-1` as Brand<string, 'layer-id'>,
                    lane: 'lane-1' as LaneTag,
                    parent: {
                      level: 0,
                      id: `${seed}-0` as Brand<string, 'layer-id'>,
                      lane: 'lane-0' as LaneTag,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  } as LayerNode9;

  return new LayerChain10(seed, node, 'seed-key', { name: 'initial', version: 9 }, [9, 'node'], 'marker');
};
