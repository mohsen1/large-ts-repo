export interface InterfaceCascade0 {
  readonly depth: 0;
  readonly marker: 'cascade-0';
  readonly payload: 'seed';
}

export interface InterfaceCascade1 {
  readonly depth: 1;
  readonly marker: 'cascade-1';
  readonly parent: InterfaceCascade0;
}

export interface InterfaceCascade2 {
  readonly depth: 2;
  readonly marker: 'cascade-2';
  readonly parent: InterfaceCascade1;
}

export interface InterfaceCascade3 {
  readonly depth: 3;
  readonly marker: 'cascade-3';
  readonly parent: InterfaceCascade2;
}

export interface InterfaceCascade4 {
  readonly depth: 4;
  readonly marker: 'cascade-4';
  readonly parent: InterfaceCascade3;
}

export interface InterfaceCascade5 {
  readonly depth: 5;
  readonly marker: 'cascade-5';
  readonly parent: InterfaceCascade4;
}

export interface InterfaceCascade6 {
  readonly depth: 6;
  readonly marker: 'cascade-6';
  readonly parent: InterfaceCascade5;
}

export interface InterfaceCascade7 {
  readonly depth: 7;
  readonly marker: 'cascade-7';
  readonly parent: InterfaceCascade6;
}

export interface InterfaceCascade8 {
  readonly depth: 8;
  readonly marker: 'cascade-8';
  readonly parent: InterfaceCascade7;
}

export interface InterfaceCascade9 {
  readonly depth: 9;
  readonly marker: 'cascade-9';
  readonly parent: InterfaceCascade8;
}

export interface InterfaceCascade10 {
  readonly depth: 10;
  readonly marker: 'cascade-10';
  readonly parent: InterfaceCascade9;
}

export interface InterfaceCascade11 {
  readonly depth: 11;
  readonly marker: 'cascade-11';
  readonly parent: InterfaceCascade10;
}

export interface InterfaceCascade12 {
  readonly depth: 12;
  readonly marker: 'cascade-12';
  readonly parent: InterfaceCascade11;
}

export interface InterfaceCascade13 {
  readonly depth: 13;
  readonly marker: 'cascade-13';
  readonly parent: InterfaceCascade12;
}

export interface InterfaceCascade14 {
  readonly depth: 14;
  readonly marker: 'cascade-14';
  readonly parent: InterfaceCascade13;
}

export interface InterfaceCascade15 {
  readonly depth: 15;
  readonly marker: 'cascade-15';
  readonly parent: InterfaceCascade14;
}

export interface InterfaceCascade16 {
  readonly depth: 16;
  readonly marker: 'cascade-16';
  readonly parent: InterfaceCascade15;
}

export interface InterfaceCascade17 {
  readonly depth: 17;
  readonly marker: 'cascade-17';
  readonly parent: InterfaceCascade16;
}

export interface InterfaceCascade18 {
  readonly depth: 18;
  readonly marker: 'cascade-18';
  readonly parent: InterfaceCascade17;
}

export interface InterfaceCascade19 {
  readonly depth: 19;
  readonly marker: 'cascade-19';
  readonly parent: InterfaceCascade18;
}

export interface InterfaceCascade20 {
  readonly depth: 20;
  readonly marker: 'cascade-20';
  readonly parent: InterfaceCascade19;
}

export interface InterfaceCascade21 {
  readonly depth: 21;
  readonly marker: 'cascade-21';
  readonly parent: InterfaceCascade20;
}

export interface InterfaceCascade22 {
  readonly depth: 22;
  readonly marker: 'cascade-22';
  readonly parent: InterfaceCascade21;
}

export interface InterfaceCascade23 {
  readonly depth: 23;
  readonly marker: 'cascade-23';
  readonly parent: InterfaceCascade22;
}

export interface InterfaceCascade24 {
  readonly depth: 24;
  readonly marker: 'cascade-24';
  readonly parent: InterfaceCascade23;
}

export interface InterfaceCascade25 {
  readonly depth: 25;
  readonly marker: 'cascade-25';
  readonly parent: InterfaceCascade24;
}

export interface InterfaceCascade26 {
  readonly depth: 26;
  readonly marker: 'cascade-26';
  readonly parent: InterfaceCascade25;
}

export interface InterfaceCascade27 {
  readonly depth: 27;
  readonly marker: 'cascade-27';
  readonly parent: InterfaceCascade26;
}

export interface InterfaceCascade28 {
  readonly depth: 28;
  readonly marker: 'cascade-28';
  readonly parent: InterfaceCascade27;
}

