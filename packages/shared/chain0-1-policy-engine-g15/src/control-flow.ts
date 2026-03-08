// Generated control flow stress module

export type chain0_1_policy_engine_CFEvent =
  | { readonly type: 'chain0_1_policy_engine_CF_case_0'; readonly value_0: number; readonly label_0: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_1'; readonly value_1: number; readonly label_1: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_2'; readonly value_2: number; readonly label_2: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_3'; readonly value_3: number; readonly label_3: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_4'; readonly value_4: number; readonly label_4: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_5'; readonly value_5: number; readonly label_5: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_6'; readonly value_6: number; readonly label_6: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_7'; readonly value_7: number; readonly label_7: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_8'; readonly value_8: number; readonly label_8: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_9'; readonly value_9: number; readonly label_9: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_10'; readonly value_10: number; readonly label_10: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_11'; readonly value_11: number; readonly label_11: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_12'; readonly value_12: number; readonly label_12: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_13'; readonly value_13: number; readonly label_13: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_14'; readonly value_14: number; readonly label_14: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_15'; readonly value_15: number; readonly label_15: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_16'; readonly value_16: number; readonly label_16: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_17'; readonly value_17: number; readonly label_17: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_18'; readonly value_18: number; readonly label_18: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_19'; readonly value_19: number; readonly label_19: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_20'; readonly value_20: number; readonly label_20: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_21'; readonly value_21: number; readonly label_21: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_22'; readonly value_22: number; readonly label_22: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_23'; readonly value_23: number; readonly label_23: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_24'; readonly value_24: number; readonly label_24: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_25'; readonly value_25: number; readonly label_25: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_26'; readonly value_26: number; readonly label_26: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_27'; readonly value_27: number; readonly label_27: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_28'; readonly value_28: number; readonly label_28: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_29'; readonly value_29: number; readonly label_29: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_30'; readonly value_30: number; readonly label_30: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_31'; readonly value_31: number; readonly label_31: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_32'; readonly value_32: number; readonly label_32: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_33'; readonly value_33: number; readonly label_33: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_34'; readonly value_34: number; readonly label_34: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_35'; readonly value_35: number; readonly label_35: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_36'; readonly value_36: number; readonly label_36: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_37'; readonly value_37: number; readonly label_37: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_38'; readonly value_38: number; readonly label_38: string }
  | { readonly type: 'chain0_1_policy_engine_CF_case_39'; readonly value_39: number; readonly label_39: string };

