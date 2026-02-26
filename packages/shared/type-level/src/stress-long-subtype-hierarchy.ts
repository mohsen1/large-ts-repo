export interface IdentityVertex {
  readonly vertexId: string;
  readonly timestamp: number;
}

export interface VertexLayer1 extends IdentityVertex {
  readonly layer1: { readonly name: 'layer-1'; readonly factor: 1 };
}

export interface VertexLayer2 extends VertexLayer1 {
  readonly layer2: { readonly name: 'layer-2'; readonly factor: 2 };
}

export interface VertexLayer3 extends VertexLayer2 {
  readonly layer3: { readonly name: 'layer-3'; readonly factor: 3 };
}

export interface VertexLayer4 extends VertexLayer3 {
  readonly layer4: { readonly name: 'layer-4'; readonly factor: 4 };
}

export interface VertexLayer5 extends VertexLayer4 {
  readonly layer5: { readonly name: 'layer-5'; readonly factor: 5 };
}

export interface VertexLayer6 extends VertexLayer5 {
  readonly layer6: { readonly name: 'layer-6'; readonly factor: 6 };
}

export interface VertexLayer7 extends VertexLayer6 {
  readonly layer7: { readonly name: 'layer-7'; readonly factor: 7 };
}

export interface VertexLayer8 extends VertexLayer7 {
  readonly layer8: { readonly name: 'layer-8'; readonly factor: 8 };
}

export interface VertexLayer9 extends VertexLayer8 {
  readonly layer9: { readonly name: 'layer-9'; readonly factor: 9 };
}

export interface VertexLayer10 extends VertexLayer9 {
  readonly layer10: { readonly name: 'layer-10'; readonly factor: 10 };
}

export interface VertexLayer11 extends VertexLayer10 {
  readonly layer11: { readonly name: 'layer-11'; readonly factor: 11 };
}

export interface VertexLayer12 extends VertexLayer11 {
  readonly layer12: { readonly name: 'layer-12'; readonly factor: 12 };
}

export interface VertexLayer13 extends VertexLayer12 {
  readonly layer13: { readonly name: 'layer-13'; readonly factor: 13 };
}

export interface VertexLayer14 extends VertexLayer13 {
  readonly layer14: { readonly name: 'layer-14'; readonly factor: 14 };
}

export interface VertexLayer15 extends VertexLayer14 {
  readonly layer15: { readonly name: 'layer-15'; readonly factor: 15 };
}

export interface VertexLayer16 extends VertexLayer15 {
  readonly layer16: { readonly name: 'layer-16'; readonly factor: 16 };
}

export interface VertexLayer17 extends VertexLayer16 {
  readonly layer17: { readonly name: 'layer-17'; readonly factor: 17 };
}

export interface VertexLayer18 extends VertexLayer17 {
  readonly layer18: { readonly name: 'layer-18'; readonly factor: 18 };
}

export interface VertexLayer19 extends VertexLayer18 {
  readonly layer19: { readonly name: 'layer-19'; readonly factor: 19 };
}

export interface VertexLayer20 extends VertexLayer19 {
  readonly layer20: { readonly name: 'layer-20'; readonly factor: 20 };
}

export interface VertexLayer21 extends VertexLayer20 {
  readonly layer21: { readonly name: 'layer-21'; readonly factor: 21 };
}

export interface VertexLayer22 extends VertexLayer21 {
  readonly layer22: { readonly name: 'layer-22'; readonly factor: 22 };
}

export interface VertexLayer23 extends VertexLayer22 {
  readonly layer23: { readonly name: 'layer-23'; readonly factor: 23 };
}

export interface VertexLayer24 extends VertexLayer23 {
  readonly layer24: { readonly name: 'layer-24'; readonly factor: 24 };
}

export interface VertexLayer25 extends VertexLayer24 {
  readonly layer25: { readonly name: 'layer-25'; readonly factor: 25 };
}

export interface VertexLayer26 extends VertexLayer25 {
  readonly layer26: { readonly name: 'layer-26'; readonly factor: 26 };
}

export interface VertexLayer27 extends VertexLayer26 {
  readonly layer27: { readonly name: 'layer-27'; readonly factor: 27 };
}

export interface VertexLayer28 extends VertexLayer27 {
  readonly layer28: { readonly name: 'layer-28'; readonly factor: 28 };
}

export interface VertexLayer29 extends VertexLayer28 {
  readonly layer29: { readonly name: 'layer-29'; readonly factor: 29 };
}

export interface VertexLayer30 extends VertexLayer29 {
  readonly layer30: { readonly name: 'layer-30'; readonly factor: 30 };
}

export interface VertexLayer31 extends VertexLayer30 {
  readonly layer31: { readonly name: 'layer-31'; readonly factor: 31 };
}

export interface VertexLayer32 extends VertexLayer31 {
  readonly layer32: { readonly name: 'layer-32'; readonly factor: 32 };
}