export interface InterfaceCascade29 {
  readonly depth: 29;
  readonly marker: 'cascade-29';
  readonly parent: InterfaceCascade28;
}

export interface InterfaceCascade30 {
  readonly depth: 30;
  readonly marker: 'cascade-30';
  readonly parent: InterfaceCascade29;
}

export interface InterfaceCascade31 {
  readonly depth: 31;
  readonly marker: 'cascade-31';
  readonly parent: InterfaceCascade30;
}

export interface InterfaceCascade32 {
  readonly depth: 32;
  readonly marker: 'cascade-32';
  readonly parent: InterfaceCascade31;
}

export interface InterfaceCascade33 {
  readonly depth: 33;
  readonly marker: 'cascade-33';
  readonly parent: InterfaceCascade32;
}

export interface InterfaceCascade34 {
  readonly depth: 34;
  readonly marker: 'cascade-34';
  readonly parent: InterfaceCascade33;
}

export interface InterfaceCascade35 {
  readonly depth: 35;
  readonly marker: 'cascade-35';
  readonly parent: InterfaceCascade34;
}

export type CascadeChainRoot = InterfaceCascade35;

export class ClassCascade0<TId extends string = 'class-0'> {
  public readonly level: number;
  public readonly kind: string;

  public constructor(
    public readonly id: TId,
    level: number,
    kind: string,
  ) {
    this.level = level;
    this.kind = kind;
  }
}

export class ClassCascade1<TId extends string, TPrev extends ClassCascade0<string>> extends ClassCascade0<TId> {
  public readonly previous: TPrev;

  public constructor(
    previous: TPrev,
    id: TId,
  ) {
    super(id, 1, 'cascade-class-1');
    this.previous = previous;
  }

  public toPath(): string {
    return `${this.previous.id}->${this.id}`;
  }
}

export class ClassCascade2<TId extends string, TPrev extends ClassCascade0<string>> extends ClassCascade1<TId, TPrev> {
  public constructor(previous: TPrev, id: TId) {
    super(previous, id);
    (this as { level: number; kind: string }).level = 2;
    (this as { level: number; kind: string }).kind = 'cascade-class-2';
  }
}

export class ClassCascade3<TId extends string, TPrev extends ClassCascade0<string>> extends ClassCascade2<TId, TPrev> {
  public constructor(previous: TPrev, id: TId) {
    super(previous, id);
    (this as { level: number; kind: string }).level = 3;
    (this as { level: number; kind: string }).kind = 'cascade-class-3';
  }
}

export class ClassCascade4<TId extends string, TPrev extends ClassCascade0<string>> extends ClassCascade3<TId, TPrev> {
  public constructor(previous: TPrev, id: TId) {
    super(previous, id);
    (this as { level: number; kind: string }).level = 4;
    (this as { level: number; kind: string }).kind = 'cascade-class-4';
  }
}

export class ClassCascade5<TId extends string, TPrev extends ClassCascade0<string>> extends ClassCascade4<TId, TPrev> {
  public constructor(previous: TPrev, id: TId) {
    super(previous, id);
    (this as { level: number; kind: string }).level = 5;
    (this as { level: number; kind: string }).kind = 'cascade-class-5';
  }
}

export class ClassCascade6<TId extends string, TPrev extends ClassCascade0<string>> extends ClassCascade5<TId, TPrev> {
  public constructor(previous: TPrev, id: TId) {
    super(previous, id);
    (this as { level: number; kind: string }).level = 6;
    (this as { level: number; kind: string }).kind = 'cascade-class-6';
  }
}

export class ClassCascade7<TId extends string, TPrev extends ClassCascade0<string>> extends ClassCascade6<TId, TPrev> {
  public constructor(previous: TPrev, id: TId) {
    super(previous, id);
    (this as { level: number; kind: string }).level = 7;
    (this as { level: number; kind: string }).kind = 'cascade-class-7';
  }
}

export class ClassCascade8<TId extends string, TPrev extends ClassCascade0<string>> extends ClassCascade7<TId, TPrev> {
  public constructor(previous: TPrev, id: TId) {
    super(previous, id);
    (this as { level: number; kind: string }).level = 8;
    (this as { level: number; kind: string }).kind = 'cascade-class-8';
  }
}

export class ClassCascade9<TId extends string, TPrev extends ClassCascade0<string>> extends ClassCascade8<TId, TPrev> {
  public constructor(previous: TPrev, id: TId) {
    super(previous, id);
    (this as { level: number; kind: string }).level = 9;
    (this as { level: number; kind: string }).kind = 'cascade-class-9';
  }
}