export function chain0_1_policy_engine_CFHandle(event: chain0_1_policy_engine_CFEvent): string {
  switch (event.type) {
    case 'chain0_1_policy_engine_CF_case_0':
      return `Handled ${event.value_0} with ${event.label_0}`;
    case 'chain0_1_policy_engine_CF_case_1':
      return `Handled ${event.value_1} with ${event.label_1}`;
    case 'chain0_1_policy_engine_CF_case_2':
      return `Handled ${event.value_2} with ${event.label_2}`;
    case 'chain0_1_policy_engine_CF_case_3':
      return `Handled ${event.value_3} with ${event.label_3}`;
    case 'chain0_1_policy_engine_CF_case_4':
      return `Handled ${event.value_4} with ${event.label_4}`;
    case 'chain0_1_policy_engine_CF_case_5':
      return `Handled ${event.value_5} with ${event.label_5}`;
    case 'chain0_1_policy_engine_CF_case_6':
      return `Handled ${event.value_6} with ${event.label_6}`;
    case 'chain0_1_policy_engine_CF_case_7':
      return `Handled ${event.value_7} with ${event.label_7}`;
    case 'chain0_1_policy_engine_CF_case_8':
      return `Handled ${event.value_8} with ${event.label_8}`;
    case 'chain0_1_policy_engine_CF_case_9':
      return `Handled ${event.value_9} with ${event.label_9}`;
    case 'chain0_1_policy_engine_CF_case_10':
      return `Handled ${event.value_10} with ${event.label_10}`;
    case 'chain0_1_policy_engine_CF_case_11':
      return `Handled ${event.value_11} with ${event.label_11}`;
    case 'chain0_1_policy_engine_CF_case_12':
      return `Handled ${event.value_12} with ${event.label_12}`;
    case 'chain0_1_policy_engine_CF_case_13':
      return `Handled ${event.value_13} with ${event.label_13}`;
    case 'chain0_1_policy_engine_CF_case_14':
      return `Handled ${event.value_14} with ${event.label_14}`;
    case 'chain0_1_policy_engine_CF_case_15':
      return `Handled ${event.value_15} with ${event.label_15}`;
    case 'chain0_1_policy_engine_CF_case_16':
      return `Handled ${event.value_16} with ${event.label_16}`;
    case 'chain0_1_policy_engine_CF_case_17':
      return `Handled ${event.value_17} with ${event.label_17}`;
    case 'chain0_1_policy_engine_CF_case_18':
      return `Handled ${event.value_18} with ${event.label_18}`;
    case 'chain0_1_policy_engine_CF_case_19':
      return `Handled ${event.value_19} with ${event.label_19}`;
    case 'chain0_1_policy_engine_CF_case_20':
      return `Handled ${event.value_20} with ${event.label_20}`;
    case 'chain0_1_policy_engine_CF_case_21':
      return `Handled ${event.value_21} with ${event.label_21}`;
    case 'chain0_1_policy_engine_CF_case_22':
      return `Handled ${event.value_22} with ${event.label_22}`;
    case 'chain0_1_policy_engine_CF_case_23':
      return `Handled ${event.value_23} with ${event.label_23}`;
    case 'chain0_1_policy_engine_CF_case_24':
      return `Handled ${event.value_24} with ${event.label_24}`;
    case 'chain0_1_policy_engine_CF_case_25':
      return `Handled ${event.value_25} with ${event.label_25}`;
    case 'chain0_1_policy_engine_CF_case_26':
      return `Handled ${event.value_26} with ${event.label_26}`;
    case 'chain0_1_policy_engine_CF_case_27':
      return `Handled ${event.value_27} with ${event.label_27}`;
    case 'chain0_1_policy_engine_CF_case_28':
      return `Handled ${event.value_28} with ${event.label_28}`;
    case 'chain0_1_policy_engine_CF_case_29':
      return `Handled ${event.value_29} with ${event.label_29}`;
    case 'chain0_1_policy_engine_CF_case_30':
      return `Handled ${event.value_30} with ${event.label_30}`;
    case 'chain0_1_policy_engine_CF_case_31':
      return `Handled ${event.value_31} with ${event.label_31}`;
    case 'chain0_1_policy_engine_CF_case_32':
      return `Handled ${event.value_32} with ${event.label_32}`;
    case 'chain0_1_policy_engine_CF_case_33':
      return `Handled ${event.value_33} with ${event.label_33}`;
    case 'chain0_1_policy_engine_CF_case_34':
      return `Handled ${event.value_34} with ${event.label_34}`;
    case 'chain0_1_policy_engine_CF_case_35':
      return `Handled ${event.value_35} with ${event.label_35}`;
    case 'chain0_1_policy_engine_CF_case_36':
      return `Handled ${event.value_36} with ${event.label_36}`;
    case 'chain0_1_policy_engine_CF_case_37':
      return `Handled ${event.value_37} with ${event.label_37}`;
    case 'chain0_1_policy_engine_CF_case_38':
      return `Handled ${event.value_38} with ${event.label_38}`;
    case 'chain0_1_policy_engine_CF_case_39':
      return `Handled ${event.value_39} with ${event.label_39}`;
  }
}

export function chain0_1_policy_engine_CFNarrow(event: chain0_1_policy_engine_CFEvent): number {
  if (event.type === 'chain0_1_policy_engine_CF_case_0') {
    return event.value_0 * 1;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_1') {
    return event.value_1 * 2;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_2') {
    return event.value_2 * 3;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_3') {
    return event.value_3 * 4;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_4') {
    return event.value_4 * 5;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_5') {
    return event.value_5 * 6;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_6') {
    return event.value_6 * 7;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_7') {
    return event.value_7 * 8;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_8') {
    return event.value_8 * 9;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_9') {
    return event.value_9 * 10;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_10') {
    return event.value_10 * 11;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_11') {
    return event.value_11 * 12;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_12') {
    return event.value_12 * 13;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_13') {
    return event.value_13 * 14;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_14') {
    return event.value_14 * 15;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_15') {
    return event.value_15 * 16;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_16') {
    return event.value_16 * 17;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_17') {
    return event.value_17 * 18;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_18') {
    return event.value_18 * 19;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_19') {
    return event.value_19 * 20;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_20') {
    return event.value_20 * 21;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_21') {
    return event.value_21 * 22;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_22') {
    return event.value_22 * 23;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_23') {
    return event.value_23 * 24;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_24') {
    return event.value_24 * 25;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_25') {
    return event.value_25 * 26;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_26') {
    return event.value_26 * 27;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_27') {
    return event.value_27 * 28;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_28') {
    return event.value_28 * 29;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_29') {
    return event.value_29 * 30;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_30') {
    return event.value_30 * 31;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_31') {
    return event.value_31 * 32;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_32') {
    return event.value_32 * 33;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_33') {
    return event.value_33 * 34;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_34') {
    return event.value_34 * 35;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_35') {
    return event.value_35 * 36;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_36') {
    return event.value_36 * 37;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_37') {
    return event.value_37 * 38;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_38') {
    return event.value_38 * 39;
  }
  else if (event.type === 'chain0_1_policy_engine_CF_case_39') {
    return event.value_39 * 40;
  }
  return 0;
}

