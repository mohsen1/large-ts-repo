import { ObservableCell } from './decorators';
import { createDeferred } from './modern';

export const StringCell = ObservableCell<string>;
export const NumberCell = ObservableCell<number>;
export const DateCell = ObservableCell<Date>;

export const StringSet = Set<string>;
export const StringNumberMap = Map<string, number>;

export const createStringDeferred = createDeferred<string>;
export const createNumberDeferred = createDeferred<number>;