export class ClassCascade10<TId extends string, TPrev extends ClassCascade0<string>> extends ClassCascade9<TId, TPrev> {
  public constructor(previous: TPrev, id: TId) {
    super(previous, id);
    (this as { level: number; kind: string }).level = 10;
    (this as { level: number; kind: string }).kind = 'cascade-class-10';
  }
}

export class ClassCascade11<TId extends string, TPrev extends ClassCascade0<string>> extends ClassCascade10<TId, TPrev> {
  public constructor(previous: TPrev, id: TId) {
    super(previous, id);
    (this as { level: number; kind: string }).level = 11;
    (this as { level: number; kind: string }).kind = 'cascade-class-11';
  }
}

type CascadeNode1 = ClassCascade1<'class-1', ClassCascade0<string>>;
type CascadeNode2 = ClassCascade2<'class-2', CascadeNode1>;
type CascadeNode3 = ClassCascade3<'class-3', CascadeNode2>;
type CascadeNode4 = ClassCascade4<'class-4', CascadeNode3>;
type CascadeNode5 = ClassCascade5<'class-5', CascadeNode4>;
type CascadeNode6 = ClassCascade6<'class-6', CascadeNode5>;
type CascadeNode7 = ClassCascade7<'class-7', CascadeNode6>;
type CascadeNode8 = ClassCascade8<'class-8', CascadeNode7>;
type CascadeNode9 = ClassCascade9<'class-9', CascadeNode8>;
type CascadeNode10 = ClassCascade10<'class-10', CascadeNode9>;
type CascadeNode11 = ClassCascade11<'class-11', CascadeNode10>;

export interface CascadeNodeMap {
  readonly root: ClassCascade0<'class-0'>;
  readonly deep: CascadeNode11;
}

export const buildCascadePath = (seed = 'class-0' as const): CascadeNode11 => {
  const root = new ClassCascade0(seed, 0, 'cascade-class-root');
  const a = new ClassCascade1(root, 'class-1');
  const b = new ClassCascade2(a, 'class-2');
  const c = new ClassCascade3(b, 'class-3');
  const d = new ClassCascade4(c, 'class-4');
  const e = new ClassCascade5(d, 'class-5');
  const f = new ClassCascade6(e, 'class-6');
  const g = new ClassCascade7(f, 'class-7');
  const h = new ClassCascade8(g, 'class-8');
  const i = new ClassCascade9(h, 'class-9');
  const j = new ClassCascade10(i, 'class-10');
  const k = new ClassCascade11(j, 'class-11');
  return k as unknown as CascadeNode11;
};

export type UnpackCascadeDepth<T> = T extends InterfaceCascade0 ? 0 : T extends InterfaceCascade1 ? 1 : T extends InterfaceCascade2 ? 2 : T extends InterfaceCascade3 ? 3 : T extends InterfaceCascade4 ? 4 : T extends InterfaceCascade5 ? 5 : T extends InterfaceCascade6 ? 6 : T extends InterfaceCascade7 ? 7 : T extends InterfaceCascade8 ? 8 : T extends InterfaceCascade9 ? 9 : T extends InterfaceCascade10 ? 10 : T extends InterfaceCascade11 ? 11 : T extends InterfaceCascade12 ? 12 : T extends InterfaceCascade13 ? 13 : T extends InterfaceCascade14 ? 14 : T extends InterfaceCascade15 ? 15 : T extends InterfaceCascade16 ? 16 : T extends InterfaceCascade17 ? 17 : T extends InterfaceCascade18 ? 18 : T extends InterfaceCascade19 ? 19 : T extends InterfaceCascade20 ? 20 : T extends InterfaceCascade21 ? 21 : T extends InterfaceCascade22 ? 22 : T extends InterfaceCascade23 ? 23 : T extends InterfaceCascade24 ? 24 : T extends InterfaceCascade25 ? 25 : T extends InterfaceCascade26 ? 26 : T extends InterfaceCascade27 ? 27 : T extends InterfaceCascade28 ? 28 : T extends InterfaceCascade29 ? 29 : T extends InterfaceCascade30 ? 30 : T extends InterfaceCascade31 ? 31 : T extends InterfaceCascade32 ? 32 : T extends InterfaceCascade33 ? 33 : T extends InterfaceCascade34 ? 34 : T extends InterfaceCascade35 ? 35 : 36;

export const resolveCascadeDepth = <T>(node: T): UnpackCascadeDepth<T> => {
  return ('kind' in (node as { kind?: string }) && `${(node as { kind: string }).kind}`.includes('11')) ?
    (11 as UnpackCascadeDepth<T>) :
    (0 as UnpackCascadeDepth<T>);
};