export interface VertexLayer33 extends VertexLayer32 {
  readonly layer33: { readonly name: 'layer-33'; readonly factor: 33 };
}

export interface VertexLayer34 extends VertexLayer33 {
  readonly layer34: { readonly name: 'layer-34'; readonly factor: 34 };
}

export interface VertexLayer35 extends VertexLayer34 {
  readonly layer35: { readonly name: 'layer-35'; readonly factor: 35 };
}

export interface VertexLayer36 extends VertexLayer35 {
  readonly layer36: { readonly name: 'layer-36'; readonly factor: 36 };
}

export interface VertexLayer37 extends VertexLayer36 {
  readonly layer37: { readonly name: 'layer-37'; readonly factor: 37 };
}

export interface VertexLayer38 extends VertexLayer37 {
  readonly layer38: { readonly name: 'layer-38'; readonly factor: 38 };
}

export interface VertexLayer39 extends VertexLayer38 {
  readonly layer39: { readonly name: 'layer-39'; readonly factor: 39 };
}

export interface VertexLayer40 extends VertexLayer39 {
  readonly layer40: { readonly name: 'layer-40'; readonly factor: 40 };
}

export interface VertexLayer41 extends VertexLayer40 {
  readonly layer41: { readonly name: 'layer-41'; readonly factor: 41 };
}

export type LayerChain = VertexLayer41;

export type LayerEnvelope<T extends LayerChain> = {
  readonly vertex: T;
  readonly lineage: string;
  readonly active: boolean;
};

export type DeepLayerBySteps<T extends number> = T extends 41
  ? VertexLayer41
  : T extends 40
    ? VertexLayer40
    : T extends 39
      ? VertexLayer39
      : T extends 38
        ? VertexLayer38
        : T extends 37
          ? VertexLayer37
          : T extends 36
            ? VertexLayer36
            : T extends 35
              ? VertexLayer35
              : T extends 34
                ? VertexLayer34
                : T extends 33
                  ? VertexLayer33
                  : T extends 32
                    ? VertexLayer32
                    : T extends 31
                      ? VertexLayer31
                      : T extends 30
                        ? VertexLayer30
                        : T extends 29
                          ? VertexLayer29
                          : T extends 28
                            ? VertexLayer28
                            : T extends 27
                              ? VertexLayer27
                              : T extends 26
                                ? VertexLayer26
                                : T extends 25
                                  ? VertexLayer25
                                  : T extends 24
                                    ? VertexLayer24
                                    : T extends 23
                                      ? VertexLayer23
                                      : T extends 22
                                        ? VertexLayer22
                                        : T extends 21
                                          ? VertexLayer21
                                          : T extends 20
                                            ? VertexLayer20
                                            : T extends 19
                                              ? VertexLayer19
                                              : T extends 18
                                                ? VertexLayer18
                                                : T extends 17
                                                  ? VertexLayer17
                                                  : T extends 16
                                                    ? VertexLayer16
                                                    : T extends 15
                                                      ? VertexLayer15
                                                      : T extends 14
                                                        ? VertexLayer14
                                                        : T extends 13
                                                          ? VertexLayer13
                                                          : T extends 12
                                                            ? VertexLayer12
                                                            : T extends 11
                                                              ? VertexLayer11
                                                              : T extends 10
                                                                ? VertexLayer10
                                                                : T extends 9
                                                                  ? VertexLayer9
                                                                  : T extends 8
                                                                    ? VertexLayer8
                                                                    : T extends 7
                                                                      ? VertexLayer7
                                                                      : T extends 6
                                                                        ? VertexLayer6
                                                                        : T extends 5
                                                                          ? VertexLayer5
                                                                          : T extends 4
                                                                            ? VertexLayer4
                                                                            : T extends 3
                                                                              ? VertexLayer3
                                                                              : T extends 2
                                                                                ? VertexLayer2
                                                                                : VertexLayer1;

export interface GraphLink<A extends VertexLayer1 = VertexLayer1, B extends VertexLayer1 = VertexLayer1> {
  readonly source: A;
  readonly target: B;
}

export interface ClassChainRoot<T extends string> {
  readonly id: T;
  getLayer(): VertexLayer1;
}

export class LayerClass1<T extends string> implements ClassChainRoot<T> {
  constructor(readonly id: T) {}
  getLayer() {
    return { vertexId: this.id, timestamp: Date.now(), layer1: { name: 'layer-1', factor: 1 } } as VertexLayer1;
  }
}

export class LayerClass2<T extends string> extends LayerClass1<T> {
  getLayer() {
    return { ...super.getLayer(), layer1: { name: 'layer-1', factor: 1 }, layer2: { name: 'layer-2', factor: 2 } } as VertexLayer2;
  }
}

export class LayerClass3<T extends string> extends LayerClass2<T> {
  getLayer() {
    return { ...super.getLayer(), layer3: { name: 'layer-3', factor: 3 } } as VertexLayer3;
  }
}