export function chain0_1_policy_engine_GITransform<A, B, C>(a: A, fn: (a: A) => B, map: (b: B) => C): C {
  return map(fn(a));
}

export function chain0_1_policy_engine_GIPipe<A, B>(a: A, fn: (a: A) => B): B;
export function chain0_1_policy_engine_GIPipe<A, B, C>(a: A, fn1: (a: A) => B, fn2: (b: B) => C): C;
export function chain0_1_policy_engine_GIPipe<A, B, C, D>(a: A, fn1: (a: A) => B, fn2: (b: B) => C, fn3: (c: C) => D): D;
export function chain0_1_policy_engine_GIPipe(a: unknown, ...fns: Array<(x: unknown) => unknown>): unknown {
  return fns.reduce((acc, fn) => fn(acc), a);
}

export const chain0_1_policy_engine_GIResults = {
  r0: chain0_1_policy_engine_GITransform<number, string, boolean>(0, (n) => String(n), (s) => s.length > 0),
  r1: chain0_1_policy_engine_GITransform<number, string, boolean>(1, (n) => String(n), (s) => s.length > 0),
  r2: chain0_1_policy_engine_GITransform<number, string, boolean>(2, (n) => String(n), (s) => s.length > 0),
  r3: chain0_1_policy_engine_GITransform<number, string, boolean>(3, (n) => String(n), (s) => s.length > 0),
  r4: chain0_1_policy_engine_GITransform<number, string, boolean>(4, (n) => String(n), (s) => s.length > 0),
  r5: chain0_1_policy_engine_GITransform<number, string, boolean>(5, (n) => String(n), (s) => s.length > 0),
  r6: chain0_1_policy_engine_GITransform<number, string, boolean>(6, (n) => String(n), (s) => s.length > 0),
  r7: chain0_1_policy_engine_GITransform<number, string, boolean>(7, (n) => String(n), (s) => s.length > 0),
  r8: chain0_1_policy_engine_GITransform<number, string, boolean>(8, (n) => String(n), (s) => s.length > 0),
  r9: chain0_1_policy_engine_GITransform<number, string, boolean>(9, (n) => String(n), (s) => s.length > 0),
  r10: chain0_1_policy_engine_GITransform<number, string, boolean>(10, (n) => String(n), (s) => s.length > 0),
  r11: chain0_1_policy_engine_GITransform<number, string, boolean>(11, (n) => String(n), (s) => s.length > 0),
  r12: chain0_1_policy_engine_GITransform<number, string, boolean>(12, (n) => String(n), (s) => s.length > 0),
  r13: chain0_1_policy_engine_GITransform<number, string, boolean>(13, (n) => String(n), (s) => s.length > 0),
  r14: chain0_1_policy_engine_GITransform<number, string, boolean>(14, (n) => String(n), (s) => s.length > 0),
  r15: chain0_1_policy_engine_GITransform<number, string, boolean>(15, (n) => String(n), (s) => s.length > 0),
  r16: chain0_1_policy_engine_GITransform<number, string, boolean>(16, (n) => String(n), (s) => s.length > 0),
  r17: chain0_1_policy_engine_GITransform<number, string, boolean>(17, (n) => String(n), (s) => s.length > 0),
  r18: chain0_1_policy_engine_GITransform<number, string, boolean>(18, (n) => String(n), (s) => s.length > 0),
  r19: chain0_1_policy_engine_GITransform<number, string, boolean>(19, (n) => String(n), (s) => s.length > 0),
} as const;