export class LayerClass4<T extends string> extends LayerClass3<T> {
  getLayer() {
    return { ...super.getLayer(), layer4: { name: 'layer-4', factor: 4 } } as VertexLayer4;
  }
}

export class LayerClass5<T extends string> extends LayerClass4<T> {
  getLayer() {
    return { ...super.getLayer(), layer5: { name: 'layer-5', factor: 5 } } as VertexLayer5;
  }
}

export class LayerClass6<T extends string> extends LayerClass5<T> {
  getLayer() {
    return { ...super.getLayer(), layer6: { name: 'layer-6', factor: 6 } } as VertexLayer6;
  }
}

export class LayerClass7<T extends string> extends LayerClass6<T> {
  getLayer() {
    return { ...super.getLayer(), layer7: { name: 'layer-7', factor: 7 } } as VertexLayer7;
  }
}

export class LayerClass8<T extends string> extends LayerClass7<T> {
  getLayer() {
    return { ...super.getLayer(), layer8: { name: 'layer-8', factor: 8 } } as VertexLayer8;
  }
}

export class LayerClass9<T extends string> extends LayerClass8<T> {
  getLayer() {
    return { ...super.getLayer(), layer9: { name: 'layer-9', factor: 9 } } as VertexLayer9;
  }
}

export class LayerClass10<T extends string> extends LayerClass9<T> {
  getLayer() {
    return { ...super.getLayer(), layer10: { name: 'layer-10', factor: 10 } } as VertexLayer10;
  }
}

export class LayerClass11<T extends string> extends LayerClass10<T> {
  getLayer() {
    return { ...super.getLayer(), layer11: { name: 'layer-11', factor: 11 } } as VertexLayer11;
  }
}

export class LayerClass12<T extends string> extends LayerClass11<T> {
  getLayer() {
    return { ...super.getLayer(), layer12: { name: 'layer-12', factor: 12 } } as VertexLayer12;
  }
}

export class LayerClass13<T extends string> extends LayerClass12<T> {
  getLayer() {
    return { ...super.getLayer(), layer13: { name: 'layer-13', factor: 13 } } as VertexLayer13;
  }
}

export class LayerClass14<T extends string> extends LayerClass13<T> {
  getLayer() {
    return { ...super.getLayer(), layer14: { name: 'layer-14', factor: 14 } } as VertexLayer14;
  }
}

export class LayerClass15<T extends string> extends LayerClass14<T> {
  getLayer() {
    return { ...super.getLayer(), layer15: { name: 'layer-15', factor: 15 } } as VertexLayer15;
  }
}

export class LayerClass16<T extends string> extends LayerClass15<T> {
  getLayer() {
    return { ...super.getLayer(), layer16: { name: 'layer-16', factor: 16 } } as VertexLayer16;
  }
}

export class LayerClass17<T extends string> extends LayerClass16<T> {
  getLayer() {
    return { ...super.getLayer(), layer17: { name: 'layer-17', factor: 17 } } as VertexLayer17;
  }
}

export class LayerClass18<T extends string> extends LayerClass17<T> {
  getLayer() {
    return { ...super.getLayer(), layer18: { name: 'layer-18', factor: 18 } } as VertexLayer18;
  }
}

export class LayerClass19<T extends string> extends LayerClass18<T> {
  getLayer() {
    return { ...super.getLayer(), layer19: { name: 'layer-19', factor: 19 } } as VertexLayer19;
  }
}

export class LayerClass20<T extends string> extends LayerClass19<T> {
  getLayer() {
    return { ...super.getLayer(), layer20: { name: 'layer-20', factor: 20 } } as VertexLayer20;
  }
}

export const createLayerChain = <T extends string>(seed: T): LayerClass20<T> => new LayerClass20(seed);

export const extractLineage = (vertex: LayerChain): string[] => [
  vertex.layer1.name,
  vertex.layer2.name,
  vertex.layer3.name,
  vertex.layer4.name,
  vertex.layer5.name,
  vertex.layer6.name,
  vertex.layer7.name,
  vertex.layer8.name,
  vertex.layer9.name,
  vertex.layer10.name,
  vertex.layer11.name,
  vertex.layer12.name,
  vertex.layer13.name,
  vertex.layer14.name,
  vertex.layer15.name,
  vertex.layer16.name,
  vertex.layer17.name,
  vertex.layer18.name,
  vertex.layer19.name,
  vertex.layer20.name,
  'layer-21',
  'layer-22',
  'layer-23',
  'layer-24',
  'layer-25',
  'layer-26',
  'layer-27',
  'layer-28',
  'layer-29',
  'layer-30',
  'layer-31',
  'layer-32',
  'layer-33',
  'layer-34',
  'layer-35',
  'layer-36',
  'layer-37',
  'layer-38',
  'layer-39',
  'layer-40',
  'layer-41',
];

export const buildLayerSnapshot = <T extends LayerChain>(vertex: T): LayerEnvelope<T> => ({
  vertex,
  lineage: extractLineage(vertex).join('>'),
  active: true,
});
